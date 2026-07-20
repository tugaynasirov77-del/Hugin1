import type { Bot } from 'grammy';
import { InlineKeyboard, InputFile } from 'grammy';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db } from './db.js';
import { texts } from './texts.js';

const DAY = 24 * 60 * 60 * 1000;
const INACTIVE_DAYS = 7;

const NUDGE_IMAGE = fileURLToPath(new URL('../assets/hugin-nudge.png', import.meta.url));

/**
 * Возврат по неактивности: пользователи с активным курсом,
 * не заходившие 7+ дней и не получавшие напоминалку 7+ дней.
 * Ссылается на приложение (в MVP — общий deep-link; позже — конкретный блок).
 */
export async function sendReminders(bot: Bot): Promise<number> {
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * DAY).toISOString();

  const { data, error } = await db
    .from('users')
    .select('id, tg_id')
    .eq('state', 'active')
    .lt('last_active', cutoff)
    .or(`last_nudge_at.is.null,last_nudge_at.lt.${cutoff}`);

  if (error) {
    console.error('sendReminders query error', error);
    return 0;
  }

  const keyboard = config.hasMiniApp
    ? new InlineKeyboard().webApp('Продолжить', config.miniAppUrl)
    : new InlineKeyboard().url('Продолжить', config.miniAppUrl);
  const hasImage = existsSync(NUDGE_IMAGE);
  let sent = 0;

  for (const u of data ?? []) {
    try {
      if (hasImage) {
        await bot.api.sendPhoto(u.tg_id, new InputFile(NUDGE_IMAGE), {
          caption: texts.nudge,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } else {
        await bot.api.sendMessage(u.tg_id, texts.nudge, { parse_mode: 'HTML', reply_markup: keyboard });
      }
      await db.from('users').update({ last_nudge_at: new Date().toISOString() }).eq('id', u.id);
      sent++;
    } catch (e) {
      console.error(`reminder: не доставлено ${u.tg_id}`, e);
    }
  }

  console.log(`reminders: отправлено ${sent}`);
  return sent;
}

/** Простой планировщик: проверяет раз в сутки. */
export function startReminderCron(bot: Bot) {
  setInterval(() => {
    void sendReminders(bot);
  }, DAY);
}

import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import {
  getOrCreateFillingStream,
  upsertUser,
  joinStream,
  streamMembers,
  db,
} from './db.js';
import { texts } from './texts.js';
import { startReminderCron } from './reminders.js';

export const bot = new Bot(config.botToken);

/** Кнопка в приложение: web_app при готовом Mini App, иначе обычная ссылка. */
function appButton(label: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  return config.hasMiniApp ? kb.webApp(label, config.miniAppUrl) : kb.url(label, config.miniAppUrl);
}

/** Разбор реферального payload из /start (deep-link ?start=ref_<tgId>). */
function parseReferrer(payload: string | undefined): number | null {
  if (!payload) return null;
  const m = payload.match(/^ref_(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** Клавиатура потока: канал + приглашение друга (share-ссылка с рефералом). */
function streamKeyboard(botUsername: string, tgId: number): InlineKeyboard {
  const refLink = `https://t.me/${botUsername}?start=ref_${tgId}`;
  const share = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(
    'Залетай в HUGIN — знания о нейросетях, просто и по делу 🪶',
  )}`;
  return new InlineKeyboard()
    .url('Канал HUGIN', `https://t.me/${config.channelUsername}`)
    .row()
    .url('Пригласить друга', share);
}

// Картинки-маскоты (положить файлы сюда).
const WELCOME_IMAGE = fileURLToPath(new URL('../assets/hugin-welcome.png', import.meta.url));
const ACCESS_IMAGE = fileURLToPath(new URL('../assets/hugin-access.png', import.meta.url));

bot.command('start', async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const refTgId = parseReferrer(ctx.match?.toString());
  let referredBy: number | null = null;
  if (refTgId && refTgId !== from.id) {
    const { data } = await db.from('users').select('id').eq('tg_id', refTgId).maybeSingle();
    referredBy = data?.id ?? null;
  }

  const user = await upsertUser({
    tg_id: from.id,
    username: from.username,
    first_name: from.first_name,
    referred_by: referredBy,
  });

  const me = await bot.api.getMe();

  // Уже в потоке — повторно не записываем.
  if (user.state === 'in_stream' && user.stream_id && user.seat) {
    const { data: s } = await db.from('streams').select('*').eq('id', user.stream_id).single();
    await ctx.reply(texts.alreadyInStreamCard(s!.number, user.seat, s!.size), {
      parse_mode: 'HTML',
      reply_markup: streamKeyboard(me.username, from.id),
    });
    return;
  }

  // Активный курс — сразу в приложение.
  if (user.state === 'active') {
    await ctx.reply('Твоё обучение открыто.', {
      reply_markup: appButton('Открыть HUGIN'),
    });
    return;
  }

  // Новый / между потоками → запись в набирающийся поток.
  const stream = await getOrCreateFillingStream();
  const { seat, became_full } = await joinStream(user.id, stream.id);

  const caption = texts.joinedCard(from.first_name, stream.number, seat, stream.size);
  const keyboard = streamKeyboard(me.username, from.id);
  if (existsSync(WELCOME_IMAGE)) {
    await ctx.replyWithPhoto(new InputFile(WELCOME_IMAGE), {
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(caption, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  if (became_full) {
    await notifyStreamFull(stream.id);
  }
});

/** Рассылка всей когорте, когда поток набрался: доступ в приложение. */
export async function notifyStreamFull(streamId: number) {
  const members = await streamMembers(streamId);
  const keyboard = appButton('Открыть HUGIN');
  const { data: s } = await db.from('streams').select('number').eq('id', streamId).single();
  const text = texts.streamFull(s?.number ?? 0);

  const hasImage = existsSync(ACCESS_IMAGE);

  for (const tgId of members) {
    try {
      if (hasImage) {
        await bot.api.sendPhoto(tgId, new InputFile(ACCESS_IMAGE), {
          caption: text,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        });
      } else {
        await bot.api.sendMessage(tgId, text, { parse_mode: 'HTML', reply_markup: keyboard });
      }
    } catch (e) {
      console.error(`notifyStreamFull: не доставлено ${tgId}`, e);
    }
  }

  await db.from('streams').update({ status: 'started', started_at: new Date().toISOString() }).eq('id', streamId);
  await db.from('users').update({ state: 'active' }).eq('stream_id', streamId);
}

bot.catch((err) => {
  console.error('Bot error:', err.error);
});

startReminderCron(bot);

bot.start({
  onStart: (me) => console.log(`HUGIN bot @${me.username} запущен`),
});

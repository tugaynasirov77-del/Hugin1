import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  // Пока Mini App не готов — заглушка на канал.
  miniAppUrl: process.env.MINI_APP_URL || `https://t.me/${process.env.CHANNEL_USERNAME ?? 'hey_hugin'}`,
  // Готов ли настоящий Mini App (влияет на тип кнопки: web_app vs обычная ссылка).
  hasMiniApp: Boolean(process.env.MINI_APP_URL),
  channelUsername: process.env.CHANNEL_USERNAME ?? 'hey_hugin',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  streamSize: Number(process.env.STREAM_SIZE ?? 30),
  cronSecret: process.env.CRON_SECRET ?? '',
};

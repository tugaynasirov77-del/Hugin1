// Утверждённые тексты HUGIN (см. бриф, п.10). Тон — минимальный, стиль INK.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const texts = {
  // Одно сообщение при записи в поток (parse_mode: HTML).
  joinedCard: (firstName: string | undefined, streamNumber: number, seat: number, size: number) =>
    `✨ <b>${firstName ? esc(firstName) + ', ты' : 'Ты'} в потоке HUGIN</b>\n\n` +
    `Научу пользоваться нейросетями под твои задачи — после обучения будешь применять их уверенно и с пользой.\n\n` +
    `🎫 <b>Поток ${streamNumber} · твоё место #${seat} из ${size}</b>\n` +
    `🚀 Старт, когда группа соберётся полностью — все начинают обучение одновременно.\n\n` +
    `Хочешь начать раньше? Пригласи друга — оба поднимитесь в очереди.`,

  // Одно сообщение для тех, кто уже в потоке.
  alreadyInStreamCard: (streamNumber: number, seat: number, size: number) =>
    `🎫 <b>Ты уже в потоке ${streamNumber} · место #${seat} из ${size}</b>\n\n` +
    `Жди старта — сообщу в канале и здесь. Пригласи друга, чтобы продвинуться быстрее.`,

  streamFull: (streamNumber: number) =>
    `🚀 <b>Поток ${streamNumber} собрался — стартуем!</b>\n\n` +
    `Группа набралась полностью. Открываю тебе доступ — заходи и начинай обучение.`,

  nudge:
    `🪶 <b>HUGIN давно тебя не видел</b>\n\n` +
    `Твоё обучение на паузе. Вернись — продолжишь с того места, где остановился, это пара минут.`,
};

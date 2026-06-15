const ALLOWED_IDS = new Set(
  (process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter(Boolean)
);

if (ALLOWED_IDS.size === 0) {
  console.warn('[auth] ALLOWED_USER_IDS не задан — бот доступен всем!');
}

module.exports = async function authMiddleware(ctx, next) {
  const userId = ctx.from?.id;
  if (ALLOWED_IDS.size > 0 && !ALLOWED_IDS.has(userId)) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Нет доступа');
    } else {
      await ctx.reply('Нет доступа');
    }
    return;
  }
  return next();
};

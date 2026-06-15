const { getStats, getDisplayMonthName } = require('../services/sheets');
const { MAIN_MENU } = require('../services/keyboards');

async function handleStats(ctx) {
  await ctx.sendChatAction('typing');

  let stats;
  try {
    stats = await getStats();
  } catch (err) {
    console.error('getStats error:', err.message);
    await ctx.reply(`Не удалось загрузить статистику.\n${err.message}`);
    return ctx.reply('Выбери действие:', MAIN_MENU);
  }

  const monthName = getDisplayMonthName();

  const { items, balance } = stats;

  if (items.length === 0) {
    await ctx.reply(`За ${monthName} данных пока нет.`);
    return ctx.reply('Выбери действие:', MAIN_MENU);
  }

  const grandTotal = items.reduce((sum, s) => sum + s.total, 0);

  let msg = `📊 *Расходы за ${monthName}:*\n\n`;
  for (const { name, total } of items) {
    msg += `• ${name}: ${total.toFixed(2)} zł\n`;
  }
  msg += `\n*Итого: ${grandTotal.toFixed(2)} zł*`;
  if (balance != null) {
    msg += `\n\n*Остаток в этом месяце: ${balance.toFixed(2)} zł*`;
  }

  await ctx.reply(msg, { parse_mode: 'Markdown' });
  await ctx.reply('Выбери следующее действие:', MAIN_MENU);
}

module.exports = { handleStats };

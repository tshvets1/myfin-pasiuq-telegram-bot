require('dotenv').config();
const { Telegraf } = require('telegraf');
const http = require('http');
const { handleAddStart, handleCategoryCallback, handleAmountInput } = require('./handlers/add');
const { handleStats } = require('./handlers/stats');
const { getState } = require('./services/state');
const { MAIN_MENU } = require('./services/keyboards');
const authMiddleware = require('./middleware/auth');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
bot.use(authMiddleware);

bot.start((ctx) => ctx.reply('Привет! Выбери действие:', MAIN_MENU));
bot.command('menu', (ctx) => ctx.reply('Выбери действие:', MAIN_MENU));

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (data === 'action:add') {
    await ctx.answerCbQuery();
    await handleAddStart(ctx);
  } else if (data === 'action:stats') {
    await ctx.answerCbQuery();
    await handleStats(ctx);
  } else if (data?.startsWith('cat:')) {
    await handleCategoryCallback(ctx);
  }
});

bot.on('text', async (ctx) => {
  const userState = getState(ctx.from.id);
  if (userState.step === 'awaiting_amount') {
    await handleAmountInput(ctx);
  }
});

bot.launch();
console.log('Bot started');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => {
  console.log(`Health check server on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
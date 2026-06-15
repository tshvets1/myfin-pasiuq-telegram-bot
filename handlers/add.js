const { getCategories, addExpense } = require('../services/sheets');
const { getState, setState, clearState } = require('../services/state');
const { MAIN_MENU } = require('../services/keyboards');

async function handleAddStart(ctx) {
  const userId = ctx.from.id;
  await ctx.sendChatAction('typing');

  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    console.error('getCategories error:', err.message);
    return ctx.reply('Не удалось загрузить категории. Проверь подключение к таблице.');
  }

  if (categories.length === 0) {
    return ctx.reply('Категории не найдены в текущем месяце. Убедись, что вкладка с нужным месяцем существует.');
  }

  setState(userId, { step: 'awaiting_category', categories });

  const keyboard = categories.map((c, i) => [
    { text: c.name, callback_data: `cat:${i}` },
  ]);

  await ctx.reply('Выбери категорию:', {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function handleCategoryCallback(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getState(userId);

  if (userState.step !== 'awaiting_category') {
    return ctx.reply('Начни заново:', MAIN_MENU);
  }

  const idx = parseInt(ctx.callbackQuery.data.split(':')[1], 10);
  const category = userState.categories[idx];

  if (!category) {
    return ctx.reply('Что-то пошло не так. Попробуй снова.', MAIN_MENU);
  }

  setState(userId, {
    step: 'awaiting_amount',
    rowIndex: category.rowIndex,
    categoryName: category.name,
  });

  await ctx.editMessageText(`Категория: *${category.name}*`, { parse_mode: 'Markdown' });
  await ctx.reply('Введи сумму (например: 45.50):');
}

async function handleAmountInput(ctx) {
  const userId = ctx.from.id;
  const userState = getState(userId);

  const text = ctx.message.text.trim().replace(',', '.');
  const amount = parseFloat(text);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Введи корректную сумму, например: 45.50');
  }

  await ctx.sendChatAction('typing');

  try {
    await addExpense(userState.rowIndex, amount);
    clearState(userId);
    await ctx.reply(
      `✅ Записано: ${amount} zł в категорию *${userState.categoryName}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('addExpense error:', err.message);
    clearState(userId);
    await ctx.reply('Не удалось записать трату. Попробуй снова.');
  }

  await ctx.reply('Выбери следующее действие:', MAIN_MENU);
}

module.exports = { handleAddStart, handleCategoryCallback, handleAmountInput };

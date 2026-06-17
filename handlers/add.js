const { getCategories, addExpense } = require('../services/sheets');
const { getState, setState, clearState } = require('../services/state');
const { MAIN_MENU } = require('../services/keyboards');
const { CURRENCIES, getRate } = require('../services/currency');

const CURRENCY_TYPE_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '💵 В злотых (PLN)', callback_data: 'currency_type:pln' },
      { text: '💱 Иностранная валюта', callback_data: 'currency_type:foreign' },
    ],
  ],
};

const FOREIGN_CURRENCY_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '€ EUR', callback_data: 'foreign_currency:EUR' },
      { text: '$ USD', callback_data: 'foreign_currency:USD' },
      { text: 'Br BYN', callback_data: 'foreign_currency:BYN' },
    ],
  ],
};

async function handleAddStart(ctx) {
  const userId = ctx.from.id;
  setState(userId, { step: 'awaiting_currency_type' });
  await ctx.reply('Добавить трату:', { reply_markup: CURRENCY_TYPE_KEYBOARD });
}

async function loadCategoriesAndShowKeyboard(ctx, userId) {
  await ctx.sendChatAction('typing');

  let categories;
  try {
    categories = await getCategories();
  } catch (err) {
    console.error('getCategories error:', err.message);
    clearState(userId);
    return ctx.reply('Не удалось загрузить категории. Проверь подключение к таблице.', MAIN_MENU);
  }

  if (categories.length === 0) {
    clearState(userId);
    return ctx.reply('Категории не найдены в текущем месяце.', MAIN_MENU);
  }

  const state = getState(userId);
  setState(userId, { ...state, step: 'awaiting_category', categories });

  const keyboard = categories.map((c, i) => [
    { text: c.name, callback_data: `cat:${i}` },
  ]);

  await ctx.reply('Выбери категорию:', { reply_markup: { inline_keyboard: keyboard } });
}

async function handleCurrencyTypeCallback(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getState(userId);

  if (userState.step !== 'awaiting_currency_type') {
    return ctx.reply('Начни заново:', MAIN_MENU);
  }

  const type = ctx.callbackQuery.data.split(':')[1];

  if (type === 'pln') {
    setState(userId, { step: 'awaiting_category', currency: 'PLN' });
    await ctx.editMessageText('Валюта: *PLN (złoty)*', { parse_mode: 'Markdown' });
    await loadCategoriesAndShowKeyboard(ctx, userId);
  } else {
    setState(userId, { step: 'awaiting_foreign_currency' });
    await ctx.editMessageText('Выбери валюту:', { reply_markup: FOREIGN_CURRENCY_KEYBOARD });
  }
}

async function handleForeignCurrencyCallback(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getState(userId);

  if (userState.step !== 'awaiting_foreign_currency') {
    return ctx.reply('Начни заново:', MAIN_MENU);
  }

  const currency = ctx.callbackQuery.data.split(':')[1];
  const { symbol } = CURRENCIES[currency];

  setState(userId, { step: 'awaiting_category', currency });
  await ctx.editMessageText(`Валюта: *${symbol} ${currency}*`, { parse_mode: 'Markdown' });
  await loadCategoriesAndShowKeyboard(ctx, userId);
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

  const currency = userState.currency || 'PLN';
  const currencyLabel = currency === 'PLN' ? 'zł' : `${CURRENCIES[currency].symbol} ${currency}`;

  setState(userId, {
    ...userState,
    step: 'awaiting_amount',
    rowIndex: category.rowIndex,
    categoryName: category.name,
  });

  await ctx.editMessageText(`Категория: *${category.name}*`, { parse_mode: 'Markdown' });
  await ctx.reply(`Введи сумму в ${currencyLabel} (например: 45.50):`);
}

async function handleAmountInput(ctx) {
  const userId = ctx.from.id;
  const userState = getState(userId);

  const text = ctx.message.text.trim().replace(',', '.');
  const amount = parseFloat(text);

  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('Введи корректную сумму, например: 45.50');
  }

  const currency = userState.currency || 'PLN';

  if (currency === 'PLN') {
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
    return;
  }

  await ctx.sendChatAction('typing');

  let rate;
  try {
    rate = await getRate(currency);
  } catch (err) {
    console.error('getRate error:', err.message);
    return ctx.reply('Не удалось получить курс валют. Попробуй снова.');
  }

  const plnAmount = Math.round(amount * rate * 100) / 100;
  const { symbol } = CURRENCIES[currency];

  setState(userId, {
    ...userState,
    step: 'awaiting_conversion_confirm',
    foreignAmount: amount,
    rate,
    plnAmount,
  });

  const confirmKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Подтвердить', callback_data: 'conversion:confirm' },
        { text: '❌ Отменить', callback_data: 'conversion:cancel' },
      ],
    ],
  };

  await ctx.reply(
    `Категория: *${userState.categoryName}*\n` +
    `Сумма: *${amount} ${symbol} ${currency}*\n\n` +
    `Курс NBP: 1 ${currency} = ${rate} zł\n` +
    `Итого: ${amount} × ${rate} = *${plnAmount} zł*\n\n` +
    `Записать *${plnAmount} zł*?`,
    { parse_mode: 'Markdown', reply_markup: confirmKeyboard }
  );
}

async function handleConversionConfirmCallback(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const userState = getState(userId);

  if (userState.step !== 'awaiting_conversion_confirm') {
    return ctx.reply('Начни заново:', MAIN_MENU);
  }

  const action = ctx.callbackQuery.data.split(':')[1];

  if (action === 'cancel') {
    clearState(userId);
    await ctx.editMessageText('❌ Запись отменена.');
    await ctx.reply('Выбери следующее действие:', MAIN_MENU);
    return;
  }

  await ctx.sendChatAction('typing');

  try {
    await addExpense(userState.rowIndex, userState.plnAmount);
    clearState(userId);
    const { symbol } = CURRENCIES[userState.currency];
    await ctx.editMessageText(
      `✅ Записано: ${userState.foreignAmount} ${symbol} ${userState.currency} → *${userState.plnAmount} zł* в категорию *${userState.categoryName}*`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('addExpense error:', err.message);
    clearState(userId);
    await ctx.reply('Не удалось записать трату. Попробуй снова.');
  }

  await ctx.reply('Выбери следующее действие:', MAIN_MENU);
}

module.exports = {
  handleAddStart,
  handleCurrencyTypeCallback,
  handleForeignCurrencyCallback,
  handleCategoryCallback,
  handleAmountInput,
  handleConversionConfirmCallback,
};

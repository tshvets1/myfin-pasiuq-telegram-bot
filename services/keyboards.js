const { Markup } = require('telegraf');

const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('➕ Добавить трату', 'action:add')],
  [Markup.button.callback('📊 Посмотреть результат', 'action:stats')],
]);

module.exports = { MAIN_MENU };

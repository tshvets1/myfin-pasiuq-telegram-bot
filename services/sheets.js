const { google } = require('googleapis');

// Имена месяцев в нижнем регистре — сравниваем с именами листов без учёта регистра
const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

const SUM_COLUMN = 30; // AD

let _sheets = null;
let _resolvedSheet = null; // { month: number, name: string }

function getSheets() {
  if (_sheets) return _sheets;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

function colToLetter(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// Ищем лист без учёта регистра, кешируем на текущий месяц
async function resolveSheetName() {
  const monthIdx = new Date().getMonth();
  if (_resolvedSheet?.month === monthIdx) return _resolvedSheet.name;

  const sheets = getSheets();
  const expected = MONTH_NAMES[monthIdx];

  const res = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  });

  const match = res.data.sheets
    .map((s) => s.properties.title)
    .find((title) => title.toLowerCase() === expected);

  if (!match) {
    const available = res.data.sheets.map((s) => s.properties.title).join(', ');
    throw new Error(`Лист "${expected}" не найден. Доступные листы: ${available}`);
  }

  _resolvedSheet = { month: monthIdx, name: match };
  return match;
}

// Для отображения пользователю: "Июнь"
function getDisplayMonthName() {
  const name = MONTH_NAMES[new Date().getMonth()];
  return name[0].toUpperCase() + name.slice(1);
}

async function getCategories() {
  const sheets = getSheets();
  const sheet = await resolveSheetName();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${sheet}!B:B`,
  });
  const rows = res.data.values || [];
  return rows
    .map((row, i) => ({ name: row[0], rowIndex: i + 1 }))
    .filter((c) => c.name && c.name.trim() !== '');
}

async function addExpense(rowIndex, amount) {
  const sheets = getSheets();
  const sheet = await resolveSheetName();
  const lastDataColLetter = colToLetter(SUM_COLUMN - 1); // AC

  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${sheet}!C${rowIndex}:${lastDataColLetter}${rowIndex}`,
  });
  const existing = readRes.data.values?.[0] ?? [];

  // C = колонка 3, первая пустая = 3 + сколько уже заполнено
  const targetCol = colToLetter(3 + existing.length);
  const targetRange = `${sheet}!${targetCol}${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: targetRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[amount]] },
  });
}

async function getStats() {
  const sheets = getSheets();
  const sheet = await resolveSheetName();
  const sumColLetter = colToLetter(SUM_COLUMN); // AD

  const catRes = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: `${sheet}!B:B`,
  });
  const rows = catRes.data.values || [];
  const categories = rows
    .map((row, i) => ({ name: row[0], rowIndex: i + 1 }))
    .filter((c) => c.name && c.name.trim() !== '');

  if (categories.length === 0) return { items: [], balance: null };

  const lastRow = categories[categories.length - 1].rowIndex;
  const balanceRow = lastRow + 3;

  const ranges = [
    ...categories.map((c) => `${sheet}!${sumColLetter}${c.rowIndex}`),
    `${sheet}!${sumColLetter}${balanceRow}`,
  ];
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.SPREADSHEET_ID,
    ranges,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const items = categories.map((cat, i) => {
    const raw = batchRes.data.valueRanges[i]?.values?.[0]?.[0];
    const total = parseFloat(String(raw).replace(',', '.')) || 0;
    return { name: cat.name, total };
  });

  const balanceRange = batchRes.data.valueRanges[categories.length];
  const balanceRaw = balanceRange?.values?.[0]?.[0];
  console.log(`[getStats] balanceRow=${balanceRow}, balanceRaw=${JSON.stringify(balanceRaw)}, rangesCount=${batchRes.data.valueRanges.length}`);
  const balance = balanceRaw != null ? parseFloat(String(balanceRaw).replace(',', '.')) : null;

  return { items, balance };
}

module.exports = { getCategories, addExpense, getStats, getDisplayMonthName };

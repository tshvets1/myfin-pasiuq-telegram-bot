const CURRENCIES = {
  EUR: { table: 'a', name: 'евро', symbol: '€' },
  USD: { table: 'a', name: 'доллар США', symbol: '$' },
  BYN: { table: 'b', name: 'белорусский рубль', symbol: 'Br' },
};

async function getRate(currencyCode) {
  const { table } = CURRENCIES[currencyCode];
  const url = `https://api.nbp.pl/api/exchangerates/rates/${table}/${currencyCode}/?format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`NBP API error ${res.status} for ${currencyCode}`);

  const data = await res.json();
  return data.rates[0].mid;
}

module.exports = { CURRENCIES, getRate };

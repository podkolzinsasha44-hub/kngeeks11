// [FIFA code, ISO-2 (for the flag), English name as used by the data sources, Russian name]
export const COUNTRIES = [
  ['RUS', 'RU', 'Russia', 'Россия'], ['ESP', 'ES', 'Spain', 'Испания'], ['ARG', 'AR', 'Argentina', 'Аргентина'], ['ENG', 'GB-ENG', 'England', 'Англия'],
  ['FRA', 'FR', 'France', 'Франция'], ['BRA', 'BR', 'Brazil', 'Бразилия'], ['GER', 'DE', 'Germany', 'Германия'], ['POR', 'PT', 'Portugal', 'Португалия'],
  ['NED', 'NL', 'Netherlands', 'Нидерланды'], ['ITA', 'IT', 'Italy', 'Италия'], ['BEL', 'BE', 'Belgium', 'Бельгия'], ['CRO', 'HR', 'Croatia', 'Хорватия'],
  ['URU', 'UY', 'Uruguay', 'Уругвай'], ['COL', 'CO', 'Colombia', 'Колумбия'], ['MAR', 'MA', 'Morocco', 'Марокко'], ['USA', 'US', 'United States', 'США'],
  ['MEX', 'MX', 'Mexico', 'Мексика'], ['SUI', 'CH', 'Switzerland', 'Швейцария'], ['JPN', 'JP', 'Japan', 'Япония'], ['SEN', 'SN', 'Senegal', 'Сенегал'],
  ['DEN', 'DK', 'Denmark', 'Дания'], ['IRN', 'IR', 'Iran', 'Иран'], ['KOR', 'KR', 'South Korea', 'Южная Корея'], ['AUS', 'AU', 'Australia', 'Австралия'],
  ['AUT', 'AT', 'Austria', 'Австрия'], ['UKR', 'UA', 'Ukraine', 'Украина'], ['TUR', 'TR', 'Turkey', 'Турция'], ['ECU', 'EC', 'Ecuador', 'Эквадор'],
  ['SWE', 'SE', 'Sweden', 'Швеция'], ['POL', 'PL', 'Poland', 'Польша'], ['WAL', 'GB-WLS', 'Wales', 'Уэльс'], ['SRB', 'RS', 'Serbia', 'Сербия'],
  ['EGY', 'EG', 'Egypt', 'Египет'], ['NGA', 'NG', 'Nigeria', 'Нигерия'], ['CZE', 'CZ', 'Czech Republic', 'Чехия'], ['SCO', 'GB-SCT', 'Scotland', 'Шотландия'],
  ['HUN', 'HU', 'Hungary', 'Венгрия'], ['NOR', 'NO', 'Norway', 'Норвегия'], ['ALG', 'DZ', 'Algeria', 'Алжир'], ['TUN', 'TN', 'Tunisia', 'Тунис'],
  ['CMR', 'CM', 'Cameroon', 'Камерун'], ['CAN', 'CA', 'Canada', 'Канада'], ['CIV', 'CI', "Cote d'Ivoire", 'Кот-д’Ивуар'], ['GHA', 'GH', 'Ghana', 'Гана'],
  ['PAR', 'PY', 'Paraguay', 'Парагвай'], ['CHI', 'CL', 'Chile', 'Чили'], ['PER', 'PE', 'Peru', 'Перу'], ['VEN', 'VE', 'Venezuela', 'Венесуэла'],
  ['GRE', 'GR', 'Greece', 'Греция'], ['ROU', 'RO', 'Romania', 'Румыния'], ['SVK', 'SK', 'Slovakia', 'Словакия'], ['SVN', 'SI', 'Slovenia', 'Словения'],
  ['IRL', 'IE', 'Ireland', 'Ирландия'], ['NIR', 'GB-NIR', 'Northern Ireland', 'Северная Ирландия'], ['FIN', 'FI', 'Finland', 'Финляндия'], ['ISL', 'IS', 'Iceland', 'Исландия'],
  ['BIH', 'BA', 'Bosnia-Herzegovina', 'Босния и Герцеговина'], ['MNE', 'ME', 'Montenegro', 'Черногория'], ['MKD', 'MK', 'North Macedonia', 'Северная Македония'], ['ALB', 'AL', 'Albania', 'Албания'],
  ['KOS', 'XK', 'Kosovo', 'Косово'], ['BUL', 'BG', 'Bulgaria', 'Болгария'], ['GEO', 'GE', 'Georgia', 'Грузия'], ['ARM', 'AM', 'Armenia', 'Армения'],
  ['AZE', 'AZ', 'Azerbaijan', 'Азербайджан'], ['BLR', 'BY', 'Belarus', 'Беларусь'], ['KAZ', 'KZ', 'Kazakhstan', 'Казахстан'], ['UZB', 'UZ', 'Uzbekistan', 'Узбекистан'],
  ['MDA', 'MD', 'Moldova', 'Молдова'], ['LVA', 'LV', 'Latvia', 'Латвия'], ['LTU', 'LT', 'Lithuania', 'Литва'], ['EST', 'EE', 'Estonia', 'Эстония'],
  ['ISR', 'IL', 'Israel', 'Израиль'], ['CYP', 'CY', 'Cyprus', 'Кипр'], ['LUX', 'LU', 'Luxembourg', 'Люксембург'], ['KSA', 'SA', 'Saudi Arabia', 'Саудовская Аравия'],
  ['QAT', 'QA', 'Qatar', 'Катар'], ['UAE', 'AE', 'United Arab Emirates', 'ОАЭ'], ['IRQ', 'IQ', 'Iraq', 'Ирак'], ['JOR', 'JO', 'Jordan', 'Иордания'],
  ['CHN', 'CN', 'China', 'Китай'], ['NZL', 'NZ', 'New Zealand', 'Новая Зеландия'], ['RSA', 'ZA', 'South Africa', 'ЮАР'], ['MLI', 'ML', 'Mali', 'Мали'],
  ['BFA', 'BF', 'Burkina Faso', 'Буркина-Фасо'], ['GUI', 'GN', 'Guinea', 'Гвинея'], ['COD', 'CD', 'DR Congo', 'ДР Конго'], ['CGO', 'CG', 'Congo', 'Конго'],
  ['GAB', 'GA', 'Gabon', 'Габон'], ['CPV', 'CV', 'Cape Verde', 'Кабо-Верде'], ['ANG', 'AO', 'Angola', 'Ангола'], ['ZAM', 'ZM', 'Zambia', 'Замбия'],
  ['ZIM', 'ZW', 'Zimbabwe', 'Зимбабве'], ['GAM', 'GM', 'The Gambia', 'Гамбия'], ['TOG', 'TG', 'Togo', 'Того'], ['BEN', 'BJ', 'Benin', 'Бенин'],
  ['EQG', 'GQ', 'Equatorial Guinea', 'Экваториальная Гвинея'], ['GNB', 'GW', 'Guinea-Bissau', 'Гвинея-Бисау'], ['MOZ', 'MZ', 'Mozambique', 'Мозамбик'], ['KEN', 'KE', 'Kenya', 'Кения'],
  ['UGA', 'UG', 'Uganda', 'Уганда'], ['TAN', 'TZ', 'Tanzania', 'Танзания'], ['SLE', 'SL', 'Sierra Leone', 'Сьерра-Леоне'], ['LBR', 'LR', 'Liberia', 'Либерия'],
  ['LBY', 'LY', 'Libya', 'Ливия'], ['MTN', 'MR', 'Mauritania', 'Мавритания'], ['CTA', 'CF', 'Central African Republic', 'ЦАР'], ['COM', 'KM', 'Comoros', 'Коморы'],
  ['MAD', 'MG', 'Madagascar', 'Мадагаскар'], ['HAI', 'HT', 'Haiti', 'Гаити'], ['JAM', 'JM', 'Jamaica', 'Ямайка'], ['CRC', 'CR', 'Costa Rica', 'Коста-Рика'],
  ['PAN', 'PA', 'Panama', 'Панама'], ['HON', 'HN', 'Honduras', 'Гондурас'], ['SLV', 'SV', 'El Salvador', 'Сальвадор'], ['GUA', 'GT', 'Guatemala', 'Гватемала'],
  ['CUW', 'CW', 'Curacao', 'Кюрасао'], ['SUR', 'SR', 'Suriname', 'Суринам'], ['TRI', 'TT', 'Trinidad and Tobago', 'Тринидад и Тобаго'], ['BOL', 'BO', 'Bolivia', 'Боливия'],
  ['DOM', 'DO', 'Dominican Republic', 'Доминиканская Республика'], ['CUB', 'CU', 'Cuba', 'Куба'], ['KGZ', 'KG', 'Kyrgyzstan', 'Киргизия'], ['TJK', 'TJ', 'Tajikistan', 'Таджикистан'],
  ['TKM', 'TM', 'Turkmenistan', 'Туркменистан'], ['SYR', 'SY', 'Syria', 'Сирия'], ['LBN', 'LB', 'Lebanon', 'Ливан'], ['PLE', 'PS', 'Palestine', 'Палестина'],
  ['IDN', 'ID', 'Indonesia', 'Индонезия'], ['THA', 'TH', 'Thailand', 'Таиланд'], ['VIE', 'VN', 'Vietnam', 'Вьетнам'], ['PHI', 'PH', 'Philippines', 'Филиппины'],
  ['IND', 'IN', 'India', 'Индия'], ['MLT', 'MT', 'Malta', 'Мальта'], ['FRO', 'FO', 'Faroe Islands', 'Фарерские острова'], ['AND', 'AD', 'Andorra', 'Андорра'],
  ['NAM', 'NA', 'Namibia', 'Намибия'], ['BDI', 'BI', 'Burundi', 'Бурунди'], ['RWA', 'RW', 'Rwanda', 'Руанда'], ['SDN', 'SD', 'Sudan', 'Судан'],
  ['ETH', 'ET', 'Ethiopia', 'Эфиопия'], ['NIG', 'NE', 'Niger', 'Нигер'], ['CHA', 'TD', 'Chad', 'Чад'], ['MWI', 'MW', 'Malawi', 'Малави'],
];

/** Other spellings met in the sources. */
export const ALIASES = {
  'Korea, South': 'KOR', 'Korea Republic': 'KOR', 'Republic of Korea': 'KOR', 'Türkiye': 'TUR', 'Turkiye': 'TUR', 'Czechia': 'CZE', 'Ivory Coast': 'CIV', "Côte d'Ivoire": 'CIV',
  'Bosnia and Herzegovina': 'BIH', 'USA': 'USA', 'United States of America': 'USA', 'Cabo Verde': 'CPV', 'Curaçao': 'CUW', 'Democratic Republic of the Congo': 'COD',
  'Republic of Ireland': 'IRL', 'IR Iran': 'IRN', 'Gambia': 'GAM', 'Congo DR': 'COD', 'DR Congo': 'COD', 'Republic of the Congo': 'CGO', 'Macedonia': 'MKD',
  'China PR': 'CHN', 'Netherlands Antilles': 'CUW', 'Swaziland': 'SWZ', 'Eswatini': 'SWZ', 'Guinea-Bissau': 'GNB', 'Bosnia': 'BIH', 'UAE': 'UAE',
};

const byName = new Map(COUNTRIES.map((c) => [c[2].toLowerCase(), c[0]]));
for (const [k, v] of Object.entries(ALIASES)) byName.set(k.toLowerCase(), v);
const codes = new Set(COUNTRIES.map((c) => c[0]));

/** FIFA code for a country name (or the code itself); unknown names get a 3-letter fallback. */
export function fifa(name) {
  if (!name) return 'UNK';
  const n = String(name).trim();
  if (codes.has(n.toUpperCase()) && n.length === 3) return n.toUpperCase();
  return byName.get(n.toLowerCase()) ?? n.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
}

export function flagEmoji(iso) {
  if (iso.startsWith('GB-')) {
    const sub = { 'GB-ENG': 'gbeng', 'GB-SCT': 'gbsct', 'GB-WLS': 'gbwls', 'GB-NIR': 'gbnir' }[iso];
    if (sub === 'gbnir') return '🇬🇧';
    return '\u{1F3F4}' + [...sub].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('') + '\u{E007F}';
  }
  if (iso === 'XK') return '🇽🇰';
  return [...iso].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

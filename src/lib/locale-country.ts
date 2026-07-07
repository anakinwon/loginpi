// locale_cd → alpha-2 국가코드 (fi fi-* CSS 플래그용)
// 단일 선언 — language-switcher · admin/i18n/page 공유
// 새 locale 추가 시 이 파일 + locale-currency.ts + routing.ts 세 곳만 수정
export const LOCALE_COUNTRY: Record<string, string> = {
  ko: 'kr',
  en: 'us',
  zh: 'cn',
  ja: 'jp',
  hi: 'in',
  vi: 'vn',
  af: 'za',
  fil: 'ph',
  th: 'th',
  id: 'id',
  ms: 'my',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  ru: 'ru',
  pt: 'pt',
  ar: 'eg',
  au: 'au', // 호주: 영어권이지만 AUD 통화 분리를 위해 별도 locale
  il: 'il', // 이스라엘: 히브리어(Hebrew) locale
  et: 'et', // 에티오피아: 암하라어 locale, ETB 통화
  mx: 'mx', // 멕시코: 스페인어 공유, MXN 통화 분리를 위해 별도 locale
  ps: 'af', // 아프가니스탄: 파슈토어 locale, AFN 통화
  'ar-AR': 'ar', // Argentina
  sq: 'al', // Albania
  at: 'at', // Austria
  ca: 'ca', // Canada
  ie: 'ie', // Ireland
  li: 'li', // Liechtenstein
  nz: 'nz', // New Zealand
  sg: 'sg', // Singapore
  gb: 'gb', // United Kingdom
  // ── 2026-07-07 전체 국가 활성화 (157개국 일괄 등재) ──
  ad: 'ad', // Andorra
  ae: 'ae', // United Arab Emirates
  am: 'am', // Armenia
  ao: 'ao', // Angola
  az: 'az', // Azerbaijan
  ba: 'ba', // Bosnia
  bb: 'bb', // Barbados
  bd: 'bd', // Bangladesh
  be: 'be', // Belgium
  bf: 'bf', // Burkina Faso
  bg: 'bg', // Bulgaria
  bh: 'bh', // Bahrain
  bi: 'bi', // Burundi
  bj: 'bj', // Benin
  bn: 'bn', // Brunei
  bo: 'bo', // Bolivia
  br: 'br', // Brazil
  bs: 'bs', // Bahamas
  bt: 'bt', // Bhutan
  bw: 'bw', // Botswana
  by: 'by', // Belarus
  bz: 'bz', // Belize
  cd: 'cd', // Congo, Democratic Republic
  cf: 'cf', // Central African Republic
  cg: 'cg', // Congo
  ch: 'ch', // Switzerland
  cl: 'cl', // Chile
  cm: 'cm', // Cameroon
  co: 'co', // Colombia
  cr: 'cr', // Costa Rica
  cu: 'cu', // Cuba
  cv: 'cv', // Cabo Verde
  cy: 'cy', // Cyprus
  cz: 'cz', // Czech Republic
  dj: 'dj', // Djibouti
  dk: 'dk', // Denmark
  do: 'do', // Dominican Republic
  dz: 'dz', // Algeria
  ec: 'ec', // Ecuador
  ee: 'ee', // Estonia
  eg: 'eg', // Egypt
  'en-ZA': 'za', // South Africa
  er: 'er', // Eritrea
  fi: 'fi', // Finland
  fj: 'fj', // Fiji
  fm: 'fm', // Micronesia
  ga: 'ga', // Gabon
  ge: 'ge', // Georgia
  gh: 'gh', // Ghana
  gm: 'gm', // Gambia
  gn: 'gn', // Guinea
  gq: 'gq', // Equatorial Guinea
  gr: 'gr', // Greece
  gt: 'gt', // Guatemala
  gw: 'gw', // Guinea-Bissau
  gy: 'gy', // Guyana
  hn: 'hn', // Honduras
  hr: 'hr', // Croatia
  ht: 'ht', // Haiti
  hu: 'hu', // Hungary
  iq: 'iq', // Iraq
  ir: 'ir', // Iran
  is: 'is', // Iceland
  jm: 'jm', // Jamaica
  jo: 'jo', // Jordan
  ke: 'ke', // Kenya
  kg: 'kg', // Kyrgyzstan
  kh: 'kh', // Cambodia
  ki: 'ki', // Kiribati
  km: 'km', // Comoros
  kn: 'kn', // Saint Kitts and Nevis
  kw: 'kw', // Kuwait
  kz: 'kz', // Kazakhstan
  la: 'la', // Laos
  lb: 'lb', // Lebanon
  lc: 'lc', // Saint Lucia
  lk: 'lk', // Sri Lanka
  lr: 'lr', // Liberia
  ls: 'ls', // Lesotho
  lt: 'lt', // Lithuania
  lu: 'lu', // Luxembourg
  lv: 'lv', // Latvia
  ly: 'ly', // Libya
  ma: 'ma', // Morocco
  mc: 'mc', // Monaco
  md: 'md', // Moldova
  me: 'me', // Montenegro
  mg: 'mg', // Madagascar
  mh: 'mh', // Marshall Islands
  ml: 'ml', // Mali
  mm: 'mm', // Myanmar
  mn: 'mn', // Mongolia
  mr: 'mr', // Mauritania
  mt: 'mt', // Malta
  mu: 'mu', // Mauritius
  mv: 'mv', // Maldives
  mw: 'mw', // Malawi
  mz: 'mz', // Mozambique
  na: 'na', // Namibia
  ne: 'ne', // Niger
  ng: 'ng', // Nigeria
  ni: 'ni', // Nicaragua
  nl: 'nl', // Netherlands
  no: 'no', // Norway
  np: 'np', // Nepal
  nr: 'nr', // Nauru
  om: 'om', // Oman
  pa: 'pa', // Panama
  pe: 'pe', // Peru
  pg: 'pg', // Papua New Guinea
  pk: 'pk', // Pakistan
  pl: 'pl', // Poland
  pw: 'pw', // Palau
  py: 'py', // Paraguay
  qa: 'qa', // Qatar
  ro: 'ro', // Romania
  rs: 'rs', // Serbia
  rw: 'rw', // Rwanda
  sa: 'sa', // Saudi Arabia
  sb: 'sb', // Solomon Islands
  sc: 'sc', // Seychelles
  sd: 'sd', // Sudan
  se: 'se', // Sweden
  si: 'si', // Slovenia
  sk: 'sk', // Slovakia
  sl: 'sl', // Sierra Leone
  sm: 'sm', // San Marino
  sn: 'sn', // Senegal
  so: 'so', // Somalia
  sr: 'sr', // Suriname
  ss: 'ss', // South Sudan
  st: 'st', // Sao Tome and Principe
  sv: 'sv', // El Salvador
  sy: 'sy', // Syria
  td: 'td', // Chad
  tg: 'tg', // Togo
  tj: 'tj', // Tajikistan
  tl: 'tl', // Timor-Leste
  tm: 'tm', // Turkmenistan
  tn: 'tn', // Tunisia
  to: 'to', // Tonga
  tr: 'tr', // Turkey
  tt: 'tt', // Trinidad and Tobago
  tv: 'tv', // Tuvalu
  tw: 'tw', // Taiwan
  tz: 'tz', // Tanzania
  ua: 'ua', // Ukraine
  ug: 'ug', // Uganda
  uy: 'uy', // Uruguay
  uz: 'uz', // Uzbekistan
  vc: 'vc', // Saint Vincent
  ve: 've', // Venezuela
  vu: 'vu', // Vanuatu
  ws: 'ws', // Samoa
  ye: 'ye', // Yemen
  zm: 'zm', // Zambia
  zw: 'zw', // Zimbabwe
}

// locale_cd → alpha-2 (정적 맵 우선, 없으면 BCP 47 마지막 세그먼트)
export function getAlpha2(locale_cd: string): string {
  return LOCALE_COUNTRY[locale_cd] ?? locale_cd.split('-').pop()!.toLowerCase()
}

// 활성 locale에 대응하는 대문자 country_cd 집합 (중복 필터링용)
export const ACTIVE_COUNTRY_CODES = new Set(
  Object.values(LOCALE_COUNTRY).map((c) => c.toUpperCase()),
)

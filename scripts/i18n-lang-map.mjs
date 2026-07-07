// i18n-lang-map — 국가 locale → 실제 주 언어 매핑 (단일 소스, 부작용 없는 순수 모듈)
// i18n-bulk-translate.mjs·i18n-lang-master-seed.mjs가 공유. 국가코드≠언어코드 함정 방지.
// ── 대상 locale → { lang: Gemini 지시용 언어명, copy: 복사 소스 locale (있으면 번역 생략) } ──
// 언어 선정 기준: 해당 국가의 최다 사용 공용어. 복수 공용어는 실사용 우위 언어.
export const LANG_MAP = {
  // ── 아랍어 복사 (ar) ──
  ae: { lang: 'Arabic', copy: 'ar' }, bh: { lang: 'Arabic', copy: 'ar' }, dz: { lang: 'Arabic', copy: 'ar' },
  eg: { lang: 'Arabic', copy: 'ar' }, iq: { lang: 'Arabic', copy: 'ar' }, jo: { lang: 'Arabic', copy: 'ar' },
  km: { lang: 'Arabic', copy: 'ar' }, kw: { lang: 'Arabic', copy: 'ar' }, lb: { lang: 'Arabic', copy: 'ar' },
  ly: { lang: 'Arabic', copy: 'ar' }, ma: { lang: 'Arabic', copy: 'ar' }, mr: { lang: 'Arabic', copy: 'ar' },
  om: { lang: 'Arabic', copy: 'ar' }, qa: { lang: 'Arabic', copy: 'ar' }, sa: { lang: 'Arabic', copy: 'ar' },
  sd: { lang: 'Arabic', copy: 'ar' }, sy: { lang: 'Arabic', copy: 'ar' }, tn: { lang: 'Arabic', copy: 'ar' },
  ye: { lang: 'Arabic', copy: 'ar' },
  // ── 프랑스어 복사 (fr) ──
  bf: { lang: 'French', copy: 'fr' }, bi: { lang: 'French', copy: 'fr' }, bj: { lang: 'French', copy: 'fr' },
  cd: { lang: 'French', copy: 'fr' }, cf: { lang: 'French', copy: 'fr' }, cg: { lang: 'French', copy: 'fr' },
  cm: { lang: 'French', copy: 'fr' }, dj: { lang: 'French', copy: 'fr' }, ga: { lang: 'French', copy: 'fr' },
  gn: { lang: 'French', copy: 'fr' }, ht: { lang: 'French', copy: 'fr' }, lu: { lang: 'French', copy: 'fr' },
  mc: { lang: 'French', copy: 'fr' }, mg: { lang: 'French', copy: 'fr' }, ml: { lang: 'French', copy: 'fr' },
  ne: { lang: 'French', copy: 'fr' }, sn: { lang: 'French', copy: 'fr' }, td: { lang: 'French', copy: 'fr' },
  tg: { lang: 'French', copy: 'fr' },
  // ── 스페인어 복사 (es) ──
  bo: { lang: 'Spanish', copy: 'es' }, cl: { lang: 'Spanish', copy: 'es' }, co: { lang: 'Spanish', copy: 'es' },
  cr: { lang: 'Spanish', copy: 'es' }, cu: { lang: 'Spanish', copy: 'es' }, do: { lang: 'Spanish', copy: 'es' },
  ec: { lang: 'Spanish', copy: 'es' }, gq: { lang: 'Spanish', copy: 'es' }, gt: { lang: 'Spanish', copy: 'es' },
  hn: { lang: 'Spanish', copy: 'es' }, ni: { lang: 'Spanish', copy: 'es' }, pa: { lang: 'Spanish', copy: 'es' },
  pe: { lang: 'Spanish', copy: 'es' }, py: { lang: 'Spanish', copy: 'es' }, sv: { lang: 'Spanish', copy: 'es' },
  uy: { lang: 'Spanish', copy: 'es' }, ve: { lang: 'Spanish', copy: 'es' },
  // ── 포르투갈어 복사 (pt) ──
  ao: { lang: 'Portuguese', copy: 'pt' }, br: { lang: 'Portuguese', copy: 'pt' }, cv: { lang: 'Portuguese', copy: 'pt' },
  gw: { lang: 'Portuguese', copy: 'pt' }, mz: { lang: 'Portuguese', copy: 'pt' }, st: { lang: 'Portuguese', copy: 'pt' },
  tl: { lang: 'Portuguese', copy: 'pt' },
  // ── 영어 복사 (en) ──
  bb: { lang: 'English', copy: 'en' }, bs: { lang: 'English', copy: 'en' }, bw: { lang: 'English', copy: 'en' },
  bz: { lang: 'English', copy: 'en' }, er: { lang: 'English', copy: 'en' }, fj: { lang: 'English', copy: 'en' },
  fm: { lang: 'English', copy: 'en' }, gh: { lang: 'English', copy: 'en' }, gm: { lang: 'English', copy: 'en' },
  gy: { lang: 'English', copy: 'en' }, jm: { lang: 'English', copy: 'en' }, ke: { lang: 'English', copy: 'en' },
  ki: { lang: 'English', copy: 'en' }, kn: { lang: 'English', copy: 'en' }, lc: { lang: 'English', copy: 'en' },
  lr: { lang: 'English', copy: 'en' }, ls: { lang: 'English', copy: 'en' }, mh: { lang: 'English', copy: 'en' },
  mt: { lang: 'English', copy: 'en' }, mu: { lang: 'English', copy: 'en' }, mw: { lang: 'English', copy: 'en' },
  na: { lang: 'English', copy: 'en' }, ng: { lang: 'English', copy: 'en' }, nr: { lang: 'English', copy: 'en' },
  pg: { lang: 'English', copy: 'en' }, pw: { lang: 'English', copy: 'en' }, rw: { lang: 'English', copy: 'en' },
  sb: { lang: 'English', copy: 'en' }, sc: { lang: 'English', copy: 'en' }, sl: { lang: 'English', copy: 'en' },
  ss: { lang: 'English', copy: 'en' }, to: { lang: 'English', copy: 'en' }, tt: { lang: 'English', copy: 'en' },
  tv: { lang: 'English', copy: 'en' }, ug: { lang: 'English', copy: 'en' }, vc: { lang: 'English', copy: 'en' },
  vu: { lang: 'English', copy: 'en' }, ws: { lang: 'English', copy: 'en' }, zm: { lang: 'English', copy: 'en' },
  zw: { lang: 'English', copy: 'en' }, 'en-ZA': { lang: 'English', copy: 'en' },
  // ── 기타 기존 언어 복사 ──
  ch: { lang: 'German', copy: 'de' },          // 스위스: 독일어 최다
  sm: { lang: 'Italian', copy: 'it' },         // 산마리노
  by: { lang: 'Russian', copy: 'ru' },         // 벨라루스: 러시아어 실사용 우위
  bn: { lang: 'Malay', copy: 'ms' },           // 브루나이
  ee: { lang: 'Estonian', copy: 'et' },        // 에스토니아: 기존 et locale이 에스토니아어 콘텐츠 보유
  // ── 신규 언어 (Gemini 번역, 언어 공유 국가는 동일 group) ──
  nl: { lang: 'Dutch', group: 'dutch' }, be: { lang: 'Dutch', group: 'dutch' }, sr: { lang: 'Dutch', group: 'dutch' }, // 수리남 공용어=네덜란드어
  gr: { lang: 'Greek', group: 'greek' }, cy: { lang: 'Greek', group: 'greek' },
  ro: { lang: 'Romanian', group: 'romanian' }, md: { lang: 'Romanian', group: 'romanian' },
  rs: { lang: 'Serbian', group: 'serbian' }, me: { lang: 'Serbian', group: 'serbian' },
  tr: { lang: 'Turkish', group: 'turkish' },
  pl: { lang: 'Polish', group: 'polish' },
  cz: { lang: 'Czech', group: 'czech' },
  dk: { lang: 'Danish', group: 'danish' },
  fi: { lang: 'Finnish', group: 'finnish' },
  se: { lang: 'Swedish', group: 'swedish' },
  no: { lang: 'Norwegian (Bokmål)', group: 'norwegian' },
  is: { lang: 'Icelandic', group: 'icelandic' },
  hu: { lang: 'Hungarian', group: 'hungarian' },
  bg: { lang: 'Bulgarian', group: 'bulgarian' },
  hr: { lang: 'Croatian', group: 'croatian' },
  ba: { lang: 'Bosnian', group: 'bosnian' },
  si: { lang: 'Slovenian', group: 'slovenian' },
  sk: { lang: 'Slovak', group: 'slovak' },
  lt: { lang: 'Lithuanian', group: 'lithuanian' },
  lv: { lang: 'Latvian', group: 'latvian' },
  ua: { lang: 'Ukrainian', group: 'ukrainian' },
  ge: { lang: 'Georgian', group: 'georgian' },
  am: { lang: 'Armenian', group: 'armenian' },
  az: { lang: 'Azerbaijani', group: 'azerbaijani' },
  kz: { lang: 'Kazakh', group: 'kazakh' },
  kg: { lang: 'Kyrgyz', group: 'kyrgyz' },
  uz: { lang: 'Uzbek', group: 'uzbek' },
  tj: { lang: 'Tajik', group: 'tajik' },
  tm: { lang: 'Turkmen', group: 'turkmen' },
  mn: { lang: 'Mongolian', group: 'mongolian' },
  ir: { lang: 'Persian (Farsi)', group: 'persian' },
  pk: { lang: 'Urdu', group: 'urdu' },
  bd: { lang: 'Bengali', group: 'bengali' },
  np: { lang: 'Nepali', group: 'nepali' },
  lk: { lang: 'Sinhala', group: 'sinhala' },
  mm: { lang: 'Burmese (Myanmar)', group: 'burmese' },
  kh: { lang: 'Khmer', group: 'khmer' },
  la: { lang: 'Lao', group: 'lao' },
  tz: { lang: 'Swahili', group: 'swahili' },
  so: { lang: 'Somali', group: 'somali' },
  ad: { lang: 'Catalan', group: 'catalan' },
  bt: { lang: 'Dzongkha', group: 'dzongkha' },
  mv: { lang: 'Dhivehi (Maldivian)', group: 'dhivehi' },
  tw: { lang: 'Traditional Chinese (Taiwan)', group: 'zh-hant' },
  // ── 레거시 보정: et(에티오피아)를 암하라어로 재번역 (기존 에스토니아어 콘텐츠는 ee가 승계) ──
  //    완료 판정: 에티오픽 문자 존재 여부 (재실행 시 중복 번역 방지)
  et: { lang: 'Amharic', group: 'amharic', force: true, doneRe: /[ሀ-፿]/ },
  // ── 추가 보정 (2026-07-07 2차): 매핑 누락분 ──
  sq: { lang: 'Albanian', group: 'albanian' },              // 알바니아 — 과거 활성화됐으나 번역 0
  'ar-AR': { lang: 'Spanish', copy: 'es' },                 // 아르헨티나 — 'ar'(아랍어) 충돌로 xx-XX 파생
}


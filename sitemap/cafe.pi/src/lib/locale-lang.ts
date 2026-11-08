// PyTranslate™ locale_cd → 실제 언어 해석기 (2026-07-10 근본수정)
//
// 이 프로젝트의 locale_cd는 국가 파생 코드다(ye=예멘→아랍어, il=이스라엘→히브리어,
// bn=브루나이→말레이어, mt=몰타→영어, cy=키프로스→그리스어 …).
// ISO 639-1 언어코드와 뜻이 다르므로 raw locale을 번역 프롬프트에 그대로 넘기면
// 엔진이 언어를 특정하지 못해 원문 반환(ye·er)하거나 오역(bn→벵골어)한다.
// Intl.DisplayNames도 코드를 "언어코드"로 해석하므로 같은 함정에 빠진다.
//
// 단일 소스: scripts/i18n-lang-map.mjs (국가 locale → 주 언어, i18n 번역 파이프라인과 공유)
// + BASE_LANG (LANG_MAP에 없는 언어 자체 locale·초기 국가 locale 보완)
import { LANG_MAP } from '../../scripts/i18n-lang-map.mjs'

// LANG_MAP에 없는 활성 locale — 66언어 기반 언어 자체 코드 + LANG_MAP 이전 선례 국가 locale
const BASE_LANG: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Simplified Chinese',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  id: 'Indonesian',
  ms: 'Malay',
  th: 'Thai',
  vi: 'Vietnamese',
  fil: 'Filipino',
  af: 'Afrikaans',
  il: 'Hebrew', // 이스라엘 — il은 ISO 언어코드 아님
  au: 'English', // 호주 (au·mx는 LANG_MAP 이전 선례 locale)
  mx: 'Spanish', // 멕시코
  ps: 'Pashto', // 아프가니스탄 (국가 AF → locale ps)
}

// 언어명 → ISO 639-1 (원본 언어 비교용 — 번역 엔진이 감지한 src_lang_cd와 대조)
// tw(대만 번체)만 'zh-TW' — 간체(zh) 원문과 "같은 언어" 판정으로 스킵되면 안 되기 때문
const NAME_ISO: Record<string, string> = {
  Arabic: 'ar',
  French: 'fr',
  Spanish: 'es',
  Portuguese: 'pt',
  English: 'en',
  German: 'de',
  Italian: 'it',
  Russian: 'ru',
  Malay: 'ms',
  Estonian: 'et',
  Dutch: 'nl',
  Greek: 'el',
  Romanian: 'ro',
  Serbian: 'sr',
  Turkish: 'tr',
  Polish: 'pl',
  Czech: 'cs',
  Danish: 'da',
  Finnish: 'fi',
  Swedish: 'sv',
  'Norwegian (Bokmål)': 'no',
  Icelandic: 'is',
  Hungarian: 'hu',
  Bulgarian: 'bg',
  Croatian: 'hr',
  Bosnian: 'bs',
  Slovenian: 'sl',
  Slovak: 'sk',
  Lithuanian: 'lt',
  Latvian: 'lv',
  Ukrainian: 'uk',
  Georgian: 'ka',
  Armenian: 'hy',
  Azerbaijani: 'az',
  Kazakh: 'kk',
  Kyrgyz: 'ky',
  Uzbek: 'uz',
  Tajik: 'tg',
  Turkmen: 'tk',
  Mongolian: 'mn',
  'Persian (Farsi)': 'fa',
  Urdu: 'ur',
  Bengali: 'bn',
  Nepali: 'ne',
  Sinhala: 'si',
  'Burmese (Myanmar)': 'my',
  Khmer: 'km',
  Lao: 'lo',
  Swahili: 'sw',
  Somali: 'so',
  Catalan: 'ca',
  Dzongkha: 'dz',
  'Dhivehi (Maldivian)': 'dv',
  'Traditional Chinese (Taiwan)': 'zh-TW',
  Amharic: 'am',
  Albanian: 'sq',
  Korean: 'ko',
  Japanese: 'ja',
  'Simplified Chinese': 'zh',
  Hindi: 'hi',
  Indonesian: 'id',
  Thai: 'th',
  Vietnamese: 'vi',
  Filipino: 'fil',
  Afrikaans: 'af',
  Hebrew: 'he',
  Pashto: 'ps',
}

const langMap = LANG_MAP as Record<string, { lang: string }>

/**
 * locale_cd → 번역 엔진 지시용 언어명 (예: 'ye' → 'Arabic').
 * 해석 불가 시 null — 호출부는 기존 locale 코드 프롬프트로 폴백한다.
 */
export function resolveLangName(localeCd: string): string | null {
  const base = localeCd.split('-')[0].toLowerCase()
  return (
    langMap[localeCd]?.lang ??
    BASE_LANG[localeCd] ??
    langMap[base]?.lang ??
    BASE_LANG[base] ??
    null
  )
}

/**
 * locale_cd → 대상 언어의 ISO 639-1 코드 (예: 'ye' → 'ar', 'er' → 'en').
 * 원본 언어(src_lang_cd)와의 "같은 언어" 스킵 판정에 사용한다.
 * 해석 불가 시 base part 폴백(기존 동작 유지).
 */
export function targetLangBase(localeCd: string): string {
  const name = resolveLangName(localeCd)
  if (name && NAME_ISO[name]) return NAME_ISO[name]
  return localeCd.split('-')[0].toLowerCase()
}

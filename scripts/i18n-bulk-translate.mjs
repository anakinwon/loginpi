#!/usr/bin/env node
/**
 * i18n-bulk-translate — 전체 국가 locale 번역 일괄 채움 (멱등·재개 가능)
 *
 * 1단계 COPY: 기존 완역 언어를 쓰는 국가는 소스 locale의 i18n_message를 복사 (API 쿼터 0)
 * 2단계 TRANSLATE: 신규 언어는 Gemini로 언어당 1회 번역 후 해당 국가들에 upsert
 *   - 국가코드 ≠ 언어코드 함정 방지: 국가별 실제 주 언어를 명시 지시 (et=에스토니아어 사고 재발 방지)
 *   - ICU 플레이스홀더({user} 등) 원형 보존 검증 — 불일치 배치는 1회 재시도, 실패 키는 건너뜀(런타임 en fallback)
 *   - 재개: DB에 이미 있는 키는 건너뜀 (중단 후 재실행 안전)
 *
 * 실행: node scripts/i18n-bulk-translate.mjs   (.env.local 대상 / 운영은 env 오버라이드)
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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
  et: { lang: 'Amharic', group: 'amharic', force: true },
}

// ── env ──
const envFile = '.env.local'
const env = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8').split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI = process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY
const sb = createClient(URL, KEY)
console.log('대상 DB:', URL)

// ── ko 원문 (source of truth) ──
function flattenJson(obj, prefix = '') {
  const result = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) Object.assign(result, flattenJson(v, key))
    else if (typeof v === 'string') result[key] = v
  }
  return result
}
const koFlat = flattenJson(JSON.parse(readFileSync('messages/ko.json', 'utf8')))
const KO_KEYS = Object.keys(koFlat).filter((k) => koFlat[k].trim() !== '') // 빈 원문 제외
console.log('ko 키:', KO_KEYS.length)

// ── DB 헬퍼 ──
async function fetchLocaleMap(locale) {
  const flat = {}
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('i18n_message').select('msg_key, msg_val')
      .eq('locale_cd', locale).order('msg_key').range(from, from + PAGE - 1)
    if (error) throw new Error(`[${locale}] 조회: ${error.message}`)
    for (const m of data ?? []) if (m.msg_val) flat[m.msg_key] = m.msg_val
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return flat
}
async function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('i18n_message').upsert(rows.slice(i, i + 500), { onConflict: 'locale_cd,msg_key' })
    if (error) throw new Error(`upsert: ${error.message}`)
  }
}

// ── 검증: ICU 변수 보존 + 한글 미혼입 ──
const icuVars = (s) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(',')
const HANGUL = /[가-힣ㄱ-ㆎ]/
function isValid(koVal, val) {
  if (typeof val !== 'string' || !val.trim()) return false
  if (icuVars(koVal) !== icuVars(val)) return false
  if (HANGUL.test(val)) return false // 어떤 대상 언어에도 한글은 없어야 함
  return true
}

// ── Gemini ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 },
    }),
  })
  if (res.status === 429) throw Object.assign(new Error('rate-limited'), { code: 429 })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

async function translateBatch(langName, batch, attempt = 0) {
  const prompt = `Translate the following Korean UI strings to ${langName}.
Rules:
- Placeholders in curly braces like {user}, {amount}, {count} must be preserved EXACTLY as-is (never translate or rename the identifier inside braces)
- Korean loanwords originally from English (대시보드, 데이터, 카테고리 etc.) must be translated to the natural equivalent in ${langName} or kept as the original English word
- Technical abbreviations (DDL, API, JSON, DB, SQL, HTML, ICU) and brand names (PyCafé™, PyShop™, PyTranslate™, Pi, Bean, A2U, txid) must remain unchanged
- Keep the same JSON key names, translate values only
- Return ONLY a valid JSON object with no markdown or explanation

${JSON.stringify(batch, null, 1)}`
  try {
    const text = await callGemini(prompt)
    const m = text.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : {}
  } catch (e) {
    if (e.code === 429) {
      if (attempt >= 3) throw e
      const wait = 30_000 * (attempt + 1)
      console.log(`  429 — ${wait / 1000}s 대기 후 재시도 (${attempt + 1}/3)`)
      await sleep(wait)
      return translateBatch(langName, batch, attempt + 1)
    }
    if (attempt >= 1) throw e
    await sleep(5_000)
    return translateBatch(langName, batch, attempt + 1)
  }
}

// ── 1단계: COPY ──
const copyTargets = Object.entries(LANG_MAP).filter(([, v]) => v.copy)
const groupTargets = Object.entries(LANG_MAP).filter(([, v]) => v.group)
console.log(`COPY ${copyTargets.length} locale / TRANSLATE ${new Set(groupTargets.map(([, v]) => v.group)).size}개 언어 → ${groupTargets.length} locale`)

const sourceCache = {}
for (const [lc, cfg] of copyTargets) {
  const existing = await fetchLocaleMap(lc)
  const missing = KO_KEYS.filter((k) => !existing[k])
  if (missing.length === 0) { console.log(`[copy ${lc}] 완료 상태 — 건너뜀`); continue }
  sourceCache[cfg.copy] ??= await fetchLocaleMap(cfg.copy)
  const src = sourceCache[cfg.copy]
  const rows = missing.filter((k) => src[k]).map((k) => ({ locale_cd: lc, msg_key: k, msg_val: src[k], is_auto: 'Y' }))
  await upsertRows(rows)
  console.log(`[copy ${lc}] ${cfg.copy} → ${rows.length}키 복사`)
}
console.log('=== COPY 단계 완료 ===')

// ── 2단계: TRANSLATE (언어 group당 1회 번역 → 소속 locale 전체 upsert) ──
const groups = new Map() // group → { lang, locales[], force }
for (const [lc, cfg] of groupTargets) {
  const g = groups.get(cfg.group) ?? { lang: cfg.lang, locales: [], force: false }
  g.locales.push(lc)
  if (cfg.force) g.force = true
  groups.set(cfg.group, g)
}

const BATCH = 75
const DELAY = 4_500
let gi = 0
for (const [gname, g] of groups) {
  gi++
  // 재개 지원: 대표 locale의 기존 키 기준으로 미번역분만 (force는 전량)
  const rep = g.locales[0]
  const existing = g.force ? {} : await fetchLocaleMap(rep)
  const todo = KO_KEYS.filter((k) => !existing[k])
  if (todo.length === 0) { console.log(`[${gi}/${groups.size} ${gname}] 완료 상태 — 건너뜀`); continue }
  console.log(`[${gi}/${groups.size} ${gname}] ${g.lang} — ${todo.length}키 번역 시작 (→ ${g.locales.join(',')})`)

  let ok = 0, bad = 0
  for (let i = 0; i < todo.length; i += BATCH) {
    if (i > 0) await sleep(DELAY)
    const keys = todo.slice(i, i + BATCH)
    const batch = Object.fromEntries(keys.map((k) => [k, koFlat[k]]))
    let translated
    try {
      translated = await translateBatch(g.lang, batch)
    } catch (e) {
      console.error(`[${gname}] 배치 실패(중단·재실행 시 이어짐): ${e.message}`)
      process.exit(2) // 쿼터 소진 등 — 상태는 DB에 있으므로 재실행으로 재개
    }
    const rows = []
    for (const k of keys) {
      const val = translated[k]
      if (isValid(koFlat[k], val)) {
        for (const lc of g.locales) rows.push({ locale_cd: lc, msg_key: k, msg_val: val, is_auto: 'Y' })
        ok++
      } else bad++
    }
    if (rows.length) await upsertRows(rows)
    process.stdout.write(`\r[${gname}] ${Math.min(i + BATCH, todo.length)}/${todo.length} (검증탈락 ${bad})`)
  }
  console.log(`\n[${gi}/${groups.size} ${gname}] 완료 — 유효 ${ok} / 탈락 ${bad} (탈락분은 en fallback)`)
}
console.log('=== 전체 완료 ===')

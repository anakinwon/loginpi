// pi-i18n snapshot — loginpi(cafe.pi, 루트 앱)의 다국어 정본을 패키지 정적 데이터(src/data/*.json)로 복제한다.
//  · locales.json   = DB i18n_locale 활성 행(locale_cd·locale_nm·flag_emoji·sort_ord, sort_ord 순) — /api/i18n/countries 와 같은 조회
//  · countries.json = DB i18n_cntry_mst(country_cd·dis_ord_seq·country_eng_nm·country_mot_nm·currency_cd·locale_cd·use_yn, dis_ord_seq 순)
//  · locale-lang.json = loginpi src/i18n/routing.ts locales(같은 순서) → 실제 언어(카탈로그 코드, 파일 없는 locale 은 null)
//    언어 판정 = loginpi messages/<locale>.json 내용이 어느 언어 소스 파일과 가장 같은지(국가코드 ≠ 언어코드 함정을 내용으로 해소)
//  · switcher-messages.json = loginpi 각 locale 파일의 langSwitcher.* · common.fetching 원문(스위처 문구를 loginpi 와 똑같이)
// 실행 : 저장소 어디서든 node packages/pi-i18n/bin/pi-i18n.mjs snapshot [--root <loginpi 루트>]. 키 값은 출력하지 않는다
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flatten, parseArgs } from './lib.mjs'

const PKG = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA = join(PKG, 'src', 'data')

// 언어(카탈로그 코드) → loginpi 소스 locale 파일 (docs/i18n/LOGINPI_I18N_ANALYSIS.md 4절 '소스' 열)
export const LANG_SOURCE = {
  ko: 'ko', en: 'en', zh: 'zh', 'zh-TW': 'tw', ja: 'ja', vi: 'vi', hi: 'hi', id: 'id', fil: 'fil', th: 'th', ms: 'ms',
  de: 'de', es: 'es', fr: 'fr', it: 'it', pt: 'pt', ru: 'ru', ar: 'ar', af: 'af', am: 'et', sq: 'sq', hy: 'am',
  az: 'az', bn: 'bd', bs: 'ba', bg: 'bg', my: 'mm', ca: 'ad', hr: 'hr', cs: 'cz', da: 'dk', dv: 'mv', nl: 'nl',
  dz: 'bt', et: 'ee', fi: 'fi', ka: 'ge', el: 'gr', he: 'il', hu: 'hu', is: 'is', kk: 'kz', km: 'kh', ky: 'kg',
  lo: 'la', lv: 'lv', lt: 'lt', mn: 'mn', ne: 'np', nb: 'no', ps: 'ps', fa: 'ir', pl: 'pl', ro: 'ro', sr: 'rs',
  si: 'lk', sk: 'sk', sl: 'si', so: 'so', sw: 'tz', sv: 'se', tg: 'tj', tr: 'tr', tk: 'tm', uk: 'ua', ur: 'pk', uz: 'uz',
}

// 저장소 루트 = pnpm-workspace.yaml 이 있는 폴더(= loginpi 루트 앱)
function findRoot(from) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (dirname(dir) === dir) throw new Error('저장소 루트(pnpm-workspace.yaml)를 찾지 못했습니다 — --root 로 지정')
  }
}

function readEnv(file, names) {
  const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
  return Object.fromEntries(names.map((n) => {
    const v = process.env[n] ?? text.match(new RegExp(`^\\s*${n}\\s*=\\s*(.*)$`, 'm'))?.[1].trim().replace(/^['"]|['"]$/g, '')
    if (!v) throw new Error(`${n} 가 없습니다(환경변수 · ${file})`)
    return [n, v]
  }))
}

// PostgREST 직접 조회 — supabase-js .select().eq().order() 와 같은 요청(의존성 없이 fetch). 행 수 < 1000(기본 상한)
async function rest(env, path) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${path.split('?')[0]} 조회 실패 HTTP ${res.status}`)
  return res.json()
}

// routing.ts 의 locales 배열 문자열을 순서대로
export function parseRoutingLocales(text) {
  const body = text.match(/locales:\s*\[([\s\S]*?)\]/)?.[1]
  if (!body) throw new Error('routing.ts 에서 locales 배열을 찾지 못했습니다')
  return [...body.replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map((m) => m[1])
}

// locale 파일 → 같은 값 비율이 가장 높은 언어 (소스 파일 자기 자신은 1.0)
export function detectLanguage(flat, sources) {
  let best = null
  let score = 0
  for (const [lang, src] of Object.entries(sources)) {
    const keys = Object.keys(src)
    let same = 0
    for (const k of keys) if (flat[k] === src[k]) same++
    const s = keys.length ? same / keys.length : 0
    if (s > score) (best = lang), (score = s)
  }
  return { lang: best, score }
}

const write = (name, data) => writeFileSync(join(DATA, name), `${JSON.stringify(data, null, 2)}\n`)

export async function run(argv) {
  const args = parseArgs(argv)
  const root = typeof args.root === 'string' ? args.root : findRoot(PKG)
  const env = readEnv(join(root, '.env.local'), ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  const msgDir = join(root, 'messages')
  const readMsg = (l) => {
    const f = join(msgDir, `${l}.json`)
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
  }

  const [locales, countries] = await Promise.all([
    rest(env, 'i18n_locale?select=locale_cd,locale_nm,flag_emoji,sort_ord&is_active=eq.Y&order=sort_ord'),
    rest(env, 'i18n_cntry_mst?select=country_cd,dis_ord_seq,country_eng_nm,country_mot_nm,currency_cd,locale_cd,use_yn&order=dis_ord_seq.asc'),
  ])

  const routed = parseRoutingLocales(readFileSync(join(root, 'src', 'i18n', 'routing.ts'), 'utf8'))
  const sources = {}
  for (const [lang, l] of Object.entries(LANG_SOURCE)) {
    const m = readMsg(l)
    if (!m) throw new Error(`언어 ${lang} 의 소스 파일 messages/${l}.json 이 없습니다`)
    sources[lang] = Object.fromEntries(Object.entries(flatten(m)).filter(([, v]) => typeof v === 'string'))
  }

  const localeLang = {}
  const switcher = {}
  const low = []
  for (const l of routed) {
    const m = readMsg(l)
    if (!m) {
      localeLang[l] = null // loginpi 도 파일 없음 → ko → en 폴백
      continue
    }
    const fixed = Object.entries(LANG_SOURCE).find(([, s]) => s === l)?.[0]
    const { lang, score } = fixed ? { lang: fixed, score: 1 } : detectLanguage(flatten(m), sources)
    if (score < 0.9) low.push(`${l}→${lang}(${score.toFixed(2)})`)
    localeLang[l] = lang
    const entry = {}
    if (m.langSwitcher) entry.langSwitcher = m.langSwitcher
    if (m.common?.fetching) entry.common = { fetching: m.common.fetching }
    if (Object.keys(entry).length) switcher[l] = entry
  }

  write('locales.json', locales)
  write('countries.json', countries)
  write('locale-lang.json', localeLang)
  write('switcher-messages.json', switcher)
  const mapped = Object.values(localeLang).filter(Boolean).length
  console.log(`locales ${locales.length} · countries ${countries.length} · routing ${routed.length}(언어 매핑 ${mapped}, 파일 없음 ${routed.length - mapped}) · 스위처 문구 ${Object.keys(switcher).length}`)
  if (low.length) console.log(`⚠ 내용 일치율 0.9 미만 — 확인 필요 : ${low.join(', ')}`)
}

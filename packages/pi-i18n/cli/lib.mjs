// pi-i18n CLI 공용 함수 — 설정·카탈로그·routing locale(loginpi) 읽기, 언어 소스 파일 경로, 점 경로 펼침/조립, 해시, ICU 구조 비교, Gemini 키 찾기.
// 순수 Node ESM(TS 런타임 불필요). 규칙 정본 : docs/I18N_STANDARD.md 4.4·5절
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { parse } from '@formatjs/icu-messageformat-parser'

const require = createRequire(import.meta.url)
export const CATALOG = require('../src/catalog.json')
const BY_CODE = new Map(CATALOG.map((l) => [l.code, l]))
export const getInfo = (code) => BY_CODE.get(code)
// routing locale(loginpi 219개, 순서 그대로) → 언어 코드(null = 번역 파일 없음 → ko·en 폴백)
export const LOCALE_LANG = require('../src/data/locale-lang.json')
export const ROUTING = Object.keys(LOCALE_LANG)

// 언어 소스 파일 — ko·en 은 messages/<code>.json, 나머지 언어는 messages/lang/<code>.json (routing locale 파일은 expand 가 만든다)
export const sourceFile = (dir, lang) => (lang === 'ko' || lang === 'en' ? join(dir, `${lang}.json`) : join(dir, 'lang', `${lang}.json`))

// 공용 용어집(표준 5.2) — 앱 i18n.config.json glossary 를 더한다
export const BASE_GLOSSARY = [
  'Pi Network', 'Pi Browser', 'Pi Wallet', 'Pi', 'π',
  'PyCafé™', 'PyShop™', 'PyTranslate™',
  'seminar.pi', 'schema.pi', 'sitemap.pi', 'cafe.pi', 'Galápagos', 'Bean',
  'A2U', 'U2A', 'txid', 'KYC', 'Testnet', 'Mainnet', 'Google',
  'API', 'JSON', 'DB', 'SQL', 'DDL', 'ERD', 'HTML', 'URL', 'ICU',
]

export const HANGUL = /[가-힣ㄱ-ㆎ]/

// 목록을 기준 순서로 고르고 검증 — routing locale(src/index.ts resolveLocales 와 같은 규칙) / 언어(카탈로그)
function pick(list, all, known, what) {
  if (list === 'all') return [...all]
  const unknown = list.filter((c) => !known(c))
  if (unknown.length) throw new Error(`${what}에 없는 코드 : ${unknown.join(', ')}`)
  for (const must of ['ko', 'en']) if (!list.includes(must)) throw new Error(`목록에 '${must}' 가 반드시 있어야 합니다`)
  return all.filter((c) => list.includes(c))
}
export const resolveLocales = (locales = 'all') => pick(locales, ROUTING, (c) => Object.hasOwn(LOCALE_LANG, c), 'routing(loginpi) 목록')
export const resolveLanguages = (langs = 'all') => pick(langs, CATALOG.map((l) => l.code), (c) => BY_CODE.has(c), '언어 카탈로그')

export function loadConfig(cwd) {
  const file = join(cwd, 'i18n.config.json')
  const raw = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  return {
    locales: resolveLocales(raw.locales ?? 'all'), // routing locale (expand·validate 대상)
    languages: resolveLanguages(raw.languages ?? 'all'), // 번역 언어 (translate 대상)
    glossary: [...new Set([...BASE_GLOSSARY, ...(raw.glossary ?? [])])],
    exclude: raw.audit?.exclude ?? [],
    numericArgs: [...new Set([...BASE_NUMERIC_ARGS, ...(raw.numericArgs ?? [])])],
  }
}

// 명령행 플래그 — --name value / --flag
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true
    else out[a.slice(2)] = argv[++i]
  }
  return out
}

export const pickLocales = (flag, all) => (typeof flag === 'string' ? flag.split(',').map((s) => s.trim()).filter(Boolean) : all)

// 점 경로로 펼침 — 배열은 원소마다 a.list.0
export function flatten(obj, prefix = '', out = {}) {
  if (Array.isArray(obj)) obj.forEach((v, i) => flatten(v, `${prefix}${i}.`, out))
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) flatten(v, `${prefix}${k}.`, out)
  else out[prefix.slice(0, -1)] = obj
  return out
}

// ko 의 모양을 따라 다시 조립. 배열은 원소가 모두 있을 때만 넣는다(런타임 병합이 배열을 통째로 바꾸므로 구멍 난 배열 금지)
export function rebuild(koNode, flat, prefix = '') {
  if (Array.isArray(koNode)) {
    const arr = koNode.map((v, i) => rebuild(v, flat, `${prefix}${i}.`))
    return arr.every((v) => v !== undefined) ? arr : undefined
  }
  if (koNode && typeof koNode === 'object') {
    const obj = {}
    for (const [k, v] of Object.entries(koNode)) {
      const r = rebuild(v, flat, `${prefix}${k}.`)
      if (r !== undefined) obj[k] = r
    }
    return Object.keys(obj).length ? obj : undefined
  }
  const key = prefix.slice(0, -1)
  return Object.hasOwn(flat, key) ? flat[key] : undefined
}

export const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12)

// ICU 구조 요약 — 인자별 형식 집합(이름 → arg·num·date·time·select), select 선택지·plural 범주·태그 이름.
// number·plural 은 같은 숫자형(num). 일반 인자(arg) → 숫자형 전환은 셈 이름(numericArgs)만 허용 — 문자열 값('3.5 Pi')이 NaN 으로 찍히는 것 방지
function walk(nodes, acc) {
  const add = (name, kind) => (acc.args[name] ??= new Set()).add(kind)
  for (const n of nodes) {
    if (n.type === 1) add(n.value, 'arg')
    else if (n.type === 2) add(n.value, 'num')
    else if (n.type === 3) add(n.value, 'date')
    else if (n.type === 4) add(n.value, 'time')
    else if (n.type === 5) {
      add(n.value, 'select')
      acc.selects.push([n.value, Object.keys(n.options).sort().join('|')])
      for (const o of Object.values(n.options)) walk(o.value, acc)
    } else if (n.type === 6) {
      add(n.value, 'num')
      acc.plurals.push({ name: n.value, ordinal: n.pluralType === 'ordinal', keys: Object.keys(n.options) })
      for (const o of Object.values(n.options)) walk(o.value, acc)
    } else if (n.type === 8) {
      acc.tags.push(n.value)
      walk(n.children, acc)
    }
  }
  return acc
}

export function icuShape(text) {
  const acc = walk(parse(String(text)), { args: {}, selects: [], plurals: [], tags: [] })
  return {
    args: acc.args,
    selects: acc.selects.map(([n, k]) => `${n}=${k}`).sort().join(';'),
    plurals: acc.plurals,
    tags: acc.tags.sort().join(','),
  }
}

// 셈 값으로 보는 인자 이름 기본값 — 앱 i18n.config.json numericArgs 로 더한다
export const BASE_NUMERIC_ARGS = ['n', 'count', 'num', 'total']

const showArgs = (args) => Object.entries(args).map(([n, ks]) => `${n}:${[...ks].sort().join('|')}`).sort().join(',')

// 인자 비교 — 이름 집합 같고, 이름마다 형식 호환. ko 숫자형 → 번역 arg 는 안전(숫자를 그대로 찍음)
function argsMismatch(ko, tr, numericArgs) {
  const names = (o) => Object.keys(o).sort().join(',')
  if (names(ko) !== names(tr)) return true
  for (const [name, koKinds] of Object.entries(ko)) {
    const ok = new Set(koKinds)
    if (ok.has('num') || numericArgs.includes(name)) (ok.add('num'), ok.add('arg'))
    if ([...tr[name]].some((k) => !ok.has(k))) return true
  }
  return false
}

const pluralCats = new Map()
function categories(locale, ordinal) {
  const k = `${locale}:${ordinal}`
  if (!pluralCats.has(k)) {
    let cats
    try {
      cats = new Intl.PluralRules(locale, { type: ordinal ? 'ordinal' : 'cardinal' }).resolvedOptions().pluralCategories
    } catch {
      cats = ['zero', 'one', 'two', 'few', 'many', 'other']
    }
    pluralCats.set(k, new Set(cats))
  }
  return pluralCats.get(k)
}

// 용어가 단어로 들어 있는지 — 'Pi' 가 'Pixel' 안에 든 경우는 제외(앞뒤 영문자 경계).
// inflect = 번역문 쪽 검사 : 슬라브어 등의 격 어미(Google → Googlea, Pi Browser → Pi Browseru)를 허용해 뒤 경계는 보지 않는다
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const hasTerm = (text, term, inflect = false) =>
  new RegExp(`(?<![A-Za-z])${esc(term)}${inflect ? '' : '(?![A-Za-z])'}`).test(String(text))

// 키 1개 검사 → { errors: string[], warnings: string[] } (translate 는 둘 다 탈락, validate 는 errors 만 오류)
export function checkValue(koText, text, locale, glossary, numericArgs = BASE_NUMERIC_ARGS) {
  const errors = []
  const warnings = []
  if (typeof text !== 'string' || text === '') return { errors: ['빈 값'], warnings }
  let koShape = null
  try {
    koShape = icuShape(koText)
  } catch {
    /* ko 자체가 ICU 로 안 읽히면 구조 비교 생략 (validate 가 ko 오류로 따로 보고) */
  }
  if (koShape) {
    let s
    try {
      s = icuShape(text)
    } catch (e) {
      return { errors: [`ICU 파싱 실패(${e.message})`], warnings }
    }
    if (argsMismatch(koShape.args, s.args, numericArgs)) errors.push(`변수 불일치 ko[${showArgs(koShape.args)}] ≠ [${showArgs(s.args)}]`)
    if (s.selects !== koShape.selects) errors.push(`select 선택지 불일치 ko[${koShape.selects}] ≠ [${s.selects}]`)
    if (s.tags !== koShape.tags) errors.push(`태그 불일치 ko[${koShape.tags}] ≠ [${s.tags}]`)
    for (const p of s.plurals) {
      if (!p.keys.includes('other')) errors.push(`plural ${p.name} 에 other 없음`)
      const cats = categories(locale, p.ordinal)
      const bad = p.keys.filter((k) => !/^=\d+$/.test(k) && !cats.has(k))
      if (bad.length) errors.push(`plural ${p.name} 범주 부적합 [${bad.join(',')}]`)
    }
  }
  for (const term of glossary) {
    if (hasTerm(koText, term) && !hasTerm(text, term, true)) warnings.push(`용어 '${term}' 누락`)
  }
  if (locale !== 'ko' && HANGUL.test(text) && !glossary.some((g) => HANGUL.test(g) && text.includes(g))) warnings.push('한글 혼입')
  return { errors, warnings }
}

// GEMINI_API_KEY : 환경변수 → 앱 .env.local → 상위 폴더(저장소 루트까지) .env.local. 값은 절대 출력하지 않는다
export function findGeminiKey(cwd) {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  let dir = cwd
  for (;;) {
    const file = join(dir, '.env.local')
    if (existsSync(file)) {
      const m = readFileSync(file, 'utf8').match(/^\s*GEMINI_API_KEY\s*=\s*(.*)$/m)
      const v = m?.[1].trim().replace(/^['"]|['"]$/g, '')
      if (v) return v
    }
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || dirname(dir) === dir) return null
    dir = dirname(dir)
  }
}

export const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)

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

import { LANG_MAP } from './i18n-lang-map.mjs'

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
    // 네트워크 순단 내성 — 3회 재시도 (예외·error 응답 모두)
    let lastErr
    for (let t = 0; t < 3; t++) {
      try {
        const { error } = await sb.from('i18n_message').upsert(rows.slice(i, i + 500), { onConflict: 'locale_cd,msg_key' })
        if (!error) { lastErr = null; break }
        lastErr = new Error(`upsert: ${error.message}`)
      } catch (e) {
        lastErr = new Error(`upsert: ${e.message}`)
      }
      await sleep(10_000 * (t + 1))
    }
    if (lastErr) throw lastErr
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
    // 일반 오류(네트워크 순단 fetch failed 등) — 장시간 잡이므로 넉넉히 재시도
    if (attempt >= 4) throw e
    const wait = [5_000, 15_000, 30_000, 60_000][attempt]
    console.log(`  오류(${e.message.slice(0, 60)}) — ${wait / 1000}s 후 재시도 (${attempt + 1}/4)`)
    await sleep(wait)
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
const CONCURRENCY = Number(process.env.I18N_CONCURRENCY ?? 3) // Gemini RPM 여유 내 병렬 (배치 생성시간이 지배적이라 3~4 워커도 한도 내)

async function runGroup(gname, g, gi, total) {
  // 재개 지원: 대표 locale의 기존 키 기준으로 미번역분만
  //  force 그룹은 doneRe(목표 문자계) 매칭 시 완료로 간주, 아니면 전량 재번역
  const rep = g.locales[0]
  const existingMap = await fetchLocaleMap(rep)
  const done = g.force ? (g.doneRe?.test(existingMap['common.save'] ?? '') ?? false) : false
  const existing = g.force ? (done ? existingMap : {}) : existingMap
  const todo = KO_KEYS.filter((k) => !existing[k])
  if (todo.length === 0) { console.log(`[${gi}/${total} ${gname}] 완료 상태 — 건너뜀`); return }
  console.log(`[${gi}/${total} ${gname}] ${g.lang} — ${todo.length}키 번역 시작 (→ ${g.locales.join(',')})`)

  let ok = 0, bad = 0
  for (let i = 0; i < todo.length; i += BATCH) {
    if (i > 0) await sleep(DELAY)
    const keys = todo.slice(i, i + BATCH)
    const batch = Object.fromEntries(keys.map((k) => [k, koFlat[k]]))
    const translated = await translateBatch(g.lang, batch) // 실패는 상위에서 처리
    const rows = []
    for (const k of keys) {
      const val = translated[k]
      if (isValid(koFlat[k], val)) {
        for (const lc of g.locales) rows.push({ locale_cd: lc, msg_key: k, msg_val: val, is_auto: 'Y' })
        ok++
      } else bad++
    }
    if (rows.length) await upsertRows(rows)
    process.stdout.write(`[${gname}] ${Math.min(i + BATCH, todo.length)}/${todo.length} (탈락 ${bad})\n`)
  }
  console.log(`[${gi}/${total} ${gname}] 완료 — 유효 ${ok} / 탈락 ${bad} (탈락분은 en fallback)`)
}

// 워커 풀 — CONCURRENCY개 그룹 동시 진행 (각 워커는 자체 4.5s 간격 유지)
const queue = [...groups.entries()].map(([gname, g], idx) => ({ gname, g, gi: idx + 1 }))
let fatal = null
async function worker() {
  while (queue.length && !fatal) {
    const { gname, g, gi } = queue.shift()
    try {
      await runGroup(gname, g, gi, groups.size)
    } catch (e) {
      console.error(`[${gname}] 배치 실패(중단·재실행 시 이어짐): ${e.message}`)
      fatal = e
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
if (fatal) process.exit(2) // 쿼터 소진 등 — 상태는 DB에 있으므로 재실행으로 재개

// ── 3단계: 잔여 채움 — en에만 있는 키(ko 원문 빈 값 등)를 en 값으로 보충 → 100% 정합 ──
const enMap = await fetchLocaleMap('en')
const enKeys = Object.keys(enMap)
const allTargets = Object.keys(LANG_MAP)
for (const lc of allTargets) {
  const cur = await fetchLocaleMap(lc)
  const missing = enKeys.filter((k) => !cur[k])
  if (!missing.length) continue
  await upsertRows(missing.map((k) => ({ locale_cd: lc, msg_key: k, msg_val: enMap[k], is_auto: 'Y' })))
  console.log(`[fill ${lc}] en 값으로 ${missing.length}키 보충`)
}
console.log('=== 전체 완료 ===')

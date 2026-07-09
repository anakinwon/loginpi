#!/usr/bin/env node
/**
 * i18n-increment-translate — ko.json 신규 키 증분 번역 (전 활성 locale, 재개 안전)
 *
 * 동작: 그룹(언어)별 대표 locale에서 누락된 ko 키만 Gemini 번역 후
 *       해당 언어의 모든 locale에 upsert → 전 json 재생성.
 *       중단돼도 재실행하면 완료 그룹은 자동 스킵(그룹별 누락 감지).
 * 사용: ko.json에 키 추가 후 `node scripts/i18n-increment-translate.mjs`
 *       (운영 DB는 별도 델타 반영 — TROUBLESHOOT 2026-07-08편 참조)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { LANG_MAP } from './i18n-lang-map.mjs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const GEMINI = env.GEMINI_API_KEY

function flatten(o,p=''){const r={};for(const[k,v]of Object.entries(o)){const key=p?p+'.'+k:k;if(typeof v==='object'&&v!==null)Object.assign(r,flatten(v,key));else if(typeof v==='string')r[key]=v}return r}
const ko = flatten(JSON.parse(readFileSync('messages/ko.json','utf8')))
const KO_KEYS = Object.keys(ko).filter(k => ko[k].trim() !== '')

async function fetchMap(lc) {
  const flat = {}; let from = 0
  for (;;) {
    const { data, error } = await sb.from('i18n_message').select('msg_key, msg_val').eq('locale_cd', lc).order('msg_key').range(from, from+999)
    if (error) throw new Error(`[${lc}] ${error.message}`)
    for (const m of data ?? []) if (m.msg_val) flat[m.msg_key] = m.msg_val
    if (!data || data.length < 1000) break
    from += 1000
  }
  return flat
}

// locale → 언어명 (LANG_MAP + 원조 locale 보충)
const ORIGINAL_LANGS = {
  en: 'English', zh: 'Chinese (Simplified)', ja: 'Japanese', hi: 'Hindi', vi: 'Vietnamese',
  af: 'Afrikaans', fil: 'Filipino', th: 'Thai', id: 'Indonesian', ms: 'Malay',
  es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', ru: 'Russian',
  pt: 'Portuguese', ar: 'Arabic', au: 'English', il: 'Hebrew', mx: 'Spanish', ps: 'Pashto',
}
const { data: act } = await sb.from('i18n_locale').select('locale_cd').eq('is_active','Y')
const locales = act.map(r=>r.locale_cd).filter(lc=>lc!=='ko')
const groups = new Map()
for (const lc of locales) {
  const lang = LANG_MAP[lc]?.lang ?? ORIGINAL_LANGS[lc]
  if (!lang) { console.error('언어 미상 locale:', lc); process.exit(1) }
  groups.set(lang, [...(groups.get(lang) ?? []), lc])
}
console.log('언어 그룹:', groups.size)

const icuVars = (s) => [...s.matchAll(/\{(\w+)[,}]/g)].map(m=>m[1]).sort().join(',')
const HANGUL = /[가-힣ㄱ-ㆎ]/
const sleep = (ms) => new Promise(r=>setTimeout(r,ms))
async function gemini(prompt, attempt = 0) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }),
      // Node fetch는 기본 무한 대기 — 소켓 유실 시 파이프라인 전체가 hang(2026-07-09 실측). 3분 컷.
      signal: AbortSignal.timeout(180_000),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const j = await res.json()
    const text = j.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('') ?? ''
    const m = text.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : {}
  } catch (e) {
    // 429(분당 토큰 쿼터)는 대형 프롬프트 특성상 짧은 백오프로 안 풀림 — 60초 단위 장기 대기
    const is429 = /429/.test(e.message ?? '')
    const max = is429 ? 5 : 3
    if (attempt >= max) throw e
    await sleep((is429 ? 60_000 : 10_000) * (attempt + 1))
    return gemini(prompt, attempt + 1)
  }
}

const mkPrompt = (lang, batchSrc) => `Translate the following Korean UI strings to ${lang}.
Rules:
- Placeholders in curly braces like {count}, {fee} must be preserved EXACTLY as-is
- Brand terms (Pi, Bean, π, PyCafé™, PyShop™, PyTranslate™) must remain unchanged
- Keep the same JSON key names, translate values only
- Return ONLY a valid JSON object

${JSON.stringify(batchSrc, null, 1)}`

// ── 영어 선행 채움 — 이후 언어들의 검증 탈락 폴백 소스 ──
const enMap = await fetchMap('en')
{
  const missing = KO_KEYS.filter(k => !enMap[k])
  if (missing.length) {
    const vals = await gemini(mkPrompt('English', Object.fromEntries(missing.map(k => [k, ko[k]]))))
    const rows = []
    for (const k of missing) {
      if (typeof vals[k] !== 'string' || !vals[k].trim()) { console.error('en 번역 실패:', k); process.exit(1) }
      rows.push({ locale_cd: 'en', msg_key: k, msg_val: vals[k], is_auto: 'Y' })
      enMap[k] = vals[k]
    }
    const { error } = await sb.from('i18n_message').upsert(rows, { onConflict: 'locale_cd,msg_key' })
    if (error) { console.error('[en] upsert:', error.message); process.exit(1) }
    console.log('[en] +' + rows.length)
  }
}

// ── 그룹별 누락 감지·번역·upsert (병렬 I18N_WORKERS·기본 6, 실패 그룹은 건너뛰고 계속 → 재실행 재개) ──
// 429 빈발 시 I18N_WORKERS=1 권장 — 그룹당 프롬프트가 커서 동시 진입이 분당 토큰 쿼터를 초과한다.
const WORKERS = Math.max(1, Number(process.env.I18N_WORKERS) || 6)
const queue = [...groups.entries()]
let done = 0
let failed = 0
async function worker() {
  while (queue.length) {
    const [lang, lcs] = queue.shift()
    try {
      const repMap = lang === 'English' ? enMap : await fetchMap(lcs[0])
      const todo = KO_KEYS.filter(k => !repMap[k])
      if (todo.length === 0 && lang !== 'English') { done++; continue }
      let vals
      if (lang === 'English') {
        vals = enMap
      } else {
        const out = await gemini(mkPrompt(lang, Object.fromEntries(todo.map(k => [k, ko[k]]))))
        vals = {}
        for (const k of todo) {
          const v = out[k]
          vals[k] = (typeof v === 'string' && v.trim() && !HANGUL.test(v) && icuVars(ko[k]) === icuVars(v)) ? v : enMap[k]
        }
      }
      // 소속 locale 각각의 누락분 채움 (같은 언어 내 locale별 진행 차이도 흡수)
      const rows = []
      for (const lc of lcs) {
        const cur = lcs.length === 1 && lang !== 'English' ? repMap : await fetchMap(lc)
        for (const k of KO_KEYS) {
          if (cur[k]) continue
          const v = vals[k] ?? enMap[k]
          if (v) rows.push({ locale_cd: lc, msg_key: k, msg_val: v, is_auto: 'Y' })
        }
      }
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from('i18n_message').upsert(rows.slice(i, i+500), { onConflict: 'locale_cd,msg_key' })
        if (error) throw new Error(`upsert: ${error.message}`)
      }
      done++
      if (rows.length) process.stdout.write(`[${done}/${groups.size}] ${lang} +${rows.length}행\n`)
    } catch (e) {
      console.error(`[${lang}] 실패(재실행 시 이어짐): ${e.message}`)
      failed++
    }
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker))
// ── 전 json 재생성 (DB 정본) — 실패 그룹이 있어도 성공분은 반영해 배포 가능하게 한다 ──
function arrayify(n){if(n===null||typeof n!=='object'||Array.isArray(n))return n;for(const k of Object.keys(n))n[k]=arrayify(n[k]);const ks=Object.keys(n);if(ks.length>0&&ks.every((k,i)=>k===String(i)))return ks.map(k=>n[k]);return n}
function unflatten(f){const r={};for(const[key,val]of Object.entries(f)){const p=key.split('.');let c=r;for(let i=0;i<p.length-1;i++){if(typeof c[p[i]]!=='object'||c[p[i]]===null)c[p[i]]={};c=c[p[i]]}c[p[p.length-1]]=val}return arrayify(r)}
for (const lc of locales) {
  const flat = await fetchMap(lc)
  writeFileSync(`messages/${lc}.json`, JSON.stringify(unflatten(flat), null, 2), 'utf8')
}
console.log(`json 재생성 ${locales.length}개 — 완료. 운영 DB 델타 반영 잊지 말 것.`)

if (failed) {
  console.error(`실패 ${failed}그룹 — 재실행하면 실패분만 재시도됩니다`)
  process.exit(2)
}

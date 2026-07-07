#!/usr/bin/env node
/**
 * i18n-bulk-activate — 비활성 국가 전체를 locale로 일괄 활성화 (멱등)
 *
 * 동작 (관리 페이지 /admin/i18n 활성화 버튼과 동일 로직):
 *   1. i18n_cntry_mst에서 비활성 국가 조회 (derivedLocale = locale_cd ?? country_cd 소문자)
 *   2. i18n_locale upsert — locale_nm=country_eng_nm·정상 국기(U+1F1E6 베이스)·sort_ord 순차·is_active Y
 *   3. i18n_cntry_mst.locale_cd 연결 (null인 경우만)
 *
 * 실행: node scripts/i18n-bulk-activate.mjs   (.env.local의 Supabase 대상)
 *   운영 적용 시 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY를 운영값으로 지정해 실행.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

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
const sb = createClient(URL, KEY)
console.log('대상 DB:', URL)

// 정상 국기 생성 — 베이스 U+1F1E6('A')
const toFlag = (cc) =>
  [...cc.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')

const { data: cn, error: e1 } = await sb
  .from('i18n_cntry_mst')
  .select('country_cd, locale_cd, country_eng_nm')
  .order('country_cd')
if (e1) { console.error(e1.message); process.exit(1) }
const { data: act, error: e2 } = await sb.from('i18n_locale').select('locale_cd, sort_ord').eq('is_active', 'Y')
if (e2) { console.error(e2.message); process.exit(1) }

const activeSet = new Set(act.map((r) => r.locale_cd))
let sortOrd = Math.max(0, ...act.map((r) => r.sort_ord ?? 0))
const targets = cn
  .filter((c) => !activeSet.has(c.locale_cd ?? c.country_cd.toLowerCase()))
  .map((c) => ({ lc: c.locale_cd ?? c.country_cd.toLowerCase(), cc: c.country_cd, nm: c.country_eng_nm }))
  .sort((a, b) => a.nm.localeCompare(b.nm)) // 국가 영문명순 (Algeria → Zimbabwe)

console.log('활성화 대상:', targets.length, '개국')

for (const t of targets) {
  sortOrd += 1
  const { error } = await sb.from('i18n_locale').upsert(
    { locale_cd: t.lc, locale_nm: t.nm, flag_emoji: toFlag(t.cc), is_active: 'Y', sort_ord: sortOrd },
    { onConflict: 'locale_cd' },
  )
  if (error) { console.error(`[${t.lc}] 실패:`, error.message); process.exit(1) }
  await sb.from('i18n_cntry_mst').update({ locale_cd: t.lc }).eq('country_cd', t.cc).is('locale_cd', null)
}
console.log('활성화 완료:', targets.length, '개국 (', targets[0]?.nm, '→', targets.at(-1)?.nm, ')')

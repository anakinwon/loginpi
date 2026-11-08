#!/usr/bin/env node
// apiErrors 310키의 수작업 en 번역을 i18n_message DB에 선행 upsert
// (증분 번역 파이프라인이 en을 DB 기준으로 스킵 판단 — 기계번역 덮어쓰기 방지, 일회성)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const en = JSON.parse(readFileSync('messages/en.json','utf8')).apiErrors
const rows = Object.entries(en).map(([code, val]) => ({
  locale_cd: 'en',
  msg_key: `apiErrors.${code}`,
  msg_val: val,
  is_auto: 'N',
}))
console.log('upsert 대상:', rows.length)
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await sb.from('i18n_message').upsert(rows.slice(i, i+500), { onConflict: 'locale_cd,msg_key' })
  if (error) { console.error('upsert 실패:', error.message); process.exit(1) }
}
const { count } = await sb.from('i18n_message').select('*', { count: 'exact', head: true }).eq('locale_cd','en').like('msg_key','apiErrors.%')
console.log('DB en apiErrors 행수:', count)

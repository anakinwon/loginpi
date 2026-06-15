// mx(멕시코 스페인어) DB→JSON 동기화 1회용 스크립트
// sync route(src/app/api/admin/i18n/sync)의 unflatten + writeFile 로직 재현
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// .env.local에서 Supabase 자격 로드
const envRaw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
const getEnv = (k) => {
  const m = envRaw.match(new RegExp('^' + k + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined
}

const sb = createClient(
  getEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getEnv('SUPABASE_SERVICE_ROLE_KEY'),
)

// flat key('board.title') → 중첩 객체
function unflatten(flat) {
  const result = {}
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.')
    let cur = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null)
        cur[parts[i]] = {}
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = v
  }
  return result
}

const lc = 'mx'
const flat = {}
const PAGE = 1000
let from = 0
for (;;) {
  const { data, error } = await sb
    .from('i18n_message')
    .select('msg_key, msg_val')
    .eq('locale_cd', lc)
    .not('msg_val', 'is', null)
    .order('msg_key')
    .range(from, from + PAGE - 1)
  if (error) {
    console.error('조회 실패:', error.message)
    process.exit(1)
  }
  for (const r of data) flat[r.msg_key] = r.msg_val
  if (!data || data.length < PAGE) break
  from += PAGE
}

writeFileSync(
  join(process.cwd(), 'messages', `${lc}.json`),
  JSON.stringify(unflatten(flat), null, 2),
  'utf8',
)
console.log(`${lc}.json 동기화 완료: ${Object.keys(flat).length} 키`)

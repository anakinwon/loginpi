// schema.pi 서버 전용 DB 클라이언트 — Supabase secret 키(service_role), 브라우저 번들 금지(라우트 핸들러·서버 컴포넌트에서만 import)
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('DB_UNAVAILABLE')
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

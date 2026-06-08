import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

// 클라이언트 컴포넌트 전용 — Realtime 구독 시 publishable key 사용 (RLS 적용)
// 서버 API에서는 supabase-admin.ts의 getSupabaseAdmin() 사용
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 설정되지 않았습니다')
  }

  _client = createClient(url, key)
  return _client
}

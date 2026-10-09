// @pi/db — 서버 전용 Supabase admin 클라이언트(SERVICE_ROLE_KEY, RLS 비활성 전제). lazy init으로 빌드 시 env 없어도 안전.
// 출처: cafe.pi src/lib/supabase-admin.ts 복사 추출 + db.schema 옵션(SUPABASE_SCHEMA).
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { resolveDbConfig, type DbTier } from './db-env'

let _client: SupabaseClient | null = null
let _tier: DbTier = 'prod'
let _readOnly = false

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const { url, key, schema, tier, readOnly } = resolveDbConfig()
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다',
    )
  }

  _tier = tier
  _readOnly = readOnly
  // 스키마명은 런타임 env 값이라 타입 제네릭('public')과 맞추기 위해 단언한다 — 쿼리 타입은 untyped 동일
  _client = createClient(url, key, {
    db: { schema: schema as 'public' },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}

// 현재 연결된 DB tier/읽기전용 여부. getSupabaseAdmin 호출 이후 정확(호출 전 기본값 prod/false)
export function getDbTierInfo(): { tier: DbTier; readOnly: boolean } {
  return { tier: _tier, readOnly: _readOnly }
}

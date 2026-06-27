import 'server-only'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { resolveDbConfig, type DbTier } from './db-env'

let _client: SupabaseClient | null = null
let _tier: DbTier = 'prod'
let _readOnly = false

// 모듈 로드 시 즉시 초기화 대신 lazy init — 빌드 시점 환경변수 없어도 안전.
// 자격증명은 db-env의 3-tier 라우터가 해석(tier별 env 미설정 시 현행 운영 DB로 폴백 → 하위호환).
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const { url, key, tier, readOnly } = resolveDbConfig()

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다',
    )
  }

  _tier = tier
  _readOnly = readOnly
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}

// 현재 연결된 DB tier/읽기전용 여부 (관리자 모니터링·스테이징 배너·쓰기 가드용).
// getSupabaseAdmin 호출 이후 정확. 호출 전엔 기본값(prod/false).
export function getDbTierInfo(): { tier: DbTier; readOnly: boolean } {
  return { tier: _tier, readOnly: _readOnly }
}

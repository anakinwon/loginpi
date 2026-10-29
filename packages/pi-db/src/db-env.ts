// @pi/db — 3-tier DB 라우터(dev/staging/prod) + 스키마 옵션. 자격증명은 env 주입.
// 비운영 tier(dev/staging)는 자기 tier 자격증명이 없으면 운영으로 폴백하지 않고 미설정('') 반환 → 앱 503(KISA 2026-10-09, 운영 DB 오염 방지).
// 출처: cafe.pi src/lib/db-env.ts 복사 추출 + SUPABASE_SCHEMA(PRD_28 §5 : 비운영은 pi-nonprod 프로젝트의 <site>_dev·<site>_stg 스키마).
import 'server-only'

export type DbTier = 'dev' | 'staging' | 'prod'

export interface DbConfig {
  tier: DbTier
  url: string
  key: string
  // PostgREST 대상 스키마(Supabase Exposed schemas 등록 + GRANT 필요). 미설정 = public
  schema: string
  // 운영DB를 읽기 전용으로 연결한 상태인지. 실제 쓰기 차단은 read-only 자격증명이 담당
  readOnly: boolean
}

// tier 판정 우선순위: APP_TIER 명시값 > VERCEL_ENV 매핑 > 기본 prod
export function resolveDbTier(): DbTier {
  const explicit = process.env.APP_TIER
  if (explicit === 'dev' || explicit === 'staging' || explicit === 'prod')
    return explicit
  switch (process.env.VERCEL_ENV) {
    case 'production':
      return 'prod'
    case 'preview':
      return 'staging'
    case 'development':
      return 'dev'
    default:
      return 'prod'
  }
}

// 스테이징 DB 스위치 타깃: 'staging'(자체 DB·RW, 기본) | 'prod-ro'(운영DB 읽기 전용)
function stagingTarget(): 'staging' | 'prod-ro' {
  return process.env.STAGING_DB_TARGET === 'prod-ro' ? 'prod-ro' : 'staging'
}

export function resolveDbConfig(): DbConfig {
  const tier = resolveDbTier()
  const schema = process.env.SUPABASE_SCHEMA || 'public'

  // 운영 자격증명 — prod tier 전용(비운영 tier 폴백 금지)
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const prodKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (tier === 'dev') {
    return {
      tier,
      url: process.env.DEV_SUPABASE_URL ?? '',
      key: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY ?? '',
      schema,
      readOnly: false,
    }
  }

  if (tier === 'staging') {
    if (stagingTarget() === 'prod-ro') {
      // RO 자격증명 부재 시 service_role(전권)로 폴백되면 운영 쓰기가 가능해지므로 스테이징 DB로 되돌린다
      const roUrl = process.env.PROD_RO_SUPABASE_URL
      const roKey = process.env.PROD_RO_SUPABASE_KEY
      if (roUrl && roKey) {
        return { tier, url: roUrl, key: roKey, schema, readOnly: true }
      }
    }
    return {
      tier,
      url: process.env.STAGING_SUPABASE_URL ?? '',
      key: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '',
      schema,
      readOnly: false,
    }
  }

  return { tier, url: prodUrl, key: prodKey, schema, readOnly: false }
}

// 읽기전용 연결 여부 — 인증 등 쓰기 경로에서 비필수 쓰기를 스킵해 세션이 깨지지 않게 한다
export function isReadOnlyDb(): boolean {
  return resolveDbConfig().readOnly
}

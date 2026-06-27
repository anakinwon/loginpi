import 'server-only'

/**
 * 3-tier DB 라우터 — 개발(dev) / 스테이징(staging) / 운영(prod)
 *
 * 설계 원칙 (Infrastructure.pptx):
 *  - 환경마다 DB 완전 분리. tier별 자격증명을 env로 주입.
 *  - 스테이징은 자체 DB(RW)가 기본, 필요 시 운영DB를 "읽기 전용"으로만 스위칭 가능.
 *  - ⚠️ 하위호환: tier별 env가 미설정이면 현행 운영 자격증명으로 폴백 →
 *    지금과 100% 동일하게 동작(아무 것도 깨지지 않음).
 *
 * Phase 1(현재): env 기반 스위칭(STAGING_DB_TARGET + 재배포).
 * Phase 2(후속): Vercel Edge Config 무재배포 스위칭 — docs/INFRA_DB_TIERS.md 참조.
 *   (현재 getSupabaseAdmin은 sync 싱글톤이라 async Edge Config 도입은 별도 리팩터 필요)
 */

export type DbTier = 'dev' | 'staging' | 'prod'

export interface DbConfig {
  tier: DbTier
  url: string
  key: string
  /** 운영DB를 읽기 전용으로 연결한 상태인지. 실제 쓰기 차단은 read-only 자격증명이 담당. */
  readOnly: boolean
}

/**
 * 현재 tier 판정. 우선순위:
 *  1) APP_TIER 명시값
 *  2) Vercel 제공 VERCEL_ENV 자동 매핑 (production→prod / preview→staging / development→dev)
 *  3) 기본 prod (로컬·일반 빌드 — 현행 자격증명 사용으로 하위호환)
 */
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

/** 스테이징 DB 스위치 타깃: 'staging'(자체 DB·RW, 기본) | 'prod-ro'(운영DB 읽기 전용) */
function stagingTarget(): 'staging' | 'prod-ro' {
  return process.env.STAGING_DB_TARGET === 'prod-ro' ? 'prod-ro' : 'staging'
}

/**
 * 현재 tier에 맞는 DB 자격증명 해석.
 * tier별 전용 env가 없으면 현행 운영 자격증명으로 폴백(하위호환).
 */
export function resolveDbConfig(): DbConfig {
  const tier = resolveDbTier()

  // 현행 운영 자격증명 — 모든 tier의 최종 폴백(미설정 시 지금과 동일 동작)
  const prodUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const prodKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (tier === 'dev') {
    return {
      tier,
      url: process.env.DEV_SUPABASE_URL ?? prodUrl,
      key: process.env.DEV_SUPABASE_SERVICE_ROLE_KEY ?? prodKey,
      readOnly: false,
    }
  }

  if (tier === 'staging') {
    if (stagingTarget() === 'prod-ro') {
      // 운영DB 읽기 전용 — read-only 롤 / Read Replica 자격증명 필수.
      // 미설정 시 폴백되면 service_role(전권)이라 쓰기까지 가능해지므로,
      // 'prod-ro' 타깃인데 RO 자격증명이 없으면 안전하게 스테이징 DB로 되돌린다.
      const roUrl = process.env.PROD_RO_SUPABASE_URL
      const roKey = process.env.PROD_RO_SUPABASE_KEY
      if (roUrl && roKey) {
        return { tier, url: roUrl, key: roKey, readOnly: true }
      }
      // RO 자격증명 부재 → 스테이징 DB로 폴백(운영 쓰기 사고 방지)
    }
    return {
      tier,
      url: process.env.STAGING_SUPABASE_URL ?? prodUrl,
      key: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? prodKey,
      readOnly: false,
    }
  }

  // prod — 현행 운영 자격증명 그대로
  return { tier, url: prodUrl, key: prodKey, readOnly: false }
}

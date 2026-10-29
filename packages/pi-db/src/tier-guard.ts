// 비운영 tier 의 운영 DB 오염 차단 판정(순수 함수 — server-only 없이 시험 가능). db-env.ts resolveDbConfig 가 사용
// 사고 : seminar.pi 2026-10-28 로컬 STAGING 이 SUPABASE_SCHEMA=public + 운영과 같은 프로젝트 URL 로 운영 데이터에 시험 행을 씀(ROADMAP 막힌 것 #10)
// 차단 조건 = 비운영 tier(dev·staging) + 스키마 public + URL 이 운영 URL 과 같음. 자체 비운영 프로젝트의 public·운영 프로젝트의 <site>_stg 는 허용

const norm = (u: string) => u.trim().replace(/\/+$/, '').toLowerCase()

export function isProdSchemaLeak(tier: string, url: string, schema: string, prodUrl: string): boolean {
  if (tier === 'prod' || !url || !prodUrl) return false
  return schema === 'public' && norm(url) === norm(prodUrl)
}

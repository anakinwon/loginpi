import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { BeanRevenueResponse } from '@/types/stats'

// GET /api/admin/stats/bean-revenue — Bean 매출 KPI(누적) 집계.
//
// 권한: 게스트 포함 전체 공개 — Home 통계 공개 정책 계승(2026-06-15 운영 결정).
//   매출 "집계"만 반환(항목별 합계·건수)이라 개인 식별 정보가 없어 마스킹 불필요.
//   ※ 발행량·거버넌스 지갑 잔액 등 민감 지표는 admin 전용 /api/admin/token/revenue가 담당.
//
// 데이터: fn_bean_revenue_summary(전체 누적). period 미지원 → KPI는 "누적 매출"로 표기.
export async function GET() {
  const { data, error } = await getSupabaseAdmin().rpc('fn_bean_revenue_summary')
  if (error) {
    console.error('[Bean 매출 KPI] 집계 실패:', error.message)
    return NextResponse.json({ error: '매출 집계 실패' }, { status: 500 })
  }

  const body: BeanRevenueResponse = {
    ...(data as Omit<BeanRevenueResponse, 'last_updated'>),
    last_updated: new Date().toISOString(),
  }
  return NextResponse.json(body)
}

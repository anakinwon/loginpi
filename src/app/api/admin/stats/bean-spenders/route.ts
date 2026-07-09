import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { maskDisplayName } from '@/lib/display-mask'
import { viewerScopedCacheHeaders } from '@/lib/cache-headers'
import { apiError } from '@/lib/api-errors'

// Bean 기간별 상위 지출자 — 홈 대시보드 'Top-3 지출자'(Pi→Bean 전환) 데이터.
// 매출 통계와 동일 정책: 게스트 포함 공개(집계만)·개인 식별 정보는 관리자에게만(비관리자 마스킹).
const VALID_PERIODS = [7, 30, 90, 365] as const

function calcFromDate(period: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (period - 1))
  return d.toISOString().slice(0, 10)
}

interface BeanSpenderRow {
  usr_id: string
  display_nm: string | null
  total_bean: number
  txn_cnt: number
}

export async function GET(req: NextRequest) {
  const admin = isAdmin(await getSessionUser())

  const { searchParams } = new URL(req.url)
  const raw = Number(searchParams.get('period') ?? '30')
  const period = VALID_PERIODS.includes(raw as (typeof VALID_PERIODS)[number])
    ? raw
    : 30
  const fromDt = calcFromDate(period)

  const { data, error } = await getSupabaseAdmin().rpc('fn_top_bean_spenders', {
    p_from: fromDt,
  })

  if (error) {
    console.error('[Bean 지출자] 집계 실패:', error.message)
    return apiError('ADM_BEAN_SPENDERS_FAILED', 500)
  }

  const spenders = ((data as BeanSpenderRow[] | null) ?? []).map((row) => ({
    // 비관리자: UID 제거 + 이름 마스킹 (개인 소비 식별 차단, 금액 순위는 공개)
    usr_id: admin ? row.usr_id : '',
    display_nm: admin
      ? (row.display_nm ?? '(이름 없음)')
      : maskDisplayName(row.display_nm),
    total_bean: Number(row.total_bean),
    txn_cnt: Number(row.txn_cnt),
  }))

  // 뷰어 의존(spenders 마스킹) → 관리자 private / 게스트 마스킹분만 공유 캐시
  return NextResponse.json(
    { period, from_dt: fromDt, spenders },
    { headers: viewerScopedCacheHeaders(admin) },
  )
}

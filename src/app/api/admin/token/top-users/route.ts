import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'

// 정렬 지표 화이트리스트 — RPC p_metric과 일치
const METRICS = [
  'balance',
  'charge',
  'spend',
  'reward',
  'tip_in',
  'txn_cnt',
] as const
type Metric = (typeof METRICS)[number]

interface TopUserRow {
  usr_id: string
  balance: number
  charge_bean: number
  charge_pi: number
  charge_cnt: number
  spend_bean: number
  spend_cnt: number
  reward_bean: number
  tip_in_bean: number
  tip_out_bean: number
  txn_cnt: number
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const metricParam = searchParams.get('metric') ?? 'balance'
  const metric: Metric = METRICS.includes(metricParam as Metric)
    ? (metricParam as Metric)
    : 'balance'
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 500)

  const db = getSupabaseAdmin()

  const { data, error } = await db.rpc('fn_bean_top_users', {
    p_metric: metric,
    p_limit: limit,
  })

  if (error) {
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/token/top-users/get',
          error,
          '상위 사용자 조회 실패',
        ),
      },
      { status: 500 },
    )
  }

  const rows = (data ?? []) as TopUserRow[]

  // 사용자 표시 정보 병합 (FK 임베딩 불가 → wallets 라우트와 동일 패턴)
  const userIds = [...new Set(rows.map((r) => r.usr_id).filter(Boolean))]
  const userMap = new Map<string, Record<string, unknown>>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, pi_username, nick_nm, real_nm, display_name')
      .in('id', userIds)
    for (const u of users ?? [])
      userMap.set((u as { id: string }).id, u as Record<string, unknown>)
  }

  const enriched = rows.map((r) => ({
    ...r,
    sys_user: userMap.get(r.usr_id) ?? null,
  }))

  return NextResponse.json({ data: enriched, metric, limit })
}

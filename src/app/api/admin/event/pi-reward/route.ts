import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { triggerPiReward } from '@/lib/pi-reward'
import { sanitizeError } from '@/lib/sanitize-error'

// GET /api/admin/event/pi-reward?event_id=...
// Pi 보상 지급 현황 목록 (관리자 전용)
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id') ?? 'evt-20260614-001'

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('evt_pi_reward_log')
    .select(
      'evt_pi_reward_log_id, user_id, pi_uid, reward_amt, payment_id, reward_st_cd, paid_dtm, fail_reason_tx, reg_dtm',
    )
    .eq('event_id', eventId)
    .order('reg_dtm', { ascending: false })

  if (error)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/event/pi-reward/get',
          error,
          '보상 현황 조회 실패',
        ),
      },
      { status: 500 },
    )

  // FK 부재로 조인 불가 → user_id로 사용자 정보 별도 병합
  const rows = (data ?? []) as { user_id: string }[]
  const ids = [...new Set(rows.map((r) => r.user_id))]
  const uMap = new Map<string, Record<string, unknown>>()
  if (ids.length > 0) {
    const { data: us } = await db
      .from('sys_user')
      .select('id, display_name, pi_username')
      .in('id', ids)
    for (const u of (us ?? []) as { id: string }[]) uMap.set(u.id, u)
  }
  const rewards = rows.map((r) => ({
    ...r,
    sys_user: uMap.get(r.user_id) ?? null,
  }))

  return NextResponse.json({ rewards })
}

// POST /api/admin/event/pi-reward
// PENDING 또는 FAILED 상태 보상 재시도 (관리자 전용)
// body: { event_id?, target?: 'all' | 'failed' | user_id }
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { event_id: eventId = 'evt-20260614-001', target = 'failed' } =
    body as { event_id?: string; target?: string }

  const db = getSupabaseAdmin()

  // 재시도 대상 조회
  let query = db
    .from('evt_pi_reward_log')
    .select('evt_pi_reward_log_id, event_id, user_id, reward_amt, reward_st_cd')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')
    .neq('reward_st_cd', 'PAID')

  if (target !== 'all' && target !== 'failed') {
    // target이 user_id인 경우
    query = query.eq('user_id', target)
  } else if (target === 'failed') {
    query = query.eq('reward_st_cd', 'FAILED')
  }
  // target === 'all': PENDING + FAILED 전체

  const { data: targets, error } = await query
  if (error)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/event/pi-reward/post',
          error,
          '재시도 대상 조회 실패',
        ),
      },
      { status: 500 },
    )

  if (!targets?.length)
    return NextResponse.json({ message: '재시도 대상 없음', count: 0 })

  // 이벤트 보상 설정 조회
  const { data: evtRow } = await db
    .from('evt_event')
    .select('reward_pi_amt, reward_pi_memo')
    .eq('event_id', eventId)
    .maybeSingle()
  const evt = evtRow as {
    reward_pi_amt: number
    reward_pi_memo: string
  } | null

  // 비블로킹 병렬 재시도 (최대 10건 동시)
  const BATCH = 10
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.allSettled(
      targets
        .slice(i, i + BATCH)
        .map((r) =>
          triggerPiReward(
            r.event_id,
            r.user_id,
            evt?.reward_pi_amt ?? 1,
            evt?.reward_pi_memo ?? '이벤트 미션 완료 보상',
          ),
        ),
    )
  }

  return NextResponse.json({
    message: `${targets.length}건 재시도 완료`,
    count: targets.length,
  })
}

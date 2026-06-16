import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { triggerPiReward } from '@/lib/pi-reward'

// GET /api/admin/event/pi-reward?event_id=...
// Pi 보상 지급 현황 목록 (관리자 전용)
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id') ?? 'evt-20260614-001'

  const { data, error } = await getSupabaseAdmin()
    .from('evt_pi_reward_log')
    .select(
      'evt_pi_reward_log_id, user_id, pi_uid, reward_amt, payment_id, reward_st_cd, paid_dtm, fail_reason_tx, reg_dtm, sys_user!inner(display_name, pi_username)',
    )
    .eq('event_id', eventId)
    .order('reg_dtm', { ascending: false })

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rewards: data ?? [] })
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

  const {
    event_id: eventId = 'evt-20260614-001',
    target = 'failed',
  } = body as { event_id?: string; target?: string }

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
    return NextResponse.json({ error: error.message }, { status: 500 })

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
      targets.slice(i, i + BATCH).map((r) =>
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

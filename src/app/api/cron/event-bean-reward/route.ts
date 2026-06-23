import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { grantBeanReward } from '@/lib/event'

// GET /api/cron/event-bean-reward  (1시간 주기)
// 오픈베타 이벤트 #1 — 10미션 완료자에게 5,000 Bean 자동 지급.
// 관리자 "🎁 5,000 Bean 지급" 버튼(/api/admin/event/bond-reward)과 동일 로직.
// 멱등: fn_evt_grant_bean_reward 가 PAID 게이트 + FOR UPDATE로 중복 지급 원천 차단.

const EVENT_ID = 'evt-20260614-001'
const EVENT_REWARD_BEAN = 5000

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()

  // 이벤트 활성 여부 — 비활성이면 조용히 스킵
  const { data: evtRow } = await db
    .from('evt_event')
    .select('reward_mission_count_no, reward_pi_yn')
    .eq('event_id', EVENT_ID)
    .maybeSingle()
  const evt = evtRow as { reward_mission_count_no: number; reward_pi_yn: string } | null
  if (!evt || evt.reward_pi_yn !== 'Y') {
    return NextResponse.json({ ok: true, skipped: 'event_inactive', granted: 0, already: 0, failed: 0 })
  }

  const required = evt.reward_mission_count_no ?? 10

  // 완료 미션 집계 (논리삭제 제외)
  const { data: missionRows, error: mErr } = await db
    .from('evt_user_mission')
    .select('user_id')
    .eq('event_id', EVENT_ID)
    .eq('del_yn', 'N')
  if (mErr) {
    console.error('[cron/event-bean-reward] 미션 조회 실패:', mErr)
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })
  }

  const counts = new Map<string, number>()
  for (const r of missionRows ?? []) {
    const uid = (r as { user_id: string }).user_id
    counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }

  // 제외 대상자(어뷰저) — 보상에서도 제외
  const { data: exRows } = await db
    .from('evt_exclude')
    .select('user_id')
    .eq('event_id', EVENT_ID)
    .eq('del_yn', 'N')
  const excluded = new Set(
    (exRows ?? []).map(e => (e as { user_id: string }).user_id),
  )

  // 보상 대상: 완료 미션 수 ≥ 기준 AND 제외자 아님
  const targets = [...counts.entries()]
    .filter(([uid, c]) => c >= required && !excluded.has(uid))
    .map(([uid]) => uid)

  let granted = 0
  let already = 0
  let failed = 0
  for (const uid of targets) {
    const result = await grantBeanReward(EVENT_ID, uid, EVENT_REWARD_BEAN)
    if (result === 'GRANTED') granted++
    else if (result === 'ALREADY') already++
    else {
      failed++
      console.warn(`[cron/event-bean-reward] uid=${uid} result=${result}`)
    }
  }

  console.log(
    `[cron/event-bean-reward] eligible=${targets.length} granted=${granted} already=${already} failed=${failed} excluded=${excluded.size}`,
  )
  return NextResponse.json({
    ok: true,
    eventId: EVENT_ID,
    eligible: targets.length,
    granted,
    already,
    failed,
    excludedCount: excluded.size,
  })
}

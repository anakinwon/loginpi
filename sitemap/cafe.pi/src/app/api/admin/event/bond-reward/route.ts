import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { grantBeanReward } from '@/lib/event'
import { recordPendingEvtPiReward } from '@/lib/pi-reward'
import { getActiveFeeMode, beanToPi } from '@/lib/fee-resolver'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

// 오픈베타#1 보상 금액 (Bean) — subtitle '선착순 100명 5,000 Bean Token'과 일치
const EVENT_REWARD_BEAN = 5000

// POST /api/admin/event/bond-reward
// 10미션 완료자 보상 지급 (관리자 전용, PRD_24 §0 이중 요금모드):
//   BEAN모드: 5,000 Bean 지급 (기존 경로)
//   PI모드:   evt_pi_reward_log PENDING 대기 기록 → 관리자가 Pi 보상 화면
//             (/api/admin/event/pi-reward POST)에서 검토 후 실송금(2단계 승인 게이트 —
//             고액(인당 수십 Pi) 유출 전 금액·대상 확인 기회 확보)
//
// 중복 지급 방지: 실제 지급은 DB 함수 fn_evt_grant_bean_reward(sql/095)가
// 단일 트랜잭션 + FOR UPDATE + reward_st_cd='PAID' 게이트로 원자 처리(mint+apply).
// 이미 지급(PAID)된 사용자는 RPC가 'ALREADY'로 차단 → 미지급자만 5,000 Bean 지급.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('ADM_ADMIN_REQUIRED', 403)

  let body: { event_id?: string } = {}
  try {
    body = (await req.json()) as { event_id?: string }
  } catch {
    // 본문이 없어도 기본 이벤트로 진행
  }
  const eventId = body.event_id ?? 'evt-20260614-001'

  const db = getSupabaseAdmin()

  // 보상 설정 확인
  const { data: evtRow } = await db
    .from('evt_event')
    .select('reward_mission_count_no, reward_pi_yn, reward_pi_amt')
    .eq('event_id', eventId)
    .maybeSingle()
  const evt = evtRow as {
    reward_mission_count_no: number
    reward_pi_yn: string
    reward_pi_amt: number | null
  } | null
  if (!evt) return apiError('ADM_EVT_NOT_FOUND', 404)
  if (evt.reward_pi_yn !== 'Y') return apiError('ADM_EVT_REWARD_INACTIVE', 400)

  const required = evt.reward_mission_count_no ?? 10

  // 완료 미션 집계 (논리삭제 제외)
  const { data: missionRows, error: mErr } = await db
    .from('evt_user_mission')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')
  if (mErr)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/event/bond-reward/post',
          mErr,
          '미션 집계 조회 실패',
        ),
      },
      { status: 500 },
    )

  const counts = new Map<string, number>()
  for (const r of missionRows ?? []) {
    const uid = (r as { user_id: string }).user_id
    counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }

  // 제외 대상자(어뷰저) — 보상에서도 제외
  const { data: exRows } = await db
    .from('evt_exclude')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('del_yn', 'N')
  const excluded = new Set(
    (exRows ?? []).map((e) => (e as { user_id: string }).user_id),
  )

  // 보상 대상: 완료 미션 수 ≥ 기준 AND 제외자 아님
  const targets = [...counts.entries()]
    .filter(([uid, c]) => c >= required && !excluded.has(uid))
    .map(([uid]) => uid)

  // 순차 지급 — RPC가 원자적이라 결과 상태만 누적 집계
  let granted = 0
  let already = 0
  let failed = 0
  const errors: string[] = []

  // PI모드: 대기 기록만 — 실송금은 Pi 보상 화면에서 검토 후 실행(2단계 승인 게이트)
  const mode = await getActiveFeeMode()
  if (mode === 'PI') {
    const piAmt = Number(evt.reward_pi_amt) || beanToPi(EVENT_REWARD_BEAN)
    for (const uid of targets) {
      const result = await recordPendingEvtPiReward(eventId, uid, piAmt)
      if (result === 'RECORDED') granted++
      else if (result === 'ALREADY') already++
      else {
        failed++
        errors.push(`${uid}:${result}`)
      }
    }
    return NextResponse.json({
      ok: true,
      eventId,
      mode: 'PI',
      message: `PI모드 — ${granted}건 대기 기록. 실송금은 Pi 보상 관리에서 실행하세요.`,
      eligible: targets.length,
      granted,
      already,
      failed,
      excludedCount: excluded.size,
      ...(errors.length ? { errors } : {}),
    })
  }

  for (const uid of targets) {
    const result = await grantBeanReward(eventId, uid, EVENT_REWARD_BEAN)
    if (result === 'GRANTED') granted++
    else if (result === 'ALREADY') already++
    else {
      failed++
      errors.push(`${uid}:${result}`)
    }
  }

  return NextResponse.json({
    ok: true,
    eventId,
    eligible: targets.length, // 보상 자격자(제외자 제외)
    granted, // 이번에 신규 지급
    already, // 이미 지급되어 건너뜀(중복 차단)
    failed, // 실패
    excludedCount: excluded.size,
    ...(errors.length ? { errors } : {}),
  })
}

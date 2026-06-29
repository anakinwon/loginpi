import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { grantBeanReward } from '@/lib/event'

// GET /api/cron/event-bean-reward  (1시간 주기, Vercel Cron: 0 * * * *)
// POST /api/cron/event-bean-reward  (관리자 수동 실행)
// 오픈베타 이벤트 #1 — 10미션 완료자에게 5,000 Bean 자동 지급.
// 멱등: fn_evt_grant_bean_reward 가 PAID 게이트 + FOR UPDATE로 중복 지급 원천 차단.

const EVENT_ID = 'evt-20260614-001'
const EVENT_REWARD_BEAN = 5000

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface RewardResult {
  skipped?: string
  eligible: number
  granted: number
  already: number
  failed: number
  excludedCount: number
}

async function runReward(): Promise<RewardResult> {
  const db = getSupabaseAdmin()

  const { data: evtRow } = await db
    .from('evt_event')
    .select('reward_mission_count_no, reward_pi_yn')
    .eq('event_id', EVENT_ID)
    .maybeSingle()
  const evt = evtRow as {
    reward_mission_count_no: number
    reward_pi_yn: string
  } | null
  if (!evt || evt.reward_pi_yn !== 'Y') {
    return {
      skipped: 'event_inactive',
      eligible: 0,
      granted: 0,
      already: 0,
      failed: 0,
      excludedCount: 0,
    }
  }

  const required = evt.reward_mission_count_no ?? 10

  const { data: missionRows, error: mErr } = await db
    .from('evt_user_mission')
    .select('user_id')
    .eq('event_id', EVENT_ID)
    .eq('del_yn', 'N')
  if (mErr) throw new Error(mErr.message)

  const counts = new Map<string, number>()
  for (const r of missionRows ?? []) {
    const uid = (r as { user_id: string }).user_id
    counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }

  const { data: exRows } = await db
    .from('evt_exclude')
    .select('user_id')
    .eq('event_id', EVENT_ID)
    .eq('del_yn', 'N')
  const excluded = new Set(
    (exRows ?? []).map((e) => (e as { user_id: string }).user_id),
  )

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
      console.warn(`[event-bean-reward] uid=${uid} result=${result}`)
    }
  }

  return {
    eligible: targets.length,
    granted,
    already,
    failed,
    excludedCount: excluded.size,
  }
}

async function logBatchRun(
  triggerCd: string,
  start: Date,
  result: RewardResult,
  regrId: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await getSupabaseAdmin()
    .from('sys_batch_log')
    .insert({
      job_nm: 'event_bean_reward',
      trigger_cd: triggerCd,
      from_dt: today,
      to_dt: today,
      start_dtm: start.toISOString(),
      end_dtm: new Date().toISOString(),
      success_yn: result.failed === 0 ? 'Y' : 'N',
      total_cnt: result.eligible,
      failed_cnt: result.failed,
      result_msg: result.skipped
        ? `skipped=${result.skipped}`
        : `granted=${result.granted} already=${result.already} failed=${result.failed} excluded=${result.excludedCount}`,
      regr_id: regrId,
      modr_id: regrId,
    })
  if (error) console.error('[event-bean-reward] logBatchRun 실패:', error)
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const start = new Date()
  try {
    const result = await runReward()
    await logBatchRun('CRON', start, result, 'SYSTEM')
    console.log(`[cron/event-bean-reward] ${JSON.stringify(result)}`)
    return NextResponse.json({ ok: true, eventId: EVENT_ID, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/event-bean-reward] 실행 실패:', msg)
    await logBatchRun(
      'CRON',
      start,
      { eligible: 0, granted: 0, already: 0, failed: 1, excludedCount: 0 },
      'SYSTEM',
    )
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(_request: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const start = new Date()
  try {
    const result = await runReward()
    await logBatchRun('MANUAL', start, result, user?.id ?? 'ADMIN')
    return NextResponse.json({ ok: true, eventId: EVENT_ID, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

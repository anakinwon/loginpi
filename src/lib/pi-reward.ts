import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// Pi Network A2U(App-to-User) 결제 — 서버가 사용자 지갑으로 Pi를 전송.
// 흐름: POST /v2/payments (생성) → POST /approve → POST /complete
// 자격증명: PI_API_KEY (서버 전용, Pi Developer Portal 발급)
// 참고: https://minepi.com/developers
const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

/**
 * 이벤트 미션 완료자에게 Pi 코인 자동 지급 (A2U 1회성 보상)
 *
 * 멱등 보장: evt_pi_reward_log UNIQUE(event_id, user_id)
 *   - PAID  → 즉시 skip (중복 지급 방지)
 *   - PENDING/FAILED → 재시도
 *   - 없음 → 신규 INSERT 후 지급
 */
export async function triggerPiReward(
  eventId: string,
  userId: string,
  rewardAmt: number,
  rewardMemo: string,
): Promise<void> {
  const db = getSupabaseAdmin()

  // Pi UID 조회
  const { data: userRow } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', userId)
    .maybeSingle()
  const piUid = (userRow as { pi_uid: string | null } | null)?.pi_uid

  if (!piUid) {
    await upsertRewardLog(db, eventId, userId, 'UNKNOWN', rewardAmt, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'Pi UID 없음 — Pi 계정으로 로그인 후 재시도 필요',
    })
    return
  }

  // 이미 PAID면 중복 지급 차단
  const { data: existing } = await db
    .from('evt_pi_reward_log')
    .select('evt_pi_reward_log_id, reward_st_cd')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()
  const existingRow = existing as {
    evt_pi_reward_log_id: string
    reward_st_cd: string
  } | null

  if (existingRow?.reward_st_cd === 'PAID') return

  // PENDING 기록 (새로 생성 or 기존 FAILED → PENDING 전환)
  await upsertRewardLog(db, eventId, userId, piUid, rewardAmt, {
    reward_st_cd: 'PENDING',
    fail_reason_tx: null,
  })

  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    await updateRewardLog(db, eventId, userId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'PI_API_KEY 환경변수 미설정',
    })
    console.error(`[Pi 보상] PI_API_KEY 미설정 — event=${eventId} user=${userId}`)
    return
  }

  try {
    // Step 1: A2U 결제 생성
    const createRes = await fetch(PI_PAYMENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: {
          amount: rewardAmt,
          memo: rewardMemo,
          metadata: {
            event_id: eventId,
            user_id: userId,
            reward_type: 'MISSION_COMPLETE',
          },
        },
        uid: piUid,
      }),
    })

    if (!createRes.ok) {
      throw new Error(
        `결제 생성 실패 (${createRes.status}): ${await createRes.text()}`,
      )
    }

    const created = (await createRes.json()) as { identifier: string }
    const paymentId = created.identifier

    // Step 2: 승인
    const approveRes = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!approveRes.ok) {
      throw new Error(
        `결제 승인 실패 (${approveRes.status}): ${await approveRes.text()}`,
      )
    }

    // Step 3: 완료
    const completeRes = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!completeRes.ok) {
      throw new Error(
        `결제 완료 실패 (${completeRes.status}): ${await completeRes.text()}`,
      )
    }

    await updateRewardLog(db, eventId, userId, {
      payment_id: paymentId,
      reward_st_cd: 'PAID',
      paid_dtm: new Date().toISOString(),
    })
    console.info(
      `[Pi 보상] 지급 완료 — event=${eventId} user=${userId} payment=${paymentId} amt=${rewardAmt}Pi`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류'
    await updateRewardLog(db, eventId, userId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: msg.slice(0, 500),
    })
    console.error(`[Pi 보상] 지급 실패 — event=${eventId} user=${userId}: ${msg}`)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

async function upsertRewardLog(
  db: SupabaseAdmin,
  eventId: string,
  userId: string,
  piUid: string,
  rewardAmt: number,
  fields: Record<string, unknown>,
) {
  const now = new Date().toISOString()
  await db.from('evt_pi_reward_log').upsert(
    {
      event_id: eventId,
      user_id: userId,
      pi_uid: piUid,
      reward_amt: rewardAmt,
      modr_id: 'SYSTEM',
      mod_dtm: now,
      ...fields,
    },
    { onConflict: 'event_id,user_id' },
  )
}

async function updateRewardLog(
  db: SupabaseAdmin,
  eventId: string,
  userId: string,
  fields: Record<string, unknown>,
) {
  const now = new Date().toISOString()
  await db
    .from('evt_pi_reward_log')
    .update({ modr_id: 'SYSTEM', mod_dtm: now, ...fields })
    .eq('event_id', eventId)
    .eq('user_id', userId)
}

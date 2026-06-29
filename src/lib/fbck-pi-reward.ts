import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 후기 보상 Pi A2U(App-to-User) 송금 — PI 모드에서 후기 작성자에게 Pi를 직접 전송. PRD_24 §0.
// 흐름: POST /v2/payments (생성) → /approve → /complete (triggerPiReward와 동일 패턴)
// 멱등: fbck_pi_reward_log UNIQUE(fbck_id) — PAID면 즉시 skip(중복 송금 차단), PENDING/FAILED는 재시도.
// 트리거: feedback POST의 after() 즉시 시도 + cron(/api/cron/fbck-pi-payout) 안전망 재시도.
const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

type Db = ReturnType<typeof getSupabaseAdmin>

/**
 * 후기 보상 Pi A2U 송금 (멱등). 이미 PAID면 skip, 그 외엔 PENDING 전환 후 송금 시도.
 * @param fbckId 후기 식별자(멱등 키)
 * @param usrId  보상 수령자(후기 작성자)
 * @param piAmt  송금액(Pi, 보상 Bean ÷ 100)
 */
export async function payFbckPiReward(
  fbckId: string,
  usrId: string,
  piAmt: number,
): Promise<void> {
  const db = getSupabaseAdmin()

  if (!(piAmt > 0)) return

  // 이미 PAID면 중복 송금 차단
  const { data: existing } = await db
    .from('fbck_pi_reward_log')
    .select('fbck_pi_log_id, reward_st_cd')
    .eq('fbck_id', fbckId)
    .maybeSingle()
  if ((existing as { reward_st_cd: string } | null)?.reward_st_cd === 'PAID')
    return

  // Pi UID 조회 — 없으면 FAILED(추후 Pi 로그인하면 cron 재시도)
  const { data: userRow } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', usrId)
    .maybeSingle()
  const piUid = (userRow as { pi_uid: string | null } | null)?.pi_uid

  if (!piUid) {
    await upsertLog(db, fbckId, usrId, piAmt, {
      pi_uid: null,
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'Pi UID 없음 — Pi 계정으로 로그인 후 재시도 필요',
    })
    return
  }

  // PENDING 기록(신규 또는 FAILED→재시도 전환)
  await upsertLog(db, fbckId, usrId, piAmt, {
    pi_uid: piUid,
    reward_st_cd: 'PENDING',
    fail_reason_tx: null,
  })

  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    await updateLog(db, fbckId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'PI_API_KEY 환경변수 미설정',
    })
    console.error(`[후기 Pi보상] PI_API_KEY 미설정 — fbck=${fbckId}`)
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
          amount: piAmt,
          memo: '이용후기 보상',
          metadata: { fbck_id: fbckId, usr_id: usrId, reward_type: 'FEEDBACK' },
          uid: piUid,
        },
      }),
    })
    if (!createRes.ok)
      throw new Error(
        `결제 생성 실패 (${createRes.status}): ${await createRes.text()}`,
      )
    const created = (await createRes.json()) as { identifier: string }
    const paymentId = created.identifier

    // Step 2: 승인
    const approveRes = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!approveRes.ok)
      throw new Error(
        `결제 승인 실패 (${approveRes.status}): ${await approveRes.text()}`,
      )

    // Step 3: 완료
    const completeRes = await fetch(
      `${PI_PAYMENTS_URL}/${paymentId}/complete`,
      {
        method: 'POST',
        headers: { Authorization: `Key ${apiKey}` },
      },
    )
    if (!completeRes.ok)
      throw new Error(
        `결제 완료 실패 (${completeRes.status}): ${await completeRes.text()}`,
      )

    await updateLog(db, fbckId, {
      payment_id: paymentId,
      reward_st_cd: 'PAID',
      paid_dtm: new Date().toISOString(),
    })
    console.info(
      `[후기 Pi보상] 송금 완료 — fbck=${fbckId} user=${usrId} payment=${paymentId} amt=${piAmt}Pi`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류'
    await updateLog(db, fbckId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: msg.slice(0, 500),
    })
    console.error(`[후기 Pi보상] 송금 실패 — fbck=${fbckId}: ${msg}`)
  }
}

/** PENDING/FAILED 대기 보상 일괄 재시도 (cron). 처리 건수 반환. */
export async function payPendingFbckPiRewards(limit = 50): Promise<{
  processed: number
}> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('fbck_pi_reward_log')
    .select('fbck_id, usr_id, pi_amt')
    .in('reward_st_cd', ['PENDING', 'FAILED'])
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })
    .limit(limit)

  const rows =
    (data as { fbck_id: string; usr_id: string; pi_amt: number }[] | null) ?? []
  for (const r of rows) {
    await payFbckPiReward(r.fbck_id, r.usr_id, Number(r.pi_amt))
  }
  return { processed: rows.length }
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — fbck_id UNIQUE 기준 upsert/update

async function upsertLog(
  db: Db,
  fbckId: string,
  usrId: string,
  piAmt: number,
  fields: Record<string, unknown>,
) {
  await db.from('fbck_pi_reward_log').upsert(
    {
      fbck_id: fbckId,
      usr_id: usrId,
      pi_amt: piAmt,
      modr_id: 'SYSTEM',
      mod_dtm: new Date().toISOString(),
      ...fields,
    },
    { onConflict: 'fbck_id' },
  )
}

async function updateLog(
  db: Db,
  fbckId: string,
  fields: Record<string, unknown>,
) {
  await db
    .from('fbck_pi_reward_log')
    .update({ modr_id: 'SYSTEM', mod_dtm: new Date().toISOString(), ...fields })
    .eq('fbck_id', fbckId)
}

import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 카페방 Pi 선물(P2P) A2U 송금 — 앱이 받는 사람에게 Pi 전송. PRD_24 §0.
// Pi는 U2U 직접 송금 불가 → 보내는 사람 U2A 결제(앱 수령) 후 앱이 받는 사람에게 A2U.
// 멱등: tip_pi_payout_log UNIQUE(payment_id) — PAID면 skip, PENDING/FAILED 재시도.
// 트리거: complete의 after() 즉시 + cron(/api/cron/tip-pi-payout) 안전망.
const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

type Db = ReturnType<typeof getSupabaseAdmin>

/** Pi 선물 A2U 송금(멱등). payment_id=보내는 사람 U2A 결제 식별자(멱등 키). */
export async function payTipPiReward(paymentId: string): Promise<void> {
  const db = getSupabaseAdmin()

  const { data: log } = await db
    .from('tip_pi_payout_log')
    .select('payment_id, recipient_id, pi_amt, reward_st_cd')
    .eq('payment_id', paymentId)
    .maybeSingle()
  const row = log as {
    recipient_id: string
    pi_amt: number
    reward_st_cd: string
  } | null
  if (!row || row.reward_st_cd === 'PAID') return // 없거나 이미 송금됨

  // 받는 사람 Pi UID
  const { data: rcpt } = await db
    .from('sys_user')
    .select('pi_uid')
    .eq('id', row.recipient_id)
    .maybeSingle()
  const piUid = (rcpt as { pi_uid: string | null } | null)?.pi_uid
  if (!piUid) {
    await update(db, paymentId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: '받는 사람 Pi UID 없음 — Pi 계정 로그인 후 재시도',
    })
    return
  }

  await update(db, paymentId, {
    recipient_pi_uid: piUid,
    reward_st_cd: 'PENDING',
    fail_reason_tx: null,
  })

  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    await update(db, paymentId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'PI_API_KEY 미설정',
    })
    console.error(`[Pi 선물] PI_API_KEY 미설정 — payment=${paymentId}`)
    return
  }

  const piAmt = Number(row.pi_amt)
  try {
    const createRes = await fetch(PI_PAYMENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: {
          amount: piAmt,
          memo: 'PICAFE tip',
          metadata: { tip_payment_id: paymentId, reward_type: 'TIP' },
          uid: piUid,
        },
      }),
    })
    if (!createRes.ok)
      throw new Error(`생성 실패 (${createRes.status}): ${await createRes.text()}`)
    const created = (await createRes.json()) as { identifier: string }
    const payoutId = created.identifier

    const approveRes = await fetch(`${PI_PAYMENTS_URL}/${payoutId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!approveRes.ok)
      throw new Error(`승인 실패 (${approveRes.status}): ${await approveRes.text()}`)

    const completeRes = await fetch(`${PI_PAYMENTS_URL}/${payoutId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!completeRes.ok)
      throw new Error(`완료 실패 (${completeRes.status}): ${await completeRes.text()}`)

    await update(db, paymentId, {
      payout_payment_id: payoutId,
      reward_st_cd: 'PAID',
      paid_dtm: new Date().toISOString(),
    })
    console.info(
      `[Pi 선물] 송금 완료 — payment=${paymentId} payout=${payoutId} amt=${piAmt}Pi`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류'
    await update(db, paymentId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: msg.slice(0, 500),
    })
    console.error(`[Pi 선물] 송금 실패 — payment=${paymentId}: ${msg}`)
  }
}

/** PENDING/FAILED 대기 선물 송금 일괄 재시도 (cron). */
export async function payPendingTipPiRewards(limit = 50): Promise<{
  processed: number
}> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('tip_pi_payout_log')
    .select('payment_id')
    .in('reward_st_cd', ['PENDING', 'FAILED'])
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })
    .limit(limit)
  const rows = (data as { payment_id: string }[] | null) ?? []
  for (const r of rows) await payTipPiReward(r.payment_id)
  return { processed: rows.length }
}

async function update(db: Db, paymentId: string, fields: Record<string, unknown>) {
  await db
    .from('tip_pi_payout_log')
    .update({ modr_id: 'SYSTEM', mod_dtm: new Date().toISOString(), ...fields })
    .eq('payment_id', paymentId)
}

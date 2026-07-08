import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 캠페인 보상 Pi A2U(App-to-User) 송금 — PI모드에서 캠페인 보상을 Pi로 직접 전송. PRD_24 §0.
// ⭐ 관리자 승인 게이트: 이 함수는 관리자 승인 경로(approve·grant-all 버튼)에서만 호출된다.
//   무인 cron(campaign-grant-all)은 신청(PENDING)까지만 만들고 승인·송금하지 않는다.
// 멱등: bean_campaign_pi_reward_log UNIQUE(campaign_cd, usr_id) — PAID면 즉시 skip,
//   PENDING/FAILED는 재시도(fbck-pi-payout cron 안전망 — 승인 완료분만 존재하므로 게이트 유지).
const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

type Db = ReturnType<typeof getSupabaseAdmin>

/**
 * 캠페인 보상 Pi A2U 송금 (멱등). 이미 PAID면 skip, 그 외엔 PENDING 전환 후 송금 시도.
 * @param campaignCd 캠페인 코드(멱등 키 일부)
 * @param usrId      보상 수령자
 * @param piAmt      송금액(Pi, 보상 Bean ÷ 100)
 */
export async function payCampaignPiReward(
  campaignCd: string,
  usrId: string,
  piAmt: number,
): Promise<void> {
  const db = getSupabaseAdmin()

  if (!(piAmt > 0)) return

  // 이미 PAID면 중복 송금 차단
  const { data: existing } = await db
    .from('bean_campaign_pi_reward_log')
    .select('camp_pi_log_id, reward_st_cd')
    .eq('campaign_cd', campaignCd)
    .eq('usr_id', usrId)
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
    await upsertLog(db, campaignCd, usrId, piAmt, {
      pi_uid: null,
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'Pi UID 없음 — Pi 계정으로 로그인 후 재시도 필요',
    })
    return
  }

  // PENDING 기록(신규 또는 FAILED→재시도 전환)
  await upsertLog(db, campaignCd, usrId, piAmt, {
    pi_uid: piUid,
    reward_st_cd: 'PENDING',
    fail_reason_tx: null,
  })

  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    await updateLog(db, campaignCd, usrId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: 'PI_API_KEY 환경변수 미설정',
    })
    console.error(
      `[캠페인 Pi보상] PI_API_KEY 미설정 — campaign=${campaignCd} user=${usrId}`,
    )
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
          memo: '캠페인 보상',
          metadata: {
            campaign_cd: campaignCd,
            usr_id: usrId,
            reward_type: 'CAMPAIGN',
          },
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

    await updateLog(db, campaignCd, usrId, {
      payment_id: paymentId,
      reward_st_cd: 'PAID',
      paid_dtm: new Date().toISOString(),
    })
    console.info(
      `[캠페인 Pi보상] 송금 완료 — campaign=${campaignCd} user=${usrId} payment=${paymentId} amt=${piAmt}Pi`,
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : '알 수 없는 오류'
    await updateLog(db, campaignCd, usrId, {
      reward_st_cd: 'FAILED',
      fail_reason_tx: msg.slice(0, 500),
    })
    console.error(
      `[캠페인 Pi보상] 송금 실패 — campaign=${campaignCd} user=${usrId}: ${msg}`,
    )
  }
}

/** 승인 완료분(PENDING/FAILED) 일괄 재시도 (fbck-pi-payout cron 안전망). 처리 건수 반환. */
export async function payPendingCampaignPiRewards(limit = 50): Promise<{
  processed: number
}> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('bean_campaign_pi_reward_log')
    .select('campaign_cd, usr_id, pi_amt')
    .in('reward_st_cd', ['PENDING', 'FAILED'])
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })
    .limit(limit)

  const rows =
    (data as
      | { campaign_cd: string; usr_id: string; pi_amt: number }[]
      | null) ?? []
  for (const r of rows) {
    await payCampaignPiReward(r.campaign_cd, r.usr_id, Number(r.pi_amt))
  }
  return { processed: rows.length }
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — (campaign_cd, usr_id) UNIQUE 기준 upsert/update

async function upsertLog(
  db: Db,
  campaignCd: string,
  usrId: string,
  piAmt: number,
  fields: Record<string, unknown>,
) {
  await db.from('bean_campaign_pi_reward_log').upsert(
    {
      campaign_cd: campaignCd,
      usr_id: usrId,
      pi_amt: piAmt,
      modr_id: 'SYSTEM',
      mod_dtm: new Date().toISOString(),
      ...fields,
    },
    { onConflict: 'campaign_cd,usr_id' },
  )
}

async function updateLog(
  db: Db,
  campaignCd: string,
  usrId: string,
  fields: Record<string, unknown>,
) {
  await db
    .from('bean_campaign_pi_reward_log')
    .update({ modr_id: 'SYSTEM', mod_dtm: new Date().toISOString(), ...fields })
    .eq('campaign_cd', campaignCd)
    .eq('usr_id', usrId)
}

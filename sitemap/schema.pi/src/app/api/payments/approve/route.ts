// 요금제 결제 승인 — POST { paymentId }. SDK onReadyForServerApproval 에서 호출(piFetch)
//  순서(sitemap.pi 검증 패턴) : Pi 조회(GET) → metadata·방향·결제자 uid·결제자 역할·이중 결제·정가 검증 → 원장 APPROVED → 그 다음 Pi approve(이후 사용자 서명)
//  업그레이드(prd_cd U) = 10분 전 기준 일할 금액 이상 ~ 지금 금액 이하(준비 직후 날짜 경계를 넘어도 통과, 과다 금액 거부)
//  원장 meta_val = 검증한 metadata 만(클라이언트가 덧붙인 키는 저장 안 함 — DB 함수가 읽는 값은 모두 검증된 값)
//  검증 실패 = Pi 측도 cancel(best-effort), Pi approve 실패 = 원장 CANCELED 로 되돌림
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { approvePiPayment, cancelPiPayment, getPiPayment, hasOtherApproved, markCanceled, parseAreaPlanMeta, payerAuth, planPrice } from '@/lib/payments'
import { areaPlan, subscribed, upgradeQuotes } from '@/lib/plan'

const SLACK_MS = 10 * 60_000 // 업그레이드 금액 창 : 준비 ~ 승인 사이 날짜 경계를 넘는 경우만 허용(10분)
const body = z.object({ paymentId: z.string().min(1).max(200) })

export async function POST(req: Request) {
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const got = await getPiPayment(b.paymentId)
  if (!got.ok) {
    if (got.status === 500) return apiError('PAY_PI_KEY', 500)
    console.error('[payments/approve] Pi GET', got.status, got.body.slice(0, 300))
    return apiError('PAY_PI_FAILED', 502)
  }
  const p = got.payment
  const meta = parseAreaPlanMeta(p.metadata)
  if (!meta) return apiError('PAY_MISMATCH', 400) // 이 앱 요금제 결제가 아님 — Pi 취소 안 함
  const who = await payerAuth(meta.area_id)
  if (who instanceof NextResponse) return who
  if (p.user_uid !== who.piUid) return apiError('PAY_MISMATCH', 403) // 타인 결제 = Pi 취소 없이 거부
  const reject = async (code: Parameters<typeof apiError>[0], status: number) => {
    await cancelPiPayment(p.identifier).catch(() => undefined)
    return apiError(code, status)
  }
  if (p.direction !== 'user_to_app' || p.status.cancelled || p.status.user_cancelled) return reject('PAY_MISMATCH', 409)
  try {
    if (await hasOtherApproved(meta.area_id, p.identifier)) return reject('PAY_DUP', 409)
    const amt = Number(p.amount)
    if (meta.prd_cd === 'U') {
      const now = Date.now()
      const [cur, prev] = await Promise.all([upgradeQuotes(meta.area_id, now), upgradeQuotes(meta.area_id, now - SLACK_MS)])
      const q = cur.from === meta.from_plan ? cur.quotes.find((x) => x.plan_cd === meta.plan_cd && x.prd === meta.prd) : undefined
      if (!q) return reject('PAY_UPGRADE', 409) // 현재 요금제·기간이 준비 뒤 바뀜
      // 사용 일수가 늘면 차감이 줄어 금액이 오름 → 10분 전 금액(준비가 날짜 경계 전) 이상 ~ 지금 금액 이하
      const lo = Math.min(q.amount, prev.quotes.find((x) => x.plan_cd === meta.plan_cd && x.prd === meta.prd)?.amount ?? q.amount)
      if (amt < lo - 1e-6 || amt > q.amount + 1e-6) return reject('PAY_AMOUNT', 400)
    } else {
      const cur = await areaPlan(meta.area_id)
      if (subscribed(cur) && meta.plan_cd !== cur.plan) return reject('PAY_SUBSCRIBED', 409) // 구독 중 = 업그레이드 + 현재 요금제 선결제만
      const price = await planPrice(meta.plan_cd, meta.prd_cd)
      if (price == null || Math.abs(amt - price) > 1e-6) return reject('PAY_AMOUNT', 400) // 정가와 정확히 일치(초과도 거부)
    }
    const uid = who.user.usr_id
    // 원장 기록(APPROVED) — Pi approve 보다 먼저, 재호출 무시(멱등)
    const up = await db()
      .from('pi_pymnt')
      .upsert({ pymnt_id: p.identifier, usr_id: uid, pi_uid: p.user_uid, pi_amt: p.amount, memo_txt: p.memo, meta_val: meta, pymnt_tp_cd: meta.type, pymnt_sts_cd: 'APPROVED', regr_id: uid, modr_id: uid }, { onConflict: 'pymnt_id', ignoreDuplicates: true })
    if (up.error) return dbError(up.error)
    const r = await approvePiPayment(p.identifier)
    if (!r.ok && !r.alreadyApproved) {
      console.error('[payments/approve] Pi approve', r.status, r.body.slice(0, 300))
      await cancelPiPayment(p.identifier).catch(() => undefined) // Pi 측 pending 정리 — 남으면 다음 createPayment 거부
      await markCanceled(p.identifier, uid)
      return apiError('PAY_PI_FAILED', 502)
    }
    return NextResponse.json({ ok: true, paymentId: p.identifier })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

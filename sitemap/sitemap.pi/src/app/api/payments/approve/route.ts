// 결제 승인 — POST /api/payments/approve { paymentId }. Pi SDK onReadyForServerApproval 에서 호출(piFetch).
//  순서(2026-10-11 적대적 검증 반영) : 세션 → Pi API **조회(GET)** → metadata(SITE_REG)·결제자 uid·사이트 소유/상태/미결제·이중 결제·정가 검증
//   → pi_pymnt APPROVED 기록 → **그 다음** Pi API approve. approve 뒤에는 사용자 서명·온체인 전송이 진행되므로, 검증 실패는 approve 전에 거부하고 Pi 측도 cancel 한다.
//  Pi approve 가 실패하면 원장을 CANCELED 로 되돌린다(좀비 APPROVED 방지)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuthGuard } from '@pi/guard'
import {
  apiError,
  db,
  dbFail,
  dbRoute,
  parseBody,
  requireUser,
} from '@/lib/api'
import {
  approvePiPayment,
  cancelPiPayment,
  getPiPayment,
  getRegFee,
  hasOtherApprovedPayment,
  markPaymentCanceled,
  parseSiteRegMeta,
} from '@/lib/payments'
import { PAYABLE_STS, type SiteSts } from '@/lib/site'

const bodySchema = z.object({ paymentId: z.string().min(1).max(200) })

export const POST = withAuthGuard(
  dbRoute(async (req) => {
    const user = await requireUser(req)
    if (user instanceof NextResponse) return user
    const body = await parseBody(req, bodySchema)
    if (body instanceof NextResponse) return body

    // 1) 결제 객체 조회 — 승인 전이라 지갑 변동 없음
    const got = await getPiPayment(body.paymentId)
    if (!got.ok) {
      if (got.status === 500) return apiError('SERVER_CONFIG', 500)
      console.error('[payments/approve] Pi GET', got.status, got.body.slice(0, 300))
      return apiError('PAY_PI_APPROVE_FAILED', 502)
    }
    const payment = got.payment
    // 거부 경로 공통 — Pi 측도 취소(best-effort) 후 오류 반환
    const reject = async (code: Parameters<typeof apiError>[0], status: number) => {
      await cancelPiPayment(payment.identifier).catch(() => undefined)
      return apiError(code, status)
    }

    // 2) 검증
    const meta = parseSiteRegMeta(payment.metadata)
    if (!meta) return reject('PAY_SITE_MISMATCH', 400)
    if (payment.direction !== 'user_to_app') return reject('PAY_SITE_MISMATCH', 400)
    // 결제자 불일치 — 타인 결제이므로 Pi cancel 없이 거부(reject 미사용). Pi 세션 없는(pi_uid 없음) 사용자도 결제 불가
    if (!user.pi_uid || payment.user_uid !== user.pi_uid)
      return apiError('PAY_SITE_MISMATCH', 403)
    if (payment.status.cancelled || payment.status.user_cancelled)
      return reject('PAY_SITE_MISMATCH', 409)

    const { data: site, error } = await db()
      .from('site_mst')
      .select('site_id, site_sts_cd, plan_cd, pymnt_id, own_site_yn')
      .eq('site_id', meta.site_id)
      .eq('ownr_usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle<{
        site_id: string
        site_sts_cd: SiteSts
        plan_cd: string
        pymnt_id: string | null
        own_site_yn: 'Y' | 'N'
      }>()
    if (error) return dbFail(error)
    if (!site || site.own_site_yn === 'Y') return reject('PAY_SITE_MISMATCH', 400)
    if (!(PAYABLE_STS as readonly string[]).includes(site.site_sts_cd))
      return reject('INVALID_STATE', 409)
    if (site.pymnt_id && site.pymnt_id !== payment.identifier)
      return reject('PAY_ALREADY_PAID', 409)
    // 요금제는 사이트 현재 값 기준(prepare 이후 PATCH 로 바뀌었으면 metadata 와 불일치 → 거부)
    if (meta.plan_cd !== site.plan_cd) return reject('PAY_SITE_MISMATCH', 409)
    if (await hasOtherApprovedPayment(site.site_id, payment.identifier))
      return reject('PAY_ALREADY_PAID', 409)

    const fee = await getRegFee(site.plan_cd)
    if (!fee || fee.pi_amt <= 0) return reject('PAY_NOT_REQUIRED', 409)
    // 정가와 정확히 일치(초과도 거부 — 서버 prepare 금액 그대로여야 한다)
    if (Math.abs(Number(payment.amount) - fee.pi_amt) > 1e-6)
      return reject('PAY_AMOUNT_SHORT', 400)

    // 3) 원장 기록(APPROVED) — Pi approve 보다 먼저. 재호출은 무시(멱등)
    const { error: upErr } = await db().from('pi_pymnt').upsert(
      {
        pymnt_id: payment.identifier,
        usr_id: user.id,
        pi_uid: payment.user_uid,
        pi_amt: payment.amount,
        memo_txt: payment.memo,
        meta_val: payment.metadata,
        pymnt_tp_cd: meta.type,
        pymnt_sts_cd: 'APPROVED',
        regr_id: user.id,
        modr_id: user.id,
      },
      { onConflict: 'pymnt_id', ignoreDuplicates: true },
    )
    if (upErr) return dbFail(upErr)

    // 4) Pi approve — 실패 시 원장 CANCELED 로 되돌림
    const r = await approvePiPayment(payment.identifier)
    if (!r.ok && !r.alreadyApproved) {
      console.error('[payments/approve] Pi approve', r.status, r.body.slice(0, 300))
      // Pi 측 pending 도 정리(best-effort) — 남으면 다음 createPayment 가 거부될 수 있다
      await cancelPiPayment(payment.identifier).catch(() => undefined)
      await markPaymentCanceled(payment.identifier, user.id)
      return apiError('PAY_PI_APPROVE_FAILED', 502)
    }
    return NextResponse.json({ ok: true, paymentId: payment.identifier })
  }),
)

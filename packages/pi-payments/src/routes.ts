// @pi/payments 결제 라우트 팩토리 — approve·complete·cancel 공통 흐름 + metadata.type 핸들러 레지스트리(PRD_28 §4)
//  공통(패키지) : 세션 → Pi 조회 → 결제 방향·결제자·취소 여부 → [핸들러 정가] → 금액 일치 → 원장 APPROVED → Pi approve(실패 시 원장 CANCELED)
//  사이트(핸들러) : metadata 해석, 업무 상태 검증·정가 산정(fee_plan), complete 확정 RPC
//  출처 : sitemap.pi src/app/api/payments/{approve,complete,cancel}/route.ts(2026-10-15 추출, 순서·응답 코드 동일)
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuthGuard, type Handler } from '@pi/guard'
import {
  approvePiPayment,
  cancelPiPayment,
  completePiPayment,
  getPiPayment,
} from './pi-api'
import { createLedger } from './ledger'

// 사이트 apiError 카탈로그가 반드시 가진 결제 오류 코드
export type PayErrorCode =
  | 'SERVER_CONFIG'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'PAY_SITE_MISMATCH'
  | 'PAY_ALREADY_PAID'
  | 'PAY_NOT_REQUIRED'
  | 'PAY_AMOUNT_SHORT'
  | 'PAY_PI_APPROVE_FAILED'
  | 'PAY_PI_COMPLETE_FAILED'
  | 'PAY_PI_CANCEL_FAILED'

export interface PayUser {
  id: string
  pi_uid: string | null
}

// 사이트 공용 헬퍼 주입(lib/api) — 오류 카탈로그·DB·인증 게이트는 사이트마다 다르다
export interface PaymentRouteDeps<U extends PayUser> {
  db: () => SupabaseClient
  requireUser: (req: NextRequest) => Promise<U | NextResponse>
  parseBody: <T>(
    req: NextRequest,
    schema: {
      safeParse: (v: unknown) => { success: true; data: T } | { success: false }
    },
  ) => Promise<T | NextResponse>
  apiError: (code: PayErrorCode, status: number) => NextResponse
  dbFail: (error: { code?: string; message?: string }) => NextResponse
  dbRoute: (handler: Handler) => Handler
}

export interface ApproveContext<U extends PayUser> {
  payment: PaymentDTO
  user: U
  // 거부 공통 — Pi 측도 취소(best-effort) 후 오류 반환
  reject: (code: PayErrorCode, status: number) => Promise<NextResponse>
}

// metadata.type 1종의 사이트 처리
export interface PaymentTypeHandler<U extends PayUser, M> {
  // metadata 형태 검증 — 맞을 때만 M
  parseMeta: (meta: unknown) => M | null
  // 업무 상태 검증·정가 산정 — 정가(Pi) 또는 거부 응답
  price: (meta: M, ctx: ApproveContext<U>) => Promise<number | NextResponse>
  // Pi complete 성공 뒤 확정(원장 COMPLETED + 업무 기록) — 응답 그대로 반환
  complete: (args: {
    paymentId: string
    txid: string
    user: U
  }) => Promise<NextResponse>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PaymentHandlers<U extends PayUser> = Record<string, PaymentTypeHandler<U, any>>

const paymentIdSchema = z.object({ paymentId: z.string().min(1).max(200) })
const completeSchema = z.object({
  paymentId: z.string().min(1).max(200),
  txid: z.string().min(1).max(200),
})

export function createPaymentRoutes<U extends PayUser>(
  deps: PaymentRouteDeps<U>,
  handlers: PaymentHandlers<U>,
) {
  const { apiError, dbFail, dbRoute, parseBody, requireUser } = deps
  const { getOwnPayment, markPaymentCanceled } = createLedger(deps.db)

  // POST { paymentId } — Pi SDK onReadyForServerApproval. 검증·원장 기록 뒤에만 Pi approve
  const approve = withAuthGuard(
    dbRoute(async (req) => {
      const user = await requireUser(req)
      if (user instanceof NextResponse) return user
      const body = await parseBody(req, paymentIdSchema)
      if (body instanceof NextResponse) return body

      // 1) 결제 객체 조회 — 승인 전이라 지갑 변동 없음
      const got = await getPiPayment(body.paymentId)
      if (!got.ok) {
        if (got.status === 500) return apiError('SERVER_CONFIG', 500)
        console.error(
          '[payments/approve] Pi GET',
          got.status,
          got.body.slice(0, 300),
        )
        return apiError('PAY_PI_APPROVE_FAILED', 502)
      }
      const payment = got.payment
      const reject = async (code: PayErrorCode, status: number) => {
        await cancelPiPayment(payment.identifier).catch(() => undefined)
        return apiError(code, status)
      }

      // 2) 검증 — metadata.type 으로 핸들러 선택(각 parseMeta 가 type 일치를 다시 확인)
      const type = payment.metadata?.type
      const handler = typeof type === 'string' ? handlers[type] : undefined
      const meta = handler?.parseMeta(payment.metadata) ?? null
      if (!handler || !meta) return reject('PAY_SITE_MISMATCH', 400)
      if (payment.direction !== 'user_to_app')
        return reject('PAY_SITE_MISMATCH', 400)
      // 결제자 불일치 — 타인 결제이므로 Pi cancel 없이 거부(reject 미사용). Pi 세션 없는(pi_uid 없음) 사용자도 결제 불가
      if (!user.pi_uid || payment.user_uid !== user.pi_uid)
        return apiError('PAY_SITE_MISMATCH', 403)
      if (payment.status.cancelled || payment.status.user_cancelled)
        return reject('PAY_SITE_MISMATCH', 409)

      const expected = await handler.price(meta, { payment, user, reject })
      if (expected instanceof NextResponse) return expected
      // 정가와 정확히 일치(초과도 거부 — 서버 prepare 금액 그대로여야 한다)
      if (Math.abs(Number(payment.amount) - expected) > 1e-6)
        return reject('PAY_AMOUNT_SHORT', 400)

      // 3) 원장 기록(APPROVED) — Pi approve 보다 먼저. 재호출은 무시(멱등)
      const { error: upErr } = await deps.db().from('pi_pymnt').upsert(
        {
          pymnt_id: payment.identifier,
          usr_id: user.id,
          pi_uid: payment.user_uid,
          pi_amt: payment.amount,
          memo_txt: payment.memo,
          meta_val: payment.metadata,
          pymnt_tp_cd: type,
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
        console.error(
          '[payments/approve] Pi approve',
          r.status,
          r.body.slice(0, 300),
        )
        // Pi 측 pending 도 정리(best-effort) — 남으면 다음 createPayment 가 거부될 수 있다
        await cancelPiPayment(payment.identifier).catch(() => undefined)
        await markPaymentCanceled(payment.identifier, user.id)
        return apiError('PAY_PI_APPROVE_FAILED', 502)
      }
      return NextResponse.json({ ok: true, paymentId: payment.identifier })
    }),
  )

  // POST { paymentId, txid } — Pi SDK onReadyForServerCompletion·미완료 결제 복구. 원장 선조회 → Pi complete → 핸들러 확정
  const complete = withAuthGuard(
    dbRoute(async (req) => {
      const user = await requireUser(req)
      if (user instanceof NextResponse) return user
      const body = await parseBody(req, completeSchema)
      if (body instanceof NextResponse) return body

      // 1) 원장 선조회 — approve 가 기록한 본인 결제만 완료 처리(타인 paymentId·txid 재생 차단, 원장 없는 결제는 Pi complete 미호출)
      let row
      try {
        row = await getOwnPayment(body.paymentId, user.id)
      } catch (e) {
        return dbFail(e as { code?: string; message?: string })
      }
      if (!row || row.pymnt_sts_cd === 'CANCELED')
        return apiError('PAY_SITE_MISMATCH', 409)
      // 원장 유형에 맞는 핸들러 — 등록되지 않은 유형은 Pi complete 전에 거부
      const handler = handlers[row.pymnt_tp_cd]
      if (!handler) return apiError('PAY_SITE_MISMATCH', 409)

      // 2) Pi complete
      const r = await completePiPayment(body.paymentId, body.txid)
      if (!r.ok) {
        if (r.status === 500) return apiError('SERVER_CONFIG', 500)
        console.error(
          '[payments/complete] Pi API',
          r.status,
          r.body.slice(0, 300),
        )
        return apiError('PAY_PI_COMPLETE_FAILED', 502)
      }

      // 3) 원장 COMPLETED + 업무 기록(사이트 RPC, 한 트랜잭션)
      return handler.complete({
        paymentId: body.paymentId,
        txid: body.txid,
        user,
      })
    }),
  )

  // POST { paymentId } — SDK onCancel/onError·서명 전 이탈 복구. 본인 APPROVED 결제만, Pi cancel 성공 시에만 CANCELED
  const cancel = withAuthGuard(
    dbRoute(async (req) => {
      const user = await requireUser(req)
      if (user instanceof NextResponse) return user
      const body = await parseBody(req, paymentIdSchema)
      if (body instanceof NextResponse) return body

      let row
      try {
        row = await getOwnPayment(body.paymentId, user.id)
      } catch (e) {
        return dbFail(e as { code?: string; message?: string })
      }
      if (!row) {
        // 원장 없음(approve 전 취소) — Pi 측 결제자가 본인일 때만 정리(다음 결제 생성 가능하게). 아니면 존재 자체를 숨김
        const got = await getPiPayment(body.paymentId)
        if (!got.ok || !user.pi_uid || got.payment.user_uid !== user.pi_uid)
          return apiError('NOT_FOUND', 404)
        await cancelPiPayment(body.paymentId).catch(() => undefined)
        return NextResponse.json({ ok: true, status: 'NONE' })
      }
      if (row.pymnt_sts_cd === 'COMPLETED')
        return apiError('PAY_ALREADY_PAID', 409)
      if (row.pymnt_sts_cd === 'CANCELED') {
        // 원장은 이미 취소 — Pi 측 pending 이 남았을 수 있어 한 번 더 정리(best-effort)
        await cancelPiPayment(body.paymentId).catch(() => undefined)
        return NextResponse.json({ ok: true, status: 'CANCELED' })
      }
      const r = await cancelPiPayment(body.paymentId)
      if (!r.ok) {
        // Pi 가 취소 거부(서명 완료·거래 진행 중 등) — 원장은 APPROVED 유지, 이후 complete(미완료 결제 복구)가 마무리한다
        console.error(
          '[payments/cancel] Pi cancel',
          r.status,
          r.body.slice(0, 300),
        )
        return apiError('PAY_PI_CANCEL_FAILED', 409)
      }
      await markPaymentCanceled(body.paymentId, user.id)
      return NextResponse.json({ ok: true, status: 'CANCELED' })
    }),
  )

  return { approve, complete, cancel }
}

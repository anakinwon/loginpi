// Pi Platform 결제 API 클라이언트 — GET /v2/payments/:id · approve · complete · cancel (env PI_API_KEY, 서버 전용).
//  타임아웃 10초 = R-P4 예외(docs/BUILD_DEFECTS.md 2.7 "Pi 결제·A2U 10초"). 네트워크 예외·타임아웃은 { ok:false, status:0 } 으로 정규화
import type { PiPaymentDTO } from './core'

export const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'
export const PI_PAY_TIMEOUT_MS = 10_000

export type PiApiResult =
  | { ok: true; payment: PiPaymentDTO }
  | {
      ok: false
      status: number
      body: string
      noKey?: true // PI_API_KEY 미설정
      error?: string // Pi 오류 코드(예: already_approved)
      payment?: PiPaymentDTO // 오류 본문에 결제 객체가 함께 온 경우(멱등 재호출 판정용)
    }

async function piApi(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<PiApiResult> {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey)
    return { ok: false, status: 500, body: 'PI_API_KEY 미설정', noKey: true }
  // 본문 읽기까지 try 안 — 본문 수신 중 타임아웃·비 JSON 성공 응답도 { ok:false, status:0 } 으로(라우트 500 방지)
  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${path}`, {
      method,
      headers: {
        Authorization: `Key ${apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(PI_PAY_TIMEOUT_MS),
    })
    const text = await res.text()
    let j: { error?: string; payment?: PiPaymentDTO } | undefined
    try {
      j = JSON.parse(text)
    } catch {
      j = undefined
    }
    if (res.ok)
      return isPayment(j)
        ? { ok: true, payment: j }
        : { ok: false, status: 0, body: `invalid body: ${text.slice(0, 200)}` }
    return {
      ok: false,
      status: res.status,
      body: text,
      ...(typeof j?.error === 'string' && { error: j.error }),
      ...(isPayment(j?.payment) && { payment: j.payment }),
    }
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: e instanceof Error ? e.message : 'fetch',
    }
  }
}

// 최소 형태 확인 — 흐름이 identifier·status 를 바로 읽는다
const isPayment = (j: unknown): j is PiPaymentDTO =>
  typeof (j as PiPaymentDTO)?.identifier === 'string' &&
  typeof (j as PiPaymentDTO)?.status === 'object' &&
  (j as PiPaymentDTO).status !== null

const enc = encodeURIComponent
// 조회 — 개발자 approve 전엔 지갑 변동 없음(승인 전 검증용)
export const getPiPayment = (paymentId: string) => piApi(enc(paymentId), 'GET')
export const approvePiPayment = (paymentId: string) =>
  piApi(`${enc(paymentId)}/approve`, 'POST')
export const completePiPayment = (paymentId: string, txid: string) =>
  piApi(`${enc(paymentId)}/complete`, 'POST', { txid })
// 취소 — 서명 뒤 거래 진행 중이면 Pi 가 거부한다(호출자가 결과로 분기)
export const cancelPiPayment = (paymentId: string) =>
  piApi(`${enc(paymentId)}/cancel`, 'POST')

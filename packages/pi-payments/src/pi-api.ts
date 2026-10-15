// @pi/payments Pi Platform API — 결제 조회·approve·complete·cancel(서버 전용, PI_API_KEY 환경변수)
// 출처 : sitemap.pi src/lib/payments.ts(2026-10-15 추출, 동작 동일). 네트워크 예외·8초 타임아웃은 ok:false·status:0 으로 정규화
import 'server-only'

export const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export type PiApiResult =
  | { ok: true; payment: PaymentDTO }
  | { ok: false; status: number; body: string; alreadyApproved?: PaymentDTO }

async function piApi(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<PiApiResult> {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) return { ok: false, status: 500, body: 'PI_API_KEY 미설정' }
  // 네트워크 예외·8초 타임아웃은 { ok:false, status:0 } 으로 정규화 — 호출자가 throw(500) 대신 건별 거부·skip 으로 처리(크론 회차 격리, 적대적 리뷰 2026-10-13)
  let res: Response
  try {
    res = await fetch(`${PI_PAYMENTS_URL}/${path}`, {
      method,
      headers: {
        Authorization: `Key ${apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: e instanceof Error ? e.message : 'fetch',
    }
  }
  if (res.ok) return { ok: true, payment: (await res.json()) as PaymentDTO }
  const text = await res.text()
  // already_approved: 재요청 멱등 처리(cafe.pi 동일) — 결제 객체가 함께 오면 성공으로 취급
  try {
    const j = JSON.parse(text) as { error?: string; payment?: PaymentDTO }
    if (j.error === 'already_approved' && j.payment)
      return {
        ok: false,
        status: res.status,
        body: text,
        alreadyApproved: j.payment,
      }
  } catch {
    // 본문이 JSON 이 아님 — 아래 실패 반환
  }
  return { ok: false, status: res.status, body: text }
}

const enc = encodeURIComponent
// 결제 객체 조회(승인 전 검증용) — 개발자 approve 전엔 지갑 변동 없음
export const getPiPayment = (paymentId: string) => piApi(enc(paymentId), 'GET')
export const approvePiPayment = (paymentId: string) =>
  piApi(`${enc(paymentId)}/approve`, 'POST')
export const completePiPayment = (paymentId: string, txid: string) =>
  piApi(`${enc(paymentId)}/complete`, 'POST', { txid })
// 취소 — 검증 실패·사용자 취소·서명 전 이탈 복구. 실패해도 호출자는 진행(best-effort)
export const cancelPiPayment = (paymentId: string) =>
  piApi(`${enc(paymentId)}/cancel`, 'POST')

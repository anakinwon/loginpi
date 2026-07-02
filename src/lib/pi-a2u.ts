import 'server-only'
import PiNetwork from 'pi-backend'

// App→User(A2U) 실 Pi 송금 래퍼 — 환불·정산에 사용.
// 앱 지갑이 중계(에스크로) 지갑 역할: 구매자 U2A 결제로 받은 Pi를 취소 시 A2U로 되돌려준다.
// PI_API_KEY + PI_WALLET_PRIVATE_SEED 둘 다 있어야 동작 (없으면 비활성 → 호출부가 PENDING 처리).

let client: PiNetwork | null | undefined // undefined=미초기화, null=비활성

function getClient(): PiNetwork | null {
  if (client !== undefined) return client
  const apiKey = process.env.PI_API_KEY
  const seed = process.env.PI_WALLET_PRIVATE_SEED
  if (!apiKey || !seed) {
    client = null
    return null
  }
  try {
    client = new PiNetwork(apiKey, seed)
  } catch (e) {
    console.error('[A2U] PiNetwork 초기화 실패 (시드 형식 확인):', e)
    client = null
  }
  return client
}

export function isA2UEnabled(): boolean {
  return getClient() !== null
}

// 미완료 서버 결제 복구 — Pi는 미완료 A2U가 남아 있으면 신규 생성을 막으므로 선처리.
// txid가 있으면 complete, 없으면 cancel (베스트 에포트 — 실패해도 본 송금 시도).
async function recoverIncomplete(pi: PiNetwork): Promise<void> {
  try {
    // SDK가 배열 또는 { incomplete_server_payments: [...] } 형태로 반환할 수 있어 방어적 처리
    const raw = (await pi.getIncompleteServerPayments()) as unknown
    const incompletes = Array.isArray(raw)
      ? raw
      : ((raw as { incomplete_server_payments?: unknown[] })
          ?.incomplete_server_payments ?? [])
    for (const p of incompletes as Array<{
      identifier: string
      transaction: { txid: string } | null
    }>) {
      try {
        if (p.transaction?.txid) {
          await pi.completePayment(p.identifier, p.transaction.txid)
        } else {
          await pi.cancelPayment(p.identifier)
        }
      } catch (e) {
        console.error('[A2U] 미완료 결제 정리 실패:', p.identifier, e)
      }
    }
  } catch (e) {
    console.error('[A2U] 미완료 결제 조회 실패:', e)
  }
}

export interface A2UResult {
  txid: string
  paymentId: string
}

// axios 계열 오류에서 실패 단계·HTTP 응답 본문(진짜 사유)을 살려 재던진다.
// "Request failed with status code 400"만으로는 uid 무효/잔액/서명 불일치를 구분할 수 없다.
async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    const ax = e as {
      message?: string
      response?: { status?: number; data?: unknown }
    }
    const body = ax.response
      ? ` [HTTP ${ax.response.status}] ${JSON.stringify(ax.response.data).slice(0, 400)}`
      : ''
    console.error(`[A2U] ${name} 실패:`, ax.message, ax.response?.data ?? '')
    throw new Error(`${name}: ${ax.message ?? String(e)}${body}`)
  }
}

// A2U 송금: create → submit(앱 지갑 서명·블록체인 제출) → complete. 성공 시 blockchain txid 반환.
// 실패 시 throw — 호출부가 PENDING 처리하도록.
export async function sendA2U(args: {
  uid: string
  amount: number
  memo: string // Stellar memo (ASCII ≤ 28바이트 권장)
  metadata: object
}): Promise<A2UResult> {
  const pi = getClient()
  if (!pi) throw new Error('A2U_DISABLED')

  await recoverIncomplete(pi)

  const paymentId = await step('createPayment', () =>
    pi.createPayment({
      amount: args.amount,
      memo: args.memo.slice(0, 28),
      metadata: args.metadata,
      uid: args.uid,
    }),
  )
  const txid = await step('submitPayment', () => pi.submitPayment(paymentId))
  await step('completePayment', () => pi.completePayment(paymentId, txid))
  return { txid, paymentId }
}

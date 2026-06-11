import 'server-only'
import { createHmac, hkdfSync, timingSafeEqual } from 'crypto'

// Pi Browser admin 접근용 단기 ticket (60초).
// URL 파라미터로 전달되므로 실제 세션 토큰 대신 HMAC 서명된 ticket을 사용해
// 서버 로그·브라우저 히스토리에 세션 토큰이 노출되는 것을 방지한다.

// AUTH_SECRET에서 pit-ticket 전용 서브키 파생 (HKDF, 도메인 격리).
// 여러 기능이 AUTH_SECRET을 직접 공유하면 키 유출 시 전체 범위가 위험해지므로
// 용도별로 파생키를 분리한다.
function getDerivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET not configured')
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(secret),
      '',
      Buffer.from('pit-ticket-v1'),
      32,
    ),
  )
}

export function createPitTicket(userId: string): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 60_000 }),
  ).toString('base64url')
  const sig = createHmac('sha256', getDerivedKey())
    .update(payloadB64)
    .digest('hex')
  return `${payloadB64}.${sig}`
}

export function verifyPitTicket(ticket: string): string | null {
  try {
    const dotIdx = ticket.lastIndexOf('.')
    if (dotIdx === -1) return null
    const payloadB64 = ticket.slice(0, dotIdx)
    const sig = ticket.slice(dotIdx + 1)
    const expectedBuf = createHmac('sha256', getDerivedKey())
      .update(payloadB64)
      .digest()
    const providedBuf = Buffer.from(sig, 'hex')
    // timingSafeEqual로 상수시간 비교 — 타이밍 공격으로 서명값 추론 방지
    if (
      providedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(providedBuf, expectedBuf)
    )
      return null
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString(),
    ) as {
      uid: string
      exp: number
    }
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null
    return payload.uid
  } catch {
    return null
  }
}

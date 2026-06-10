import 'server-only'
import { createHmac } from 'crypto'

// Pi Browser admin 접근용 단기 ticket (60초).
// URL 파라미터로 전달되므로 실제 세션 토큰 대신 HMAC 서명된 ticket을 사용해
// 서버 로그·브라우저 히스토리에 세션 토큰이 노출되는 것을 방지한다.
function getSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET not configured')
  return secret
}

export function createPitTicket(userId: string): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 60_000 })
  ).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(payloadB64).digest('hex')
  return `${payloadB64}.${sig}`
}

export function verifyPitTicket(ticket: string): string | null {
  try {
    const dotIdx = ticket.lastIndexOf('.')
    if (dotIdx === -1) return null
    const payloadB64 = ticket.slice(0, dotIdx)
    const sig = ticket.slice(dotIdx + 1)
    const expected = createHmac('sha256', getSecret()).update(payloadB64).digest('hex')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      uid: string
      exp: number
    }
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null
    return payload.uid
  } catch {
    return null
  }
}

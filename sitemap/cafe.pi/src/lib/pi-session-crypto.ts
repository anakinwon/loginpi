import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

// route.ts에 중복 정의되어 있던 HMAC 유틸을 공유 라이브러리로 분리
// — Pi 인증 route와 계정 연동 API 양쪽에서 Pi 세션을 검증하기 위해 필요

export function signPayload(data: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyPayload<T>(value: string, secret: string): T | null {
  const dot = value.lastIndexOf('.')
  if (dot === -1) return null
  const payload = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url')
  try {
    const sigBytes = Buffer.from(sig, 'base64url')
    const expectedBytes = Buffer.from(expected, 'base64url')
    if (sigBytes.length !== expectedBytes.length) return null
    if (!timingSafeEqual(sigBytes, expectedBytes)) return null
  } catch {
    return null
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

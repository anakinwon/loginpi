import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

// Telegram 연동용 단기 서명 토큰(/start 페이로드).
//   제약: Telegram start 페이로드는 최대 64자, [A-Za-z0-9_-]만 허용.
//   형식: <uuidHex32>_<expBase36>_<sig16>  (총 57자) — HMAC 위조 방지 + 만료 자기완결.
//   별도 매핑 테이블/컬럼 없이 옵션 A(sys_user 컬럼) 유지.

const TTL_SEC = 30 * 60 // 30분

function secret(): string {
  return process.env.PI_SESSION_SECRET ?? process.env.AUTH_SECRET ?? ''
}

function sign(payload: string): string {
  return createHmac('sha256', secret())
    .update(payload)
    .digest('hex')
    .slice(0, 16)
}

// userId(UUID) → /start 페이로드
export function createLinkCode(userId: string): string {
  const uuidHex = userId.replace(/-/g, '')
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC
  const payload = `${uuidHex}_${exp.toString(36)}`
  return `${payload}_${sign(payload)}`
}

// /start 페이로드 → userId(UUID) | null (위조·만료·형식오류)
//   단발성(single-use)은 바인딩 계층에서 강제 — webhook이 conn_yn='N' 원자 가드로
//   이미 연동된 계정 재바인딩을 차단하므로, 코드 재생(replay)으로 알림을 탈취할 수 없다.
export function verifyLinkCode(code: string): string | null {
  const parts = code.split('_')
  if (parts.length !== 3) return null
  const [uuidHex, expB36, sig] = parts
  if (!/^[0-9a-f]{32}$/.test(uuidHex)) return null

  const expected = sign(`${uuidHex}_${expB36}`)
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

  const exp = parseInt(expB36, 36)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null

  // UUID 복원 (8-4-4-4-12)
  const u = uuidHex
  return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`
}

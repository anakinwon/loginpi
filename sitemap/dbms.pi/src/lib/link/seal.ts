// 연결 토큰 봉인 — AES-256-GCM, 키 = HKDF-SHA256(PI_SESSION_SECRET, salt 'dbms-link', 32B), AAD = lnk_id(다른 행으로 옮기면 복호 실패)
//  형식 base64(iv 12B | tag 16B | 암호문). 서버 전용(client.ts·api/link 만 import). 시험 : node --test src/lib/link/seal.test.mjs
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const IV_LEN = 12
const TAG_LEN = 16

function keyOf(secret: string): Buffer {
  if (!secret) throw new Error('PI_SESSION_SECRET missing')
  return Buffer.from(hkdfSync('sha256', secret, 'dbms-link', '', 32))
}

export function seal(plain: string, lnkId: string, secret = process.env.PI_SESSION_SECRET ?? ''): string {
  const iv = randomBytes(IV_LEN)
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv)
  c.setAAD(Buffer.from(lnkId))
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

// 변조·다른 lnk_id·다른 키면 throw
export function unseal(sealed: string, lnkId: string, secret = process.env.PI_SESSION_SECRET ?? ''): string {
  const buf = Buffer.from(sealed, 'base64')
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), buf.subarray(0, IV_LEN))
  d.setAAD(Buffer.from(lnkId))
  d.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN))
  return Buffer.concat([d.update(buf.subarray(IV_LEN + TAG_LEN)), d.final()]).toString('utf8')
}

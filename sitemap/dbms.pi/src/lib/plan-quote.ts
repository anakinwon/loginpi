// dbms.pi 요금제 결제 견적 서명·검증(서버 전용 비밀키는 인자로) — seminar.pi plan-rules signQuote/verifyQuote 와 같은 형식(키 용도 'dbms-plan-quote:' 분리).
//  시험 : node --test src/lib/plan-rules.test.mjs
import { createHmac, timingSafeEqual } from 'node:crypto'

// 견적 q = base64url(JSON {u,m,k,a,e}) + '.' + base64url(HMAC). u 사용자·m metaKey·k 원화(할인 전 기준가)·a Pi 금액·e 만료(ms)
export type Quote = { u: string; m: string; k: number; a: string; e: number }
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const quoteKey = (secret: string) => createHmac('sha256', secret).update('dbms-plan-quote:').digest()
const mac = (secret: string, body: string) => createHmac('sha256', quoteKey(secret)).update(body).digest()

export function signQuote(q: Quote, secret: string): string {
  const body = b64(JSON.stringify(q))
  return `${body}.${b64(mac(secret, body))}`
}

export function verifyQuote(token: unknown, secret: string, now = Date.now()): { ok: true; q: Quote } | { ok: false; why: 'INVALID' | 'EXPIRED' } {
  if (typeof token !== 'string' || token.length > 2000) return { ok: false, why: 'INVALID' }
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return { ok: false, why: 'INVALID' }
  const want = mac(secret, body)
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, why: 'INVALID' }
  let q: Quote
  try {
    q = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, why: 'INVALID' }
  }
  if (!q || typeof q.u !== 'string' || typeof q.m !== 'string' || typeof q.k !== 'number' || typeof q.a !== 'string' || typeof q.e !== 'number')
    return { ok: false, why: 'INVALID' }
  return q.e > now ? { ok: true, q } : { ok: false, why: 'EXPIRED' }
}


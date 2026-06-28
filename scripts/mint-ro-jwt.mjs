/**
 * 운영DB 읽기전용 JWT 발급 — PROD_RO_SUPABASE_KEY 값 생성.
 *
 * sql/136의 readonly_ro 롤(BYPASSRLS + SELECT only)을 role 클레임으로 갖는 JWT를
 * 운영 Supabase 프로젝트의 JWT secret으로 HS256 서명한다. 이 출력값이
 * PROD_RO_SUPABASE_KEY (Staging DB 스위치의 '운영DB 읽기전용' 모드용).
 *
 * 사용:
 *   node scripts/mint-ro-jwt.mjs "<운영 JWT Secret>"
 *   (또는 PROD_JWT_SECRET 환경변수)
 *   JWT Secret 위치: 운영 Supabase → Settings → API → JWT Settings → JWT Secret
 *
 * ⚠️ JWT Secret·출력 JWT는 강력한 비밀. 채팅·git 금지. 출력값은 Vercel env에만 직접 입력.
 *    셸 히스토리에 secret이 남을 수 있으니 작업 후 정리(또는 PROD_JWT_SECRET env 사용).
 */
import crypto from 'node:crypto'

const secret = process.argv[2] || process.env.PROD_JWT_SECRET
if (!secret) {
  console.error('사용: node scripts/mint-ro-jwt.mjs "<운영 JWT Secret>"')
  console.error('  (JWT Secret: 운영 Supabase → Settings → API → JWT Settings)')
  process.exit(1)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const head = b64({ alg: 'HS256', typ: 'JWT' })
const body = b64({
  role: 'readonly_ro',
  iss: 'supabase',
  iat: now,
  exp: now + 60 * 60 * 24 * 3650, // 10년
})
const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')

console.log('\n=== PROD_RO_SUPABASE_KEY (아래 값을 Vercel env에 입력) ===\n')
console.log(`${head}.${body}.${sig}`)
console.log('\n(role=readonly_ro · 10년 만료 · 읽기 전용)')

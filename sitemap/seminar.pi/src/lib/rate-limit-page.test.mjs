// 페이지 429 회귀(T10 r3) — 같은 NAT 뒤 다수 참가자가 PAGE 한도에 걸려도 JSON 원문이 아니라 안내 HTML + 자동 새로고침이 나와야 한다. 실행 : pnpm --dir sitemap/seminar.pi test
// @pi/guard 의 ts 를 직접 불러 동작으로 본다(Node 24 타입 제거). next 는 exports 지도가 없어 'next/server' → 'next/server.js' 로 이어 준다
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'

registerHooks({
  resolve: (spec, ctx, next) => next(spec === 'next/server' ? 'next/server.js' : spec, ctx),
})
const guard = await import('../../../../packages/pi-guard/src/ddos-guard.ts')

test('페이지 429 는 HTML(안내·자동 새로고침·Retry-After) — ko 경로는 한국어, 그 밖은 영어', async () => {
  const ko = guard.rateLimitedPageResponse(9.2, '/ko/notes/new')
  assert.equal(ko.status, 429)
  assert.match(ko.headers.get('content-type'), /^text\/html/)
  assert.equal(ko.headers.get('retry-after'), '10')
  assert.equal(ko.headers.get('cache-control'), 'no-store')
  assert.equal(ko.headers.get('x-content-type-options'), 'nosniff')
  const html = await ko.text()
  assert.match(html, /<meta http-equiv="refresh" content="10">/)
  assert.match(html, /lang="ko"/)
  assert.match(html, /role="status"/)
  assert.doesNotMatch(html, /too_many_requests/)
  const en = await guard.rateLimitedPageResponse(0, '/en').text()
  assert.match(en, /lang="en"[\s\S]*content="1"/) // 0초도 최소 1초 — 새로고침 무한 연타 방지
  assert.match(await guard.rateLimitedPageResponse(3, '/kor').text(), /lang="en"/) // 접두 오인 없음
})

test('seminar·sitemap 프록시는 페이지 한도 초과에 HTML 응답을 쓴다(JSON rateLimitedResponse 는 API 전용)', () => {
  for (const p of ['../proxy.ts', '../../../sitemap.pi/src/proxy.ts']) {
    const s = readFileSync(new URL(p, import.meta.url), 'utf8')
    assert.match(s, /rateLimitedPageResponse\(rl\.retryAfter, req\.nextUrl\.pathname\)/, p)
    assert.match(s, /checkClientLimit\(req, 'PAGE'\)/, p) // IP 단독 키로 되돌아가면 같은 NAT 사용자끼리 한도 공유(E2E r4)
    assert.doesNotMatch(s, /rateLimitedResponse\(/, p)
  }
})

// 같은 NAT 뒤 로그인 사용자 한도 분리(E2E r4 T04) — 한 사람이 한도를 넘겨도 같은 IP 의 다른 세션은 통과, 자격 돌려쓰기는 IP 전체 상한에서 막힘
const fakeReq = (ip, { token, cookie } = {}) => ({
  headers: new Headers({ 'x-real-ip': ip, ...(token ? { 'x-pi-token': token } : {}) }),
  cookies: { get: (n) => (cookie && n === cookie[0] ? { value: cookie[1] } : undefined) },
})

test('로그인 사용자는 IP+세션 버킷 — 같은 IP 의 다른 사용자는 남의 429 에 묶이지 않는다', () => {
  const lim = guard.RATE_POLICY.API_GENERAL.limit
  const a = fakeReq('10.9.0.1', { token: 'tokA'.padStart(40, 'a') })
  for (let i = 0; i < lim; i++) assert.ok(guard.checkClientLimit(a, 'API_GENERAL').allowed)
  assert.equal(guard.checkClientLimit(a, 'API_GENERAL').allowed, false) // 본인은 한도대로 막힘
  const b = fakeReq('10.9.0.1', { cookie: ['pi_session', 'cookieB'.padStart(40, 'b')] })
  assert.ok(guard.checkClientLimit(b, 'API_GENERAL').allowed) // 쿠키 세션 다른 사람은 통과
  const anon = fakeReq('10.9.0.1')
  assert.ok(guard.checkClientLimit(anon, 'API_GENERAL').allowed) // 비로그인은 기존 IP 버킷
})

test('세션 자격을 돌려 써도 IP 전체 상한(한도 × NAT_SCALE)에서 막히고, AUTH 는 IP 단독', () => {
  const lim = guard.RATE_POLICY.PAGE.limit * guard.NAT_SCALE
  let blocked = -1
  for (let i = 0; i <= lim; i++) {
    if (!guard.checkClientLimit(fakeReq('10.9.0.2', { token: `t${i}`.padStart(40, 'x') }), 'PAGE').allowed) { blocked = i; break }
  }
  assert.equal(blocked, lim)
  const authLim = guard.RATE_POLICY.AUTH.limit
  for (let i = 0; i < authLim; i++) guard.checkClientLimit(fakeReq('10.9.0.3', { token: `a${i}`.padStart(40, 'y') }), 'AUTH')
  assert.equal(guard.checkClientLimit(fakeReq('10.9.0.3', { token: 'new'.padStart(40, 'z') }), 'AUTH').allowed, false)
})

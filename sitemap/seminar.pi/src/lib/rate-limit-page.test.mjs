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
    assert.doesNotMatch(s, /rateLimitedResponse\(/, p)
  }
})

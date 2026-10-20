// 모니터링 순수 로직 검사(sql/068) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bucketize, hitPct, minuteOf, normRoute, perSec, stsCls } from '../src/lib/mon.ts'

test('경로 정규화 : UUID·숫자 → :id, 질의 제거, API 외·모니터링 자체 제외', () => {
  assert.equal(normRoute('http://localhost:3002/api/areas/30722c7a-0b23-4b80-8893-7c4f29afee7f/terms?page=2&size=10'), '/api/areas/:id/terms')
  assert.equal(normRoute('/api/areas/30722c7a-0b23-4b80-8893-7c4f29afee7f/projects/e15ba6a8-e30b-4b04-8071-3d52dfc07f26/versions'), '/api/areas/:id/projects/:id/versions')
  assert.equal(normRoute('/api/items/123/'), '/api/items/:id')
  assert.equal(normRoute('/areas/x/words'), null)
  assert.equal(normRoute('/api/mon/app'), null)
  assert.equal(normRoute('/api/<script>alert(1)</script>'), null) // 경로 외 문자 거부
  assert.equal(normRoute('/api/areas/30722c7a-0b23-4b80-8893-7c4f29afee7f/mon/url?live=1'), null) // 모니터링 화면 폴링 제외
})

test('분 단위 묶음 : 같은 분·경로 합산, 오류(0·4xx·5xx)·느림(1초 이상)·최대', () => {
  const t = Date.parse('2026-10-21T01:02:10Z')
  const rows = bucketize([
    { route: '/api/a', t, ms: 100, status: 200 },
    { route: '/api/a', t: t + 30_000, ms: 1500, status: 500 },
    { route: '/api/a', t: t + 60_000, ms: 50, status: 0 },
    { route: '/api/b', t, ms: 20, status: 404 },
  ])
  const a1 = rows.find((r) => r.route_txt === '/api/a' && r.bkt_dtm === minuteOf(t))!
  assert.deepEqual([a1.req_cnt, a1.err_cnt, a1.slow_cnt, a1.rsp_sum_val, a1.rsp_max_val], [2, 1, 1, 1600, 1500])
  assert.equal(rows.length, 3)
  assert.equal(rows.find((r) => r.route_txt === '/api/b')!.err_cnt, 1)
})

test('누적 → 초당 : 60초 간격 600 증가 = 10/s, 감소(재시작)는 null, 적중률은 구간 차이', () => {
  const s = perSec([
    { t: '2026-10-21T00:00:00Z', v: 1000 },
    { t: '2026-10-21T00:01:00Z', v: 1600 },
    { t: '2026-10-21T00:02:00Z', v: 10 },
  ])
  assert.deepEqual(s.map((x) => x.v), [10, null])
  assert.equal(hitPct(900, 100, 1890, 110), 99)
  assert.equal(hitPct(10, 10, 10, 10), null)
})

test('HTTP 상태 분류', () => {
  assert.deepEqual([0, 200, 301, 404, 502].map(stsCls), ['FAIL', 'OK', 'REDIR', 'CLIENT', 'SERVER'])
})

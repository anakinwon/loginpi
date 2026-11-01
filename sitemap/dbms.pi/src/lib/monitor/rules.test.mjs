// 모니터링 순수 로직 검사 — 실행 : node --test src/lib/monitor/rules.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, isPeriod, normalizeSummary } from './rules.ts'

const raw = {
  app: { reqCnt: 3600, errCnt: 36, slowCnt: 4, rsp_sum_val: 360000 },
  db: [
    { connId: 'c1', sessCnt: 12, lockWaitCnt: 0, cacheHitPct: 99.5, dbSz: 1048576 * 200 },
    { connId: 'c2', sessCnt: '80', lockWaitCnt: 3, cacheHitPct: 88, dbSz: null },
    { sessCnt: 1 },
  ],
  url: [
    { url: 'https://a', stsNo: 200, rspMs: 120 },
    { url: 'https://b', stsNo: 503, rspMs: 2500 },
  ],
}

test('정규화 : TPS·오류율·평균 계산, 문자열 숫자, connId 없는 행 제외, URL ok 판정', () => {
  const s = normalizeSummary(raw, 60)
  assert.equal(s.app.tps, 1)
  assert.equal(s.app.errPct, 1)
  assert.equal(s.app.avgMs, 100)
  assert.equal(s.db.length, 2)
  assert.equal(s.db[0].dbSzMb, 200)
  assert.equal(s.db[1].sessCnt, 80)
  assert.equal(s.db[1].dbSzMb, null)
  assert.deepEqual(s.url.map((u) => u.ok), [true, false])
})

test('정규화 : 빈·잘못된 입력도 깨지지 않음', () => {
  const s = normalizeSummary(null, 30)
  assert.deepEqual(s, { app: { reqCnt: 0, errCnt: 0, slowCnt: 0, tps: 0, errPct: 0, avgMs: null }, db: [], url: [] })
})

test('평가 : 사용 안 함 제외, 접속 지정·전체, 연산자, null 값 무시', () => {
  const s = normalizeSummary(raw, 60)
  const r = (ruleId, metricCd, opCd, thrVal, connId = null, useYn = 'Y') => ({ ruleId, metricCd, opCd, thrVal, connId, useYn })
  const b = evaluate(
    [
      r('1', 'DB_SESS_CNT', 'GT', 50),
      r('2', 'DB_CACHE_HIT_PCT', 'LT', 95, 'c1'),
      r('3', 'APP_ERR_PCT', 'GE', 1),
      r('4', 'APP_TPS', 'GT', 0, null, 'N'),
      r('5', 'DB_SIZE_MB', 'GE', 100),
      r('6', 'URL_FAIL_CNT', 'GE', 1),
      r('7', 'URL_RSP_MS', 'GT', 1000),
    ],
    s,
  )
  assert.deepEqual(
    b.map((x) => `${x.ruleId}@${x.target}`),
    ['1@db:c2', '3@app', '5@db:c1', '6@url', '7@url:https://b'],
  )
})

test('기간 : 30·60·360·1440 만 허용', () => {
  assert.ok(isPeriod(360))
  assert.ok(!isPeriod(5))
})

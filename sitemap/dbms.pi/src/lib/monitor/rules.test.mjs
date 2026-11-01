// 모니터링 순수 로직 검사 — 실행 : node --test src/lib/monitor/rules.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, isPeriod, normalizeSummary } from './rules.ts'

const raw = {
  app: { reqCnt: 3600, errCnt: 36, slowCnt: 4, rsp_sum_val: 360000 },
  db: [
    {
      connId: 'c1',
      sessCnt: 12,
      lockWaitCnt: 0,
      cacheHitPct: 99.5,
      dbSz: 1048576 * 200,
    },
    {
      connId: 'c2',
      sessCnt: '80',
      lockWaitCnt: 3,
      cacheHitPct: 88,
      dbSz: null,
    },
    { sessCnt: 1 },
  ],
  // schema.pi /api/link/v1/mon/summary 실응답 형태
  url: [
    {
      urlId: 'u1',
      urlNm: 'https://a',
      useYn: 'Y',
      lstDtm: '2026-11-01T00:00:00Z',
      lstSts: 200,
      lstRspMs: 120,
      chkCnt: 12,
      errCnt: 0,
    },
    {
      urlId: 'u2',
      urlNm: 'https://b',
      useYn: 'Y',
      lstDtm: '2026-11-01T00:00:00Z',
      lstSts: 503,
      lstRspMs: 2500,
      chkCnt: 12,
      errCnt: 3,
    },
    {
      urlId: 'u3',
      urlNm: 'https://c',
      useYn: 'Y',
      lstDtm: null,
      lstSts: null,
      lstRspMs: null,
      chkCnt: 0,
      errCnt: 0,
    },
    {
      urlId: 'u4',
      urlNm: 'https://d',
      useYn: 'N',
      lstDtm: '2026-11-01T00:00:00Z',
      lstSts: 500,
      lstRspMs: 9000,
      chkCnt: 1,
      errCnt: 1,
    },
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
  assert.deepEqual(
    s.url.map((u) => u.ok),
    [true, false, false, false],
  )
  assert.deepEqual(s.url[1], {
    url: 'https://b',
    stsNo: 503,
    rspMs: 2500,
    ok: false,
    chkCnt: 12,
    errCnt: 3,
    useYn: 'Y',
    lstDtm: '2026-11-01T00:00:00Z',
  })
  assert.equal(s.url[2].stsNo, null)
})

test('정규화 : 실응답 app.avgRspMs 를 평균으로', () => {
  assert.equal(
    normalizeSummary({ app: { reqCnt: 10, avgRspMs: 42 } }, 60).app.avgMs,
    42,
  )
})

test('정규화 : 빈·잘못된 입력도 깨지지 않음', () => {
  const s = normalizeSummary(null, 30)
  assert.deepEqual(s, {
    app: { reqCnt: 0, errCnt: 0, slowCnt: 0, tps: 0, errPct: 0, avgMs: null },
    db: [],
    url: [],
  })
})

test('평가 : 사용 안 함 제외, 접속 지정·전체, 연산자, null 값 무시', () => {
  const s = normalizeSummary(raw, 60)
  const r = (ruleId, metricCd, opCd, thrVal, connId = null, useYn = 'Y') => ({
    ruleId,
    metricCd,
    opCd,
    thrVal,
    connId,
    useYn,
  })
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
    // 6 : 점검 없음(u3)·사용 안 함(u4)은 실패로 안 셈 → 1건, 7 : 사용 안 함 URL 제외
    ['1@db:c2', '3@app', '5@db:c1', '6@url', '7@url:https://b'],
  )
  assert.equal(b.find((x) => x.ruleId === '6').value, 1)
})

test('기간 : 30·60·360·1440 만 허용', () => {
  assert.ok(isPeriod(360))
  assert.ok(!isPeriod(5))
})

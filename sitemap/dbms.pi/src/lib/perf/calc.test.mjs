// 성능 관측 순수 계산 시험 — 실행 : node --test src/lib/perf/calc.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forecast, health, maskLiterals, qryDelta } from './calc.ts'

const q = (qryId, calls, totalMs, rows = 0) => ({
  qryId,
  qryTxt: null,
  calls,
  totalMs,
  rows,
})

test('증감 : 정상 차이·신규 쿼리·호출 수 감소(리셋) 보정', () => {
  const d = qryDelta(
    [q('a', 15, 300), q('b', 3, 30), q('c', 2, 10)],
    [q('a', 10, 100), q('c', 9, 90)],
    false,
  )
  assert.deepEqual(
    d.map((x) => [x.qryId, x.calls, x.totalMs, x.meanMs, x.reset]),
    [
      ['a', 5, 200, 40, false],
      ['b', 3, 30, 10, false],
      ['c', 2, 10, 5, true],
    ],
  )
})

test('증감 : stat_reset 변경이면 이전값 무시', () => {
  const d = qryDelta([q('a', 5, 50)], [q('a', 1, 10)], true)
  assert.equal(d[0].calls, 5)
  assert.equal(d[0].reset, true)
})

test('증감 : 이전 수집 없음 = 누적치 그대로, 호출 0 이면 평균 0', () => {
  assert.equal(qryDelta([q('a', 0, 0)], null, false)[0].meanMs, 0)
})

test('최고(maxMs) : 증감 아님 — 현재 수집 값 그대로 통과, 033 이전 null 유지', () => {
  const d = qryDelta(
    [{ ...q('a', 15, 300), maxMs: 900 }, { ...q('b', 3, 30), maxMs: null }],
    [{ ...q('a', 10, 100), maxMs: 500 }],
    false,
  )
  assert.deepEqual(
    d.map((x) => x.maxMs),
    [900, null],
  )
})

const qu = (qryId, usrNm, calls, totalMs) => ({
  qryId,
  usrNm,
  qryTxt: null,
  calls,
  totalMs,
  rows: 0,
})

test('증감 : 같은 queryid 라도 계정별로 따로 짝짓는다', () => {
  const d = qryDelta(
    [qu('a', 'app', 15, 150), qu('a', 'dba', 4, 400)],
    [qu('a', 'app', 10, 100), qu('a', 'dba', 1, 100)],
    false,
  )
  assert.deepEqual(
    d.map((x) => [x.usrNm, x.calls, x.totalMs, x.reset]),
    [
      ['app', 5, 50, false],
      ['dba', 3, 300, false],
    ],
  )
})

test('증감 : 이전 행 계정 null(sql/032 이전 수집) = queryid 만으로 짝짓는 폴백', () => {
  const d = qryDelta(
    [qu('a', 'app', 15, 150), qu('b', 'app', 2, 20)],
    [qu('a', null, 10, 100)],
    false,
  )
  assert.deepEqual(
    d.map((x) => [x.qryId, x.calls, x.reset]),
    [
      ['a', 5, false],
      ['b', 2, false],
    ],
  )
})

test('건강 : 미사용 인덱스·전체 스캔 과다·dead tuple', () => {
  const h = health(
    [
      {
        tblNm: 't1',
        fullScan: 500,
        idxScan: 10,
        liveTup: 5000,
        deadTup: 10,
        szByte: 1,
      },
      {
        tblNm: 't2',
        fullScan: 500,
        idxScan: 10,
        liveTup: 10,
        deadTup: 0,
        szByte: 1,
      },
      {
        tblNm: 't3',
        fullScan: 0,
        idxScan: 100,
        liveTup: 2000,
        deadTup: 3000,
        szByte: 1,
      },
    ],
    [
      { idxNm: 'i1', tblNm: 't1', idxScan: 0, szByte: 10 },
      { idxNm: 'i2', tblNm: 't1', idxScan: 5, szByte: 10 },
    ],
  )
  assert.deepEqual(
    h.unusedIdx.map((i) => i.idxNm),
    ['i1'],
  )
  assert.deepEqual(
    h.fullScan.map((t) => t.tblNm),
    ['t1'],
  )
  assert.deepEqual(
    h.dead.map((t) => t.tblNm),
    ['t3'],
  )
})

test('예측 : 하루 100바이트 증가 → 임계까지 남은 일수', () => {
  const day = 86_400_000
  const f = forecast(
    [
      { t: 0, bytes: 1000 },
      { t: day, bytes: 1100 },
      { t: 2 * day, bytes: 1200 },
    ],
    2200,
  )
  assert.ok(Math.abs(f.perDay - 100) < 1e-6)
  assert.ok(Math.abs(f.daysLeft - 10) < 1e-6)
})

test('예측 : 점 1개·감소 추세 = 예상일 없음', () => {
  assert.equal(forecast([{ t: 0, bytes: 1 }], 10).daysLeft, null)
  assert.equal(
    forecast(
      [
        { t: 0, bytes: 10 },
        { t: 1, bytes: 5 },
      ],
      100,
    ).daysLeft,
    null,
  )
})

test('마스킹 : 문자열·숫자 상수, $1·식별자 숫자는 유지', () => {
  assert.equal(
    maskLiterals("select * from t1 where a = 'x''y' and b = 42 and c = $1"),
    "select * from t1 where a = '?' and b = ? and c = $1",
  )
})

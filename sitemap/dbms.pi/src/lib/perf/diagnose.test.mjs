// 느린 쿼리 원인 진단 시험 — 실행 : node --test src/lib/perf/diagnose.test.mjs (Node 22.18+ 타입 제거로 .ts 직접 import)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diagnose, withCum } from './diagnose.ts'

const base = {
  qryTxt: 'SELECT * FROM orders WHERE id = $1',
  calls: 10,
  totalMs: 100,
  meanMs: 10,
  maxMs: 20,
  rows: 10,
  blkHit: 1000,
  blkRead: 0,
  tmpBlk: 0,
}
const cds = (o) => diagnose({ ...base, ...o }).map((d) => d.cd)

test('빠른 쿼리 = 진단 없음', () => {
  assert.deepEqual(cds({}), [])
})

test('자체 수집(지문·연결 API 표본 확신 높음) = SELF_MON 하나만', () => {
  const top =
    'SELECT s.queryid::text AS queryid FROM pg_stat_statements s WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) ORDER BY s.total_exec_time DESC LIMIT $1'
  // 화면에 뜬 행 : 21회·평균 203ms·최고 없음·임시 블록 411/회 — 그래도 고객 조치 없음
  assert.deepEqual(
    cds({ qryTxt: top, calls: 21, meanMs: 203.4, maxMs: null, tmpBlk: 8631 }),
    ['SELF_MON'],
  )
  assert.deepEqual(cds({ srcCd: 'MONITOR', srcConf: 'high' }), ['SELF_MON'])
  assert.deepEqual(cds({ srcCd: 'MONITOR', srcConf: 'low' }), []) // postgres.js(고객 노드 앱일 수도)
})

test('SLOW_EACH(매번) · SPIKE(간헐) · 둘 다(평균도 경고선 이상) · 위험 등급', () => {
  assert.deepEqual(cds({ maxMs: 900, meanMs: 600 }), ['SLOW_EACH'])
  assert.deepEqual(cds({ maxMs: 900, meanMs: 300 }), ['SLOW_EACH']) // 3배 = 늘 그 근처
  assert.deepEqual(cds({ maxMs: 4244.53, meanMs: 322.39 }), ['SPIKE']) // std_term_dic 실측
  assert.deepEqual(cds({ maxMs: 5000, meanMs: 600 }), ['SLOW_EACH', 'SPIKE'])
  const d = diagnose({ ...base, maxMs: 4000, meanMs: 3500 })
  assert.equal(d[0].lvl, 'risk')
})

test('DISK_READ : 비율 10% 이상 + 읽기 블록 1000 이상만', () => {
  assert.deepEqual(cds({ blkHit: 9000, blkRead: 1000 }), ['DISK_READ'])
  assert.deepEqual(cds({ blkHit: 10, blkRead: 900 }), []) // 블록 적음
  assert.deepEqual(cds({ blkHit: 99000, blkRead: 1000 }), []) // 1%
  assert.equal(
    diagnose({ ...base, blkHit: 9000, blkRead: 1000 })[0].params.pct,
    10,
  )
})

test('TEMP_SPILL · MANY_ROWS', () => {
  const d = diagnose({ ...base, tmpBlk: 4110 })
  assert.deepEqual(
    d.map((x) => x.cd),
    ['TEMP_SPILL'],
  )
  assert.equal(d[0].params.perCall, 411)
  assert.deepEqual(cds({ rows: 20000 }), ['MANY_ROWS'])
})

test('034 이전(블록 없음)·033 이전(최고 없음)은 해당 규칙 건너뜀, 최고 없음 = NO_MAX 안내', () => {
  assert.deepEqual(cds({ blkHit: null, blkRead: null, tmpBlk: null }), [])
  assert.deepEqual(
    cds({
      blkHit: undefined,
      blkRead: undefined,
      tmpBlk: undefined,
      maxMs: null,
    }),
    ['NO_MAX'],
  )
})

test('문장 모양 힌트(PostgREST !inner 임베드·OFFSET)는 느린 쿼리에만', () => {
  const pg =
    'WITH pgrst_source AS (SELECT "public"."std_term_dic"."dic_seq" FROM "public"."std_term_dic" INNER JOIN LATERAL (SELECT 1 FROM "public"."std_term" WHERE "std_term"."area_id" = $1 LIMIT $2 OFFSET $3) AS "std_term" ON TRUE LIMIT $4 OFFSET $5) SELECT * FROM pgrst_source'
  assert.deepEqual(cds({ qryTxt: pg, maxMs: 4244.53, meanMs: 322.39 }), [
    'SPIKE',
    'PGRST_EMBED',
    'OFFSET_PAGING',
  ])
  assert.deepEqual(cds({ qryTxt: pg }), []) // 빠르면 힌트 없음
  assert.deepEqual(
    cds({
      qryTxt: 'SELECT * FROM t LIMIT ? OFFSET ?',
      maxMs: null,
      meanMs: 700,
    }),
    ['NO_MAX', 'OFFSET_PAGING'], // 최고 없으면 평균으로 느림 판정
  )
})

test('구간 호출 0 = 누적치(통계 리셋 이후)로 대체 진단 — 최고값 1등 쿼리가 침묵하지 않음', () => {
  const r = {
    ...base,
    maxMs: 4000,
    calls: 0,
    totalMs: 0,
    meanMs: 0,
    rows: 0,
    blkHit: 0,
    blkRead: 0,
    tmpBlk: 0,
    cumCalls: 10,
    cumMeanMs: 3500,
    cumRows: 50000,
    cumBlkHit: 9000,
    cumBlkRead: 1000,
    cumTmpBlk: 100,
  }
  assert.deepEqual(
    diagnose(r).map((d) => d.cd),
    [],
  ) // 대체 없으면 평균 없음 → 침묵(반려 사유)
  const c = withCum(r)
  assert.equal(c.cum, true)
  assert.deepEqual(
    diagnose(c).map((d) => d.cd),
    ['SLOW_EACH', 'DISK_READ', 'TEMP_SPILL', 'MANY_ROWS'],
  )
  assert.equal(diagnose(c)[0].lvl, 'risk')
  // 구간 호출 있음 = 그대로, 누적 정보 없음(구 응답) = 그대로
  assert.equal(withCum({ ...r, calls: 1, meanMs: 10 }).cum, false)
  assert.equal(withCum({ ...base, calls: 0 }).cum, false)
})

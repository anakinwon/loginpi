// SQL 편집기 에이전트 중계 순수 로직(src/lib/sql-agent-core.ts, sql/078) — 지시서·게이트·대기 기한·대기 포기 분기·결과 재결합·크기 판정. 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agtDialect, agtGateCode, budgetMs, doneCode, missingCol, RSLT_SIZE_ERR, AGT_STATUS, expAt, giveUpOutcome, mergeRunRes, RUN_WAIT, rsltBody, runVal, tooBig, uaVer, verNum, verOk, type AgtStmt } from '../src/lib/sql-agent-core.ts'

const NOW = Date.parse('2026-11-07T00:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

test('지시서 — 순번 1부터·행 질의 판정·prefix 는 원문 그대로, 클라이언트 값 없음', () => {
  const v = runVal({ mode: 'TRY', limit: 200, schema: 'public', stmts: [{ txt: 'select 1', mask: 'select 1' }, { txt: 'update t set a=1 where b=2', mask: 'update t set a=1 where b=2' }, { txt: '(with x as (select 1) select * from x)', mask: '(with x as (select 1) select * from x)' }], kinds: ['READ', 'WRITE', 'READ'], prefix: ['insert into t values (1)'], stmt_timeout_ms: 20000, lock_timeout_ms: 5000, cell_max: 4000, max_bytes: 3500000 })
  assert.equal(v.v, 1)
  assert.equal(v.tp, 'RUN')
  assert.deepEqual(v.stmts.map((s) => [s.seq, s.kind, s.rowq]), [[1, 'READ', true], [2, 'WRITE', false], [3, 'READ', true]])
  assert.deepEqual(v.prefix, ['insert into t values (1)'])
  assert.equal(v.stmt_timeout_ms, 20000)
})

test('방언 — PG·Oracle·Tibero(Oracle 문법), 그 밖 미지원', () => {
  assert.equal(agtDialect('0014'), 'PG')
  assert.equal(agtDialect('0001'), 'ORA')
  assert.equal(agtDialect('0013'), 'ORA')
  assert.equal(agtDialect('0002'), null)
})

test('버전 — UA 추출·숫자 비교(1.10.0 > 1.4.0), 형식 다르면 미달', () => {
  assert.equal(uaVer('schemapi-agent/1.4.0 (Java 21)'), '1.4.0')
  assert.equal(uaVer('curl/8'), null)
  assert.ok(verNum('1.10.0')! > verNum('1.4.0')!)
  assert.equal(verOk('1.4.0'), true)
  assert.equal(verOk('1.10.0'), true)
  assert.equal(verOk('1.3.9'), false)
  assert.equal(verOk(null), false)
  assert.equal(verOk('1.4'), false)
})

test('게이트 — 꺼짐 > 구버전 > 혼잡 순서', () => {
  assert.equal(agtGateCode(null, 0, NOW), 'SQL_AGT_OFFLINE') // 폐기·만료
  assert.equal(agtGateCode({ seen: null, ver: '1.4.0' }, 0, NOW), 'SQL_AGT_OFFLINE')
  assert.equal(agtGateCode({ seen: ago(61_000), ver: '1.4.0' }, 0, NOW), 'SQL_AGT_OFFLINE')
  assert.equal(agtGateCode({ seen: ago(5_000), ver: '1.3.0' }, 3, NOW), 'SQL_AGT_OUTDATED')
  assert.equal(agtGateCode({ seen: ago(5_000), ver: '1.4.0' }, 3, NOW), 'SQL_AGT_BUSY')
  assert.equal(agtGateCode({ seen: ago(5_000), ver: '1.4.0' }, 2, NOW), null)
})

test('대기 기한 — 등록+45초와 도착+48초 중 이른 쪽, 에이전트 예산 = 기한-3초(음수 없음)', () => {
  assert.equal(expAt(NOW, NOW, RUN_WAIT), NOW + 45_000)
  assert.equal(expAt(NOW + 10_000, NOW, RUN_WAIT), NOW + 48_000)
  assert.equal(budgetMs(NOW + 45_000, NOW), 42_000)
  assert.equal(budgetMs(NOW + 1_000, NOW), 0)
})

test('대기 포기 — 취소 1건 = NO_PICKUP / 0건이면 끝남 = 결과, 만료·취소 = NO_PICKUP, 실행 중 = TIMEOUT(합치지 않음)', () => {
  assert.equal(giveUpOutcome(1, null), 'SQL_AGT_NO_PICKUP')
  assert.equal(giveUpOutcome(0, 'DONE'), 'DONE')
  assert.equal(giveUpOutcome(0, 'FAIL'), 'DONE')
  assert.equal(giveUpOutcome(0, 'EXP'), 'SQL_AGT_NO_PICKUP')
  assert.equal(giveUpOutcome(0, 'CNCL'), 'SQL_AGT_NO_PICKUP')
  assert.equal(giveUpOutcome(0, 'RUN'), 'SQL_AGT_TIMEOUT')
  assert.equal(giveUpOutcome(0, null), 'SQL_AGT_TIMEOUT')
})

const ST: AgtStmt[] = [{ seq: 1, txt: 'select 1', kind: 'READ', rowq: true }, { seq: 2, txt: 'update t set a=1 where b=2', kind: 'WRITE', rowq: false }]

test('재결합 — txt·kind 는 지시서에서, 없는 순번 SKIP, 지시서 밖 순번 버림', () => {
  const r = mergeRunRes(ST, [{ seq: 1, rslt: 'OK', columns: [{ name: '?column?', type: 'int4' }], rows: [[1]], affected: 1, ms: 3 }, { seq: 9, rslt: 'OK' }])
  assert.equal(r.length, 2)
  assert.deepEqual([r[0].txt, r[0].kind, r[0].rslt, r[0].rows], ['select 1', 'READ', 'OK', [[1]]])
  assert.deepEqual([r[1].txt, r[1].kind, r[1].rslt], ['update t set a=1 where b=2', 'WRITE', 'SKIP'])
})

test('재결합 — 요청 단위 오류는 문장 오류가 없을 때 첫 미실행 문장에, 오류 코드 20자', () => {
  const r = mergeRunRes(ST, [], { err_cd: 'DB_CONN_CHANGED_TOO_LONG_CODE', err_msg: '접속 바뀜' })
  assert.equal(r[0].rslt, 'ERR')
  assert.equal(r[0].err_cd, 'DB_CONN_CHANGED_TOO_')
  assert.equal(r[1].rslt, 'SKIP')
  const s = mergeRunRes(ST, [{ seq: 1, rslt: 'OK' }, { seq: 2, rslt: 'ERR', err_cd: '23505', err_msg: 'dup' }], { err_cd: 'X', err_msg: 'y' })
  assert.equal(s[1].err_cd, '23505') // 이미 문장 오류가 있으면 덮지 않음
})

test('업로드 본문 — txt 없이 통과, 일회값 형식·final 값 검사, 크기 판정', () => {
  const ok = rsltBody.safeParse({ run_nonce: 'a'.repeat(32), final: 'DONE', results: [{ seq: 1, rslt: 'OK', rows: [[1, 'a', null, true]] }] })
  assert.ok(ok.success)
  assert.equal(rsltBody.safeParse({ run_nonce: 'bad', final: 'DONE', results: [] }).success, false)
  assert.equal(rsltBody.safeParse({ run_nonce: 'a'.repeat(32), final: 'PART', results: [] }).success, false)
  assert.equal(tooBig(4_000_000), false)
  assert.equal(tooBig(4_000_001), true)
  assert.equal(tooBig(null), false)
})

test('버전 칼럼 미적용(sql/079 전) — 칼럼 없음 오류 판정, 버전을 모르면 OUTDATED 로 막지 않음(claim UA 게이트에 맡김)', () => {
  assert.equal(missingCol({ code: 'PGRST204' }), true)
  assert.equal(missingCol({ code: '42703' }), true)
  assert.equal(missingCol({ code: '23514' }), false)
  assert.equal(missingCol(null), false)
  assert.equal(agtGateCode({ seen: ago(5_000), ver: undefined }, 0, NOW), null) // 칼럼 없음 = 판정 보류
  assert.equal(agtGateCode({ seen: ago(5_000), ver: undefined }, 3, NOW), 'SQL_AGT_BUSY')
  assert.equal(agtGateCode({ seen: ago(61_000), ver: undefined }, 0, NOW), 'SQL_AGT_OFFLINE')
  assert.equal(agtGateCode({ seen: ago(5_000), ver: null }, 0, NOW), 'SQL_AGT_OUTDATED') // 칼럼 있는데 미기록 = 즉시
})

test('UA 버전 기록 형식 = sql/079 CHECK(x.y.z 숫자만), 아니면 null', () => {
  const chk = /^[0-9]+\.[0-9]+\.[0-9]+$/
  for (const ua of ['schemapi-agent/1.4.0', 'schemapi-agent/1.4', 'schemapi-agent/1.4.0-beta', 'schemapi-agent/x.y.z']) {
    const v = uaVer(ua)
    assert.ok(v === null || chk.test(v), ua)
  }
  assert.equal(uaVer('schemapi-agent/1.4'), null)
})

test('크기 초과 FAIL — 수거 시 결과 재결합 대신 413 SQL_AGT_RSLT_SIZE, 그 밖 FAIL·DONE 은 결과 그대로', () => {
  assert.equal(doneCode('FAIL', RSLT_SIZE_ERR), 'SQL_AGT_RSLT_SIZE')
  assert.equal(AGT_STATUS.SQL_AGT_RSLT_SIZE, 413)
  assert.equal(doneCode('FAIL', 'LEASE_EXP'), null)
  assert.equal(doneCode('FAIL', null), null)
  assert.equal(doneCode('DONE', RSLT_SIZE_ERR), null)
})

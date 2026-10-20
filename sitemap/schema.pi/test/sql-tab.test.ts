// SQL 편집기 편집 탭 규칙(sql/062, 마스터 지시 2026-10-20) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SQL_TAB_MAX, SQL_TAB_NM, canCreateTab, mustRollbackTab, nextTabNm } from '../src/lib/sql-tab-rule.ts'

test('상한 강제 — 활성 수 < 상한일 때만 새 탭, 무료 = 불가', () => {
  assert.equal(canCreateTab(SQL_TAB_MAX.P1 - 1, SQL_TAB_MAX.P1), true)
  assert.equal(canCreateTab(SQL_TAB_MAX.P1, SQL_TAB_MAX.P1), false)
  assert.equal(canCreateTab(0, SQL_TAB_MAX.FREE), false)
  assert.equal(canCreateTab(SQL_TAB_MAX.P4, SQL_TAB_MAX.P1), false) // 요금제 하향(DA 10개 → 개발자 3) = 새 탭만 불가
})

test('동시 등록 보정 — 등록 순 앞쪽 limit 개 밖인 늦은 쪽만 물러남', () => {
  assert.equal(mustRollbackTab(['a', 'b', 'c'], 'c', 3), false) // 상한 정확히 채움
  assert.equal(mustRollbackTab(['a', 'b', 'c', 'd'], 'd', 3), true) // 경합 2건 중 늦은 쪽
  assert.equal(mustRollbackTab(['a', 'b', 'c', 'd'], 'c', 3), false) // 경합 2건 중 이른 쪽은 유지
  assert.equal(mustRollbackTab(['a', 'b', 'x', 'y', 'n'], 'n', 3), true) // 하향 초과 계정
})

test('새 탭 이름 = sql-NNN 최대 번호 + 1', () => {
  assert.equal(nextTabNm([]), 'sql-001')
  assert.equal(nextTabNm(['sql-001', 'sql-002']), 'sql-003')
  assert.equal(nextTabNm(['sql-009']), 'sql-010')
  assert.equal(nextTabNm(['sql-001', 'sql-005']), 'sql-006') // 구멍은 채우지 않음
  assert.equal(nextTabNm(['조회', 'sql-x', 'SQL-007', 'sql-002 복사']), 'sql-001') // 형식 다른 이름 무시
  assert.equal(nextTabNm(['sql-999']), 'sql-1000')
})

test('탭 이름 형식 = 영문·숫자·한글·_ - 공백 . 1~50자', () => {
  for (const ok of ['sql-001', '고객 조회', 'a_b.c', 'x'.repeat(50)]) assert.ok(SQL_TAB_NM.test(ok), ok)
  for (const bad of ['', 'x'.repeat(51), 'a/b', '<b>', "a'b", 'a;b']) assert.ok(!SQL_TAB_NM.test(bad), bad)
})

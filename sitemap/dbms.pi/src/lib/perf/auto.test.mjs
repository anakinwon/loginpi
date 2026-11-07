// 성능 상시 자동 수집 규칙 시험 — 실행 : node --test src/lib/perf/auto.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoNext, lastAutoSlot } from './auto.ts'

const at = (iso) => Date.parse(iso)

test('기준 시각 = 지금 이전 가장 최근 UTC 18:00(KST 03:00)', () => {
  assert.equal(lastAutoSlot(at('2026-11-07T18:00:00Z')), at('2026-11-07T18:00:00Z'))
  assert.equal(lastAutoSlot(at('2026-11-07T18:40:00Z')), at('2026-11-07T18:00:00Z'))
  assert.equal(lastAutoSlot(at('2026-11-07T17:59:59Z')), at('2026-11-06T18:00:00Z'))
  assert.equal(lastAutoSlot(at('2026-11-08T03:00:00Z')), at('2026-11-07T18:00:00Z'))
  // 월 경계
  assert.equal(lastAutoSlot(at('2026-12-01T05:00:00Z')), at('2026-11-30T18:00:00Z'))
})

test('결과 코드 분류 — 다시 해도 안 됨 = 끔, 일시 오류 = 재시도, 나머지 = 오늘 끝', () => {
  for (const c of ['LINK_AUTH', 'LINK_NOT_FOUND', 'LINK_SCOPE', 'CONN_UNSUPPORTED']) assert.equal(autoNext(c), 'off')
  for (const c of ['TIMEOUT', 'LINK_DOWN', 'RATE', 'DB_FAIL', 'DB_UNAVAILABLE']) assert.equal(autoNext(c), 'retry')
  for (const c of ['OK', 'PLAN_REQUIRED', 'PLAN_EXPIRED', 'Q_UNKNOWN']) assert.equal(autoNext(c), 'done')
})

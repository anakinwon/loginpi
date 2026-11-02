// 요금제 규칙 단위 시험 — 현재 요금제 판정·권한·업그레이드 일할계산·원화→Pi·묶음 할인·견적 서명·metadata 검증. 실행 : node --test src/lib/plan-rules.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  allows,
  bundleOk,
  krwDue,
  metaKey,
  nextPlan,
  parsePlanMeta,
  pickCur,
  piAmount,
  planMemo,
  stalePayState,
  subscribed,
  upgradeFee,
} from './plan-rules.ts'
import { signQuote, verifyQuote } from './plan-quote.ts'

const NOW = Date.parse('2026-11-02T00:00:00Z')
const iso = (ms) => new Date(ms).toISOString()
const D = 86_400_000
const PRICE = { D1M: 9900, D1Y: 99000, D2M: 19900, D2Y: 199000, D3M: 39900, D3Y: 399000 }

test('현재 요금제 — 높은 요금제·기간 안·없으면 FREE', () => {
  assert.deepEqual(pickCur([], NOW), { plan: 'FREE', end: null, grace: false })
  const terms = [
    { plan_cd: 'D1', prd_cd: 'M', strt_dtm: iso(NOW - D), end_dtm: iso(NOW + 20 * D), grnt_rsn_cd: 'PAY' },
    { plan_cd: 'D3', prd_cd: null, strt_dtm: iso(NOW - D), end_dtm: iso(NOW + 6 * D), grnt_rsn_cd: 'GRACE' },
    { plan_cd: 'D2', prd_cd: 'M', strt_dtm: iso(NOW + D), end_dtm: iso(NOW + 30 * D), grnt_rsn_cd: 'PAY' }, // 아직 시작 전
  ]
  const c = pickCur(terms, NOW)
  assert.equal(c.plan, 'D3')
  assert.equal(c.grace, true)
  assert.equal(subscribed(c), false)
  assert.equal(pickCur(terms, NOW + 7 * D).plan, 'D2') // 체험 끝 → 선결제 D2
})

test('권한 — 기능 표', () => {
  assert.equal(allows('FREE', 'MON'), true)
  assert.equal(allows('FREE', 'SQL_TUNE'), false)
  assert.equal(allows('D1', 'DRIFT_VIEW'), true)
  assert.equal(allows('D1', 'DRIFT_RUN'), false)
  assert.equal(allows('D2', 'LAKE'), false)
  assert.equal(allows('D3', 'OPS'), true)
  assert.equal(nextPlan('D2'), 'D3')
  assert.equal(nextPlan('D3'), null)
})

test('업그레이드 일할계산 — schema.pi 공식', () => {
  const t = [{ plan_cd: 'D1', prd_cd: 'M', strt_dtm: iso(NOW), end_dtm: iso(NOW + 30 * D), grnt_rsn_cd: 'PAY' }]
  // 오늘 결제 D1(9,900) → D2(19,900) = 19900 − 9900 × 29/30 = 10330
  const q = upgradeFee(t, PRICE, 'D1', 'D2', NOW)
  assert.equal(q.amount, 10330)
  assert.equal(q.used, 1)
  assert.equal(upgradeFee(t, PRICE, 'D2', 'D1', NOW), null) // 하위 불가
  assert.equal(upgradeFee(t, PRICE, 'D1', 'D1', NOW, 'Y').prd, 'Y') // 같은 요금제 월 → 연
  const y = [{ ...t[0], prd_cd: 'Y' }]
  assert.equal(upgradeFee(y, PRICE, 'D1', 'D2', NOW, 'M'), null) // 연 → 월 불가
  // 선결제 1개월 → 차액 (19900 − 9900) 추가
  const pre = [...t, { plan_cd: 'D1', prd_cd: 'M', strt_dtm: iso(NOW + 30 * D), end_dtm: iso(NOW + 60 * D), grnt_rsn_cd: 'PAY' }]
  const qp = upgradeFee(pre, PRICE, 'D1', 'D2', NOW)
  assert.equal(qp.amount, 20330)
  assert.equal(qp.terms, 1)
  // 체험(GRACE)만 = 견적 없음
  assert.equal(upgradeFee([{ ...t[0], grnt_rsn_cd: 'GRACE', prd_cd: null }], PRICE, 'D1', 'D2', NOW), null)
})

test('원화 → Pi·묶음 할인 20%', () => {
  assert.equal(krwDue(19900, false), 19900)
  assert.equal(krwDue(19900, true), 15920)
  assert.equal(krwDue(9999, true), 8000) // 7999.2 → 원 단위 올림
  assert.equal(krwDue(0, false), null)
  assert.equal(piAmount(19900, 300), '66.34') // 66.333… → 0.01 올림
  assert.equal(piAmount(15000, 300), '50.00')
  assert.equal(piAmount(100, 0), null)
})

test('묶음 판정 — P4·기간 안·체험 아님', () => {
  assert.equal(bundleOk({ plan_cd: 'P4', end_dtm: iso(NOW + D), grnt_rsn_cd: 'PAY' }, NOW), true)
  assert.equal(bundleOk({ plan_cd: 'P4', end_dtm: iso(NOW + D), grnt_rsn_cd: 'GRACE' }, NOW), false)
  assert.equal(bundleOk({ plan_cd: 'P3', end_dtm: iso(NOW + D), grnt_rsn_cd: 'PAY' }, NOW), false)
  assert.equal(bundleOk({ plan_cd: 'P4', end_dtm: iso(NOW - D), grnt_rsn_cd: 'PAY' }, NOW), false)
  assert.equal(bundleOk({ plan_cd: 'FREE', end_dtm: null }, NOW), false)
  assert.equal(bundleOk(null, NOW), false)
})

test('견적 서명 — 왕복·위조·만료', () => {
  const S = 'k'.repeat(40)
  const q = { u: 'U1', m: 'M', k: 19900, a: '66.34', e: NOW + 1000 }
  const tok = signQuote(q, S)
  assert.deepEqual(verifyQuote(tok, S, NOW), { ok: true, q })
  assert.equal(verifyQuote(tok, 'x'.repeat(40), NOW).ok, false)
  assert.deepEqual(verifyQuote(tok, S, NOW + 2000), { ok: false, why: 'EXPIRED' })
  const [b, s] = tok.split('.')
  assert.equal(verifyQuote(`${b}x.${s}`, S, NOW).ok, false)
})

test('metadata 검증·metaKey·memo ASCII', () => {
  const m = { type: 'DBM_PLAN', lnk_id: '11111111-1111-1111-1111-111111111111', plan_cd: 'D2', prd_cd: 'M', from_plan: 'FREE', prd: null, pre: 0, bndl: false, q: 'x' }
  assert.ok(parsePlanMeta(m))
  assert.equal(parsePlanMeta({ ...m, plan_cd: 'FREE' }), null)
  assert.equal(parsePlanMeta({ ...m, prd_cd: 'U' }), null) // 업그레이드는 prd 필수
  assert.ok(parsePlanMeta({ ...m, prd_cd: 'U', prd: 'Y', pre: 1, from_plan: 'D1' }))
  assert.notEqual(metaKey(m), metaKey({ ...m, bndl: true }))
  assert.match(planMemo({ ...m, prd_cd: 'U', prd: 'Y', from_plan: 'D1' }), /^[\x20-\x7e]+$/)
})

test('지난 결제 판정 — gone·abandoned·pending', () => {
  const st = { cancelled: false, user_cancelled: false }
  assert.equal(stalePayState({ ok: false, status: 404 }, NOW), 'gone')
  assert.equal(stalePayState({ ok: false, status: 0 }, NOW), 'pending')
  assert.equal(stalePayState({ ok: true, payment: { status: { ...st, cancelled: true } } }, NOW), 'gone')
  assert.equal(stalePayState({ ok: true, payment: { status: st, created_at: iso(NOW - 5 * 60_000) } }, NOW), 'abandoned')
  assert.equal(stalePayState({ ok: true, payment: { status: st, created_at: iso(NOW - 60_000) } }, NOW), 'pending')
})

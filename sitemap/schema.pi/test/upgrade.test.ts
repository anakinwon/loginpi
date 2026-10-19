// 요금제 업그레이드 일할계산 단위 테스트(src/lib/upgrade.ts) — 비용 = 상위 가격 − 현재 가격 × (기준 일수 − 사용 일수) ÷ 기준 일수
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DAY_MS, upgradeFee, type UpgTerm } from '../src/lib/upgrade.ts'

const P: Record<string, number> = { P1M: 10, P1Y: 100, P2M: 20, P2Y: 200, P3M: 30, P3Y: 300, P4M: 50, P4Y: 500 }
const now = Date.parse('2026-10-19T09:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
// 시작 = now − ago(일), 1개월(31일)·1년(365일) 기간
const term = (prd: 'M' | 'Y', agoDays: number, rsn = 'PAY'): UpgTerm => {
  const s = now - agoDays * DAY_MS
  return { prd_cd: prd, strt_dtm: iso(s), end_dtm: iso(s + (prd === 'M' ? 31 : 365) * DAY_MS), grnt_rsn_cd: rsn }
}

test('마스터 사례 : 개발자 10 Pi/월 오늘 결제 → 표준담당자 = 20 − (10 − 10 × 1/30) = 10.34 Pi', () => {
  assert.deepEqual(upgradeFee([term('M', 0)], P, 'P1', 'P2', now), { amount: 10.34, credit: 9.66, used: 1, prd: 'M' })
  assert.equal(upgradeFee([term('M', 0.5)], P, 'P1', 'P2', now)?.used, 1) // 같은 날(24시간 안) = 1일
})

test('사용 일수 = 경과 + 1(결제일 1일 고정)', () => {
  assert.equal(upgradeFee([term('M', 1)], P, 'P1', 'P2', now)?.used, 2)
  assert.equal(upgradeFee([term('M', 14)], P, 'P1', 'P2', now)?.amount, 15) // 20 − 10 × 15/30
  assert.equal(upgradeFee([term('M', 30)], P, 'P1', 'P2', now)?.amount, 20) // 31일째 = 상한 30일, 차감 0
})

test('결제 당일 업그레이드 금액표(월·년)', () => {
  const m = (f: string, t: string, prd: 'M' | 'Y') => upgradeFee([term(prd, 0)], P, f, t, now)?.amount
  assert.deepEqual([m('P1', 'P2', 'M'), m('P1', 'P3', 'M'), m('P1', 'P4', 'M'), m('P2', 'P3', 'M'), m('P2', 'P4', 'M'), m('P3', 'P4', 'M')], [10.34, 20.34, 40.34, 10.67, 30.67, 21])
  assert.deepEqual([m('P1', 'P2', 'Y'), m('P1', 'P3', 'Y'), m('P1', 'P4', 'Y'), m('P2', 'P3', 'Y'), m('P2', 'P4', 'Y'), m('P3', 'P4', 'Y')], [100.28, 200.28, 400.28, 100.55, 300.55, 200.83])
})

test('업그레이드로 받은 기간(UPG)도 같은 계산, 유예·끝난 기간은 제외', () => {
  assert.equal(upgradeFee([term('M', 0, 'UPG')], P, 'P2', 'P4', now)?.amount, 30.67)
  assert.equal(upgradeFee([term('M', 0, 'GRACE')], P, 'P1', 'P2', now), null)
  assert.equal(upgradeFee([{ ...term('M', 40), end_dtm: iso(now - DAY_MS) }], P, 'P1', 'P2', now), null)
})

test('미리 연장한 미래 기간이 있으면 불가', () => {
  const cur = term('M', 5)
  assert.equal(upgradeFee([cur, { ...cur, strt_dtm: cur.end_dtm, end_dtm: iso(Date.parse(cur.end_dtm) + 30 * DAY_MS) }], P, 'P1', 'P2', now), null)
})

test('월 → 상위 요금제 연 구독도 미사용분 할인, 년 → 월 불가', () => {
  assert.deepEqual(upgradeFee([term('M', 0)], P, 'P1', 'P2', now, 'Y'), { amount: 190.34, credit: 9.66, used: 1, prd: 'Y' }) // 200 − 10 × 29/30
  assert.equal(upgradeFee([term('M', 14)], P, 'P1', 'P4', now, 'Y')?.amount, 495) // 500 − 10 × 15/30
  assert.equal(upgradeFee([term('Y', 0)], P, 'P1', 'P2', now, 'M'), null)
})

test('같은 요금제 월 → 연 : 개발자 월 오늘 결제 → 개발자 연 = 100 − 10 × 29/30 = 90.34 Pi', () => {
  assert.deepEqual(upgradeFee([term('M', 0)], P, 'P1', 'P1', now, 'Y'), { amount: 90.34, credit: 9.66, used: 1, prd: 'Y' })
  assert.equal(upgradeFee([term('M', 0)], P, 'P1', 'P1', now, 'M'), null) // 같은 요금제 같은 주기 = 업그레이드 아님
  assert.equal(upgradeFee([term('Y', 0)], P, 'P1', 'P1', now, 'Y'), null)
  // 월 → 연 업그레이드 뒤(이전 월 기간이 겹쳐 남음) → 상위 요금제 연 = 연 기간 기준 : 200 − 100 × 363/365 = 100.547 → 100.55
  assert.equal(upgradeFee([term('M', 3), term('Y', 1, 'UPG')], P, 'P1', 'P2', now, 'Y')?.amount, 100.55)
})

test('하위·같은 요금제·요금표 없음 = null', () => {
  assert.equal(upgradeFee([term('M', 0)], P, 'P3', 'P2', now), null)
  assert.equal(upgradeFee([term('M', 0)], P, 'P2', 'P2', now), null)
  assert.equal(upgradeFee([term('M', 0)], { P1M: 10 }, 'P1', 'P2', now), null)
})

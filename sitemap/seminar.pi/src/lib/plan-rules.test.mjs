// plan-rules.ts 시험 — node --test src/lib/plan-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { deductOrder, hbElapsedSec, piAmount, planMemo, signQuote, verifyQuote } from './plan-rules.ts'

const SECRET = 'x'.repeat(40)
const NOW = Date.parse('2026-10-28T00:00:00Z')
const q = { u: '11111111-1111-1111-1111-111111111111', p: 'M', a: '48.73', e: NOW + 600_000 }

test('Pi 금액 — 0.01 올림, 정확히 나누어지면 그대로, 잘못된 값 null', () => {
  assert.equal(piAmount(5000, 102.62), '48.73')
  assert.equal(piAmount(40000, 102.62), '389.79')
  assert.equal(piAmount(5000, 100), '50.00')
  assert.equal(piAmount(5000, 0), null)
  assert.equal(piAmount(5000, NaN), null)
  assert.equal(piAmount(0, 100), null)
})

test('견적 — 서명 통과·만료·변조·다른 키·형식 거절', () => {
  const t = signQuote(q, SECRET)
  const ok = verifyQuote(t, SECRET, NOW)
  assert.ok(ok.ok)
  assert.deepEqual(ok.q, q)
  assert.deepEqual(verifyQuote(t, SECRET, q.e), { ok: false, why: 'EXPIRED' })
  const [body, sig] = t.split('.')
  const forged = Buffer.from(JSON.stringify({ ...q, a: '0.01' })).toString('base64url')
  assert.equal(verifyQuote(`${forged}.${sig}`, SECRET, NOW).ok, false)
  assert.equal(verifyQuote(`${body}.${sig}x`, SECRET, NOW).ok, false)
  assert.equal(verifyQuote(t, 'y'.repeat(40), NOW).ok, false)
  assert.equal(verifyQuote(`${t}.z`, SECRET, NOW).ok, false)
  assert.equal(verifyQuote(null, SECRET, NOW).ok, false)
  assert.equal(verifyQuote(signQuote({ ...q, p: 'X' }, SECRET), SECRET, NOW).ok, false)
})

test('메모 — ASCII 만', () => {
  for (const p of ['M', 'Y']) assert.match(planMemo(p), /^[\x20-\x7e]+$/)
})

test('하트비트 경과초 — 0~90 으로 자름', () => {
  assert.equal(hbElapsedSec(NOW - 60_000, NOW), 60)
  assert.equal(hbElapsedSec(NOW - 3600_000, NOW), 90)
  assert.equal(hbElapsedSec(NOW + 5_000, NOW), 0)
})

test('차감 — 만료 빠른 것부터, 만료·소진 이용권 건너뜀, 모자라면 short', () => {
  const passes = [
    { id: 'Y', endMs: NOW + 300 * 86400e3, grntSec: 1_440_000, useSec: 0 },
    { id: 'F', endMs: NOW + 3 * 86400e3, grntSec: 3600, useSec: 3550 },
    { id: 'OLD', endMs: NOW - 1, grntSec: 3600, useSec: 0 },
    { id: 'M', endMs: NOW + 20 * 86400e3, grntSec: 108_000, useSec: 108_000 },
  ]
  assert.deepEqual(deductOrder(passes, 60, NOW), { used: [{ id: 'F', sec: 50 }, { id: 'Y', sec: 10 }], short: 0 })
  assert.deepEqual(deductOrder([passes[1]], 90, NOW), { used: [{ id: 'F', sec: 50 }], short: 40 })
  assert.deepEqual(deductOrder([], 30, NOW), { used: [], short: 30 })
})

test('SQL 015 — 하트비트 상한·무료 초가 코드 상수와 같음(정적)', async () => {
  const sql = await readFile(new URL('../../sql/015_seminar_plan.sql', import.meta.url), 'utf8')
  assert.match(sql, /LEAST\(GREATEST\(.*, 0\), 90\)/)
  assert.match(sql, /3600/)
})

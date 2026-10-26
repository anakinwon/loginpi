// @pi/payments 흐름·원장·Pi API 시험 — 가짜 fetch(Pi Platform)·가짜 Supabase(응답 큐)로 실패 경로를 확인. 실행 : pnpm --filter @pi/payments test
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PiPaymentDTO, Validators } from '../src/core.ts'
import { approvePayment, completePayment } from '../src/flow.ts'
import { approvedTargetIndexSql, markPaymentCompleted } from '../src/ledger.ts'
import { getPiPayment } from '../src/pi-api.ts'

const pay = (status: Partial<PiPaymentDTO['status']> = {}): PiPaymentDTO => ({
  identifier: 'p1',
  user_uid: 'uid-1',
  amount: 0.3,
  memo: 'm',
  metadata: { type: 'T', target_id: 'a' },
  from_address: '',
  to_address: '',
  direction: 'user_to_app',
  network: 'Pi Testnet',
  status: {
    developer_approved: false,
    transaction_verified: false,
    developer_completed: false,
    cancelled: false,
    user_cancelled: false,
    ...status,
  },
  transaction: { txid: 'tx1', verified: true, _link: '' },
  created_at: '',
})
const user = { id: 'u1', pi_uid: 'uid-1' }
const okV: Validators = { T: () => ({ ok: true, amount: 0.3 }) }

// 가짜 Pi API — 키 = "METHOD 마지막경로"(p1 · approve · complete · cancel), 값 = [status, body] 또는 함수
type Reply = [number, unknown] | (() => Response)
let pi: Record<string, Reply[]> = {}
const piCalls: string[] = []
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const key = `${init?.method ?? 'GET'} ${String(url).split('/').pop()}`
  piCalls.push(key)
  const r = pi[key]?.shift()
  if (!r) throw new Error(`예상 밖 Pi 호출 ${key}`)
  if (typeof r === 'function') return r()
  const [status, body] = r
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
  })
}) as typeof fetch

// 가짜 Supabase — 체인 메서드를 기록하고, await·maybeSingle 때 큐에서 응답을 하나 꺼낸다
type DbRes = { data?: unknown; error?: { code?: string; message: string } }
const fakeDb = (queue: DbRes[]) => {
  const calls: string[][] = []
  const take = () => {
    const r = queue.shift()
    if (!r) throw new Error('예상 밖 DB 호출')
    return Promise.resolve({ data: null, error: null, ...r })
  }
  const db = {
    from(t: string) {
      const ops = [t]
      calls.push(ops)
      const b: unknown = new Proxy(
        {},
        {
          get(_, k) {
            if (k === 'then')
              return (ok: (v: unknown) => unknown, ng: (e: unknown) => unknown) =>
                take().then(ok, ng)
            return (...a: unknown[]) => {
              ops.push(`${String(k)}${a.length ? ' ' + JSON.stringify(a[0]) : ''}`)
              return k === 'maybeSingle' ? take() : b
            }
          },
        },
      )
      return b
    },
  }
  return { db: db as unknown as SupabaseClient, calls, queue }
}
const row = (sts: string, tx_id: string | null = null) => ({
  pymnt_id: 'p1',
  usr_id: 'u1',
  pymnt_sts_cd: sts,
  pymnt_tp_cd: 'T',
  meta_val: {},
  tx_id,
})

beforeEach(() => {
  process.env.PI_API_KEY = 'test'
  pi = {}
  piCalls.length = 0
})

test('approve 실패 — Pi 재조회가 developer_approved 면 성공(원장·Pi 취소 없음)', async () => {
  pi = {
    'GET p1': [[200, pay()], [200, pay({ developer_approved: true })]],
    'POST approve': [() => { throw new Error('timeout') }],
  }
  const { db, calls } = fakeDb([{ data: [{ pymnt_id: 'p1' }] }])
  const r = await approvePayment({ db, user, paymentId: 'p1', validators: okV })
  assert.equal(r.ok, true)
  assert.ok(!piCalls.includes('POST cancel'))
  assert.equal(calls.length, 1) // insert 만
})

test('approve 실패 — Pi cancel 거부면 원장 APPROVED 유지(CANCELED 갱신 없음)', async () => {
  pi = {
    'GET p1': [[200, pay()], [200, pay()]],
    'POST approve': [[500, { error: 'boom' }]],
    'POST cancel': [[400, { error: 'tx_in_progress' }]],
  }
  const { db, calls } = fakeDb([{ data: [{ pymnt_id: 'p1' }] }])
  const r = await approvePayment({ db, user, paymentId: 'p1', validators: okV })
  assert.equal(r.ok || r.code, 'PI_API_FAILED')
  assert.equal(calls.length, 1)
})

test('approve 실패 — Pi cancel 성공 시에만 원장 CANCELED', async () => {
  pi = {
    'GET p1': [[200, pay()], [200, pay()]],
    'POST approve': [[500, { error: 'boom' }]],
    'POST cancel': [[200, pay({ cancelled: true })]],
  }
  const { db, calls } = fakeDb([{ data: [{ pymnt_id: 'p1' }] }, {}])
  const r = await approvePayment({ db, user, paymentId: 'p1', validators: okV })
  assert.equal(r.ok || r.code, 'PI_API_FAILED')
  assert.match(calls[1].join('|'), /update \{"pymnt_sts_cd":"CANCELED"/)
})

test('approve — 23505(대상 부분 유일 인덱스) → ALREADY_PAID + Pi 취소', async () => {
  pi = { 'GET p1': [[200, pay()]], 'POST cancel': [[200, pay()]] }
  const { db } = fakeDb([{ error: { code: '23505', message: 'dup' } }])
  const r = await approvePayment({ db, user, paymentId: 'p1', validators: okV })
  assert.equal(r.ok || r.code, 'ALREADY_PAID')
  assert.ok(piCalls.includes('POST cancel'))
})

test('approve — 검증기 거부여도 본인 원장 행이 있으면 Pi 취소 안 함', async () => {
  const busy: Validators = { T: () => ({ ok: false, code: 'ALREADY_PAID' }) }
  pi = { 'GET p1': [[200, pay()]] }
  const { db } = fakeDb([{ data: row('APPROVED') }])
  const r = await approvePayment({ db, user, paymentId: 'p1', validators: busy })
  assert.equal(r.ok || r.code, 'ALREADY_PAID')
  assert.ok(!piCalls.includes('POST cancel'))
  // 원장 행이 없으면 취소
  pi = { 'GET p1': [[200, pay()]], 'POST cancel': [[200, pay()]] }
  const none = fakeDb([{ data: null }])
  await approvePayment({ db: none.db, user, paymentId: 'p1', validators: busy })
  assert.ok(piCalls.includes('POST cancel'))
})

test('markPaymentCompleted — 0행이면 재조회 : 같은 txid COMPLETED 만 성공', async () => {
  const same = fakeDb([{ data: [] }, { data: row('COMPLETED', 'tx1') }])
  assert.equal((await markPaymentCompleted(same.db, 'p1', 'u1', 'tx1'))?.tx_id, 'tx1')
  const other = fakeDb([{ data: [] }, { data: row('COMPLETED', 'tx9') }])
  assert.equal(await markPaymentCompleted(other.db, 'p1', 'u1', 'tx1'), null)
  const updated = fakeDb([{ data: [row('COMPLETED', 'tx1')] }])
  const u = await markPaymentCompleted(updated.db, 'p1', 'u1', 'tx1')
  assert.equal(u?.pymnt_sts_cd, 'COMPLETED')
  assert.equal(updated.calls.length, 1)
})

test('complete — 원장 갱신 0행(동시 취소)이면 INVALID_STATE, 성공 응답 row 는 COMPLETED', async () => {
  pi = { 'POST complete': [[200, pay({ developer_completed: true })]] }
  const lost = fakeDb([{ data: row('APPROVED') }, { data: [] }, { data: row('CANCELED') }])
  const r = await completePayment({ db: lost.db, user, paymentId: 'p1', txid: 'tx1' })
  assert.equal(r.ok || r.code, 'INVALID_STATE')

  pi = { 'POST complete': [[200, pay({ developer_completed: true })]] }
  const okDb = fakeDb([{ data: row('APPROVED') }, { data: [row('COMPLETED', 'tx1')] }])
  const ok = await completePayment({ db: okDb.db, user, paymentId: 'p1', txid: 'tx1' })
  assert.equal(ok.ok && ok.row.pymnt_sts_cd, 'COMPLETED')
})

test('Pi API — 비 JSON 성공 본문·본문 수신 중 타임아웃은 { ok:false, status:0 }', async () => {
  pi = { 'GET p1': [[200, '<html>oops']] }
  const html = await getPiPayment('p1')
  assert.equal(html.ok || html.status, 0)

  pi = {
    'GET p1': [
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.error(new Error('body timeout'))
            },
          }),
          { status: 200 },
        ),
    ],
  }
  const cut = await getPiPayment('p1')
  assert.equal(cut.ok || `${cut.status}/${cut.body}`, '0/body timeout')

  pi = { 'POST approve': [[400, { error: 'already_approved' }]] }
  const { approvePiPayment } = await import('../src/pi-api.ts')
  const dup = await approvePiPayment('p1')
  assert.equal(dup.ok || `${dup.status}/${dup.error}`, '400/already_approved')

  delete process.env.PI_API_KEY
  const noKey = await getPiPayment('p1')
  assert.equal(noKey.ok || noKey.noKey, true)
})

test('approvedTargetIndexSql — DA 명명(x_pi_pymnt_NN)·부분 유일·입력 형식 검사', () => {
  const sql = approvedTargetIndexSql({ nn: '01', metaKey: 'item_id', types: ['MY_ITEM'] })
  assert.match(sql, /^-- DA-APPROVED:/)
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS x_pi_pymnt_01/)
  assert.match(sql, /\(meta_val ->> 'item_id'\)/)
  assert.match(sql, /pymnt_sts_cd = 'APPROVED' AND del_yn = 'N' AND pymnt_tp_cd IN \('MY_ITEM'\);$/)
  assert.throws(() => approvedTargetIndexSql({ nn: '1', metaKey: 'k', types: ['A'] }))
  assert.throws(() => approvedTargetIndexSql({ nn: '01', metaKey: "k'); --", types: ['A'] }))
  assert.throws(() => approvedTargetIndexSql({ nn: '01', metaKey: 'k', types: ["A')"] }))
  assert.throws(() => approvedTargetIndexSql({ nn: '01', metaKey: 'k', types: [] }))
})

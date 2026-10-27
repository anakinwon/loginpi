// app-retry.ts 시험 — 전원 고지 재시도(녹화·AI 기록 fail-open 방지). node --test src/components/room/app-retry.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latestOnly, sendRetry } from './app-retry.ts'

const noWait = async () => {}
const seq = (codes) => {
  const calls = []
  return { calls, send: async () => (calls.push(1), codes[calls.length - 1] ?? null) }
}

test('성공하면 1번만 보낸다', async () => {
  const s = seq([null])
  assert.equal(await sendRetry(s.send, () => true, noWait), null)
  assert.equal(s.calls.length, 1)
})

test('RATE_LIMITED·TIMEOUT 은 다시 보내 성공한다', async () => {
  const s = seq(['RATE_LIMITED', 'TIMEOUT', null])
  assert.equal(await sendRetry(s.send, () => true, noWait), null)
  assert.equal(s.calls.length, 3)
})

test('영구 오류(역할 박탈·퇴장)는 다시 보내지 않는다', async () => {
  for (const code of ['ROLE_FORBIDDEN', 'LEFT', 'NOT_FOUND', 'TOO_LARGE']) {
    const s = seq([code, null])
    assert.equal(await sendRetry(s.send, () => true, noWait), code)
    assert.equal(s.calls.length, 1)
  }
})

test('재시도 상한 — 간격 수 + 1 번 보내고 마지막 오류를 돌려준다', async () => {
  const s = seq(Array(10).fill('RATE_LIMITED'))
  const waits = []
  const r = await sendRetry(s.send, () => true, async (ms) => void waits.push(ms), [1, 2])
  assert.equal(r, 'RATE_LIMITED')
  assert.equal(s.calls.length, 3)
  assert.deepEqual(waits, [1, 2])
})

test('기다리는 사이 상태가 바뀌면(녹화 종료) 옛 값을 보내지 않는다', async () => {
  const s = seq(['RATE_LIMITED', null])
  let alive = true
  const r = await sendRetry(s.send, () => alive, async () => void (alive = false))
  assert.equal(r, 'CANCELLED')
  assert.equal(s.calls.length, 1)
})

test('latestOnly — 새 고지를 시작하면 앞 고지의 재시도는 멈춘다(끄기 재시도가 다시 켠 뒤에 도착하지 않게)', async () => {
  const take = latestOnly()
  const sent = []
  let release
  const gate = new Promise((r) => (release = r))
  // 끄기 : 1회차 한도 → 대기(그 사이 다시 켬) → 2회차는 보내지 않아야 한다
  const offLive = take()
  const off = sendRetry(async () => (sent.push(false), sent.length === 1 ? 'RATE_LIMITED' : null), offLive, () => gate)
  const onLive = take()
  assert.equal(offLive(), false)
  assert.equal(onLive(), true)
  assert.equal(await sendRetry(async () => (sent.push(true), null), onLive, noWait), null)
  release()
  assert.equal(await off, 'CANCELLED')
  assert.deepEqual(sent, [false, true]) // 마지막 도착 = 켜짐
})

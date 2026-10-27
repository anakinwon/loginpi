// ticker.ts 시험 — 워커 타이머 우선·워커 못 만들면 창 타이머·멈추기. node --test src/components/room/ticker.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ticker } from './ticker.ts'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('Worker 가 없으면 창 타이머로 돌고 멈추면 더 부르지 않는다', async () => {
  const saved = globalThis.Worker
  delete globalThis.Worker
  try {
    let n = 0
    const stop = ticker(5, () => n++)
    await wait(60)
    stop()
    const at = n
    assert.ok(at >= 2, `호출 ${at}`)
    await wait(30)
    assert.equal(n, at)
  } finally {
    if (saved) globalThis.Worker = saved
  }
})

test('Worker 가 있으면 워커 메시지로 부르고, 멈추면 끝내며, 워커 오류면 창 타이머로 넘어간다', async () => {
  const saved = globalThis.Worker
  const made = []
  globalThis.Worker = class {
    constructor(url) {
      this.url = url
      this.ended = false
      made.push(this)
    }
    terminate() {
      this.ended = true
    }
  }
  try {
    let n = 0
    const stop = ticker(5, () => n++)
    assert.equal(made.length, 1)
    made[0].onmessage()
    assert.equal(n, 1)
    made[0].onerror() // 워커 실패(예 CSP) → 창 타이머
    assert.equal(made[0].ended, true)
    await wait(60)
    assert.ok(n >= 2)
    stop()
    const at = n
    await wait(30)
    assert.equal(n, at)

    // 워커 경로에서 멈추면 워커를 끝낸다
    const stop2 = ticker(5, () => {})
    stop2()
    assert.equal(made[1].ended, true)
  } finally {
    if (saved) globalThis.Worker = saved
    else delete globalThis.Worker
  }
})

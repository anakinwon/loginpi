// 배경 효과 판정 시험 — node --test src/components/room/features/backgrounds/rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BG, checkMine, coverRect, overflowIds, slowWatch } from './rules.ts'

// 30fps 로 프레임마다 ms 만큼 걸린다고 치고 sec 초 동안 돌린다 — 한 번이라도 끄라고 하면 true
function run(ms, sec, watch = slowWatch()) {
  let off = false
  for (let t = 0; t <= sec * 1000; t += 33) off = watch(ms, t) || off
  return off
}

test('빠른 기기(프레임당 20ms = 50fps 처리 능력)는 끄지 않는다', () => {
  assert.equal(run(20, 10), false)
})

test('느린 기기(프레임당 80ms = 12.5fps)는 3초 지속 뒤 끈다 — 2초에는 아직', () => {
  assert.equal(run(80, 2.5), false)
  assert.equal(run(80, 4.2), true)
})

test('느렸다가 회복하면 연속 횟수가 0으로 돌아간다', () => {
  const w = slowWatch()
  let off = false
  let t = 0
  for (const ms of [80, 80, 20, 80, 80])
    for (const end = t + 1000; t <= end; t += 33) off = w(ms, t) || off
  assert.equal(off, false)
})

test('숨은 탭으로 프레임이 끊긴 창은 판정하지 않는다', () => {
  const w = slowWatch()
  assert.equal(w(80, 0), false)
  assert.equal(w(80, 5000), false)
})

test('cover 맞춤 — 정사각 이미지를 16:9 에 채우면 위아래가 잘린다', () => {
  assert.deepEqual(coverRect(100, 100, 160, 90), { x: 0, y: -35, w: 160, h: 160 })
})

test('내 이미지 검사 — 2MB 초과·이미지 아님 거부', () => {
  assert.equal(checkMine('image/png', BG.myBytes), null)
  assert.equal(checkMine('image/png', BG.myBytes + 1), 'myTooBig')
  assert.equal(checkMine('text/plain', 10), 'bgFailed')
  assert.equal(checkMine('image/svg+xml', 10), 'bgFailed')
})

test('내 이미지 상한 3장 — 넘치면 오래된 것부터', () => {
  const l = [
    { id: 'c', ts: 3 },
    { id: 'a', ts: 1 },
    { id: 'd', ts: 4 },
    { id: 'b', ts: 2 },
  ]
  assert.deepEqual(overflowIds(l), ['a'])
  assert.deepEqual(overflowIds(l.slice(0, 3)), [])
})

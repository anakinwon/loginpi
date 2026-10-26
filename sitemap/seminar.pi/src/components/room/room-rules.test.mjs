// room-rules.ts 판정 시험 — node src/components/room/room-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mainSlots, nextSpeaking, splitSlots } from './room-rules.ts'

test('하단 바 슬롯 수 — 폭 임계 565·420·370 초과 기준', () => {
  assert.equal(mainSlots(566, 'presenter'), 6)
  assert.equal(mainSlots(565, 'presenter'), 4)
  assert.equal(mainSlots(421, 'audience'), 4)
  assert.equal(mainSlots(371, 'audience'), 3)
  assert.equal(mainSlots(370, 'audience'), 2)
  assert.equal(mainSlots(566, 'audience'), 5)
})

test('더보기에 1개만 남으면 바로 노출', () => {
  assert.deepEqual(splitSlots([1, 2, 3], 2), { main: [1, 2, 3], more: [] })
  assert.deepEqual(splitSlots([1, 2, 3, 4], 2), { main: [1, 2], more: [3, 4] })
  assert.deepEqual(splitSlots([1], 2), { main: [1], more: [] })
})

// 100ms 간격으로 loud 값을 흘려 보낸 뒤 상태가 바뀐 시각을 돌려준다
function run(seq, start = { on: false, since: 0 }) {
  let st = start
  const flips = []
  seq.forEach((loud, i) => {
    const next = nextSpeaking(st, loud, 1000 + i * 100)
    if (next.on !== st.on) flips.push([i * 100, next.on])
    st = next
  })
  return flips
}

test('말하기 켜짐은 0.2초 이상 이어져야', () => {
  assert.deepEqual(run([true, false, true, false]), []) // 짧게 튄 소리는 무시
  assert.deepEqual(run([true, true, true]), [[200, true]])
})

test('말하기 꺼짐은 0.5초 이상 조용해야', () => {
  const on = { on: true, since: 0 }
  assert.deepEqual(run([false, false, false, false, true], on), []) // 0.4초 침묵 후 다시 말함 → 유지
  assert.deepEqual(run([false, false, false, false, false, false], on), [[500, false]])
})

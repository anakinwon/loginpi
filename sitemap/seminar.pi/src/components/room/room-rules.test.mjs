// room-rules.ts 판정 시험 — node src/components/room/room-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gradeNet, mainSlots, nextSpeaking, readStats, splitSlots } from './room-rules.ts'

// 발행 PC getStats 모양 표본 — kbps·손실률로 5초 구간 두 번
function samples({ aKbps = 40, vKbps = 1200, aLost = 0, vLost = 0 } = {}) {
  const at = (sec, kbA, kbV) => [
    { type: 'outbound-rtp', kind: 'audio', bytesSent: (kbA * 1000 * sec) / 8, timestamp: sec * 1000 },
    { type: 'outbound-rtp', kind: 'video', bytesSent: (kbV * 1000 * sec) / 8, timestamp: sec * 1000 },
    { type: 'remote-inbound-rtp', kind: 'audio', fractionLost: aLost },
    { type: 'remote-inbound-rtp', kind: 'video', fractionLost: vLost },
  ]
  return [readStats(at(5, aKbps, vKbps)), readStats(at(10, aKbps, vKbps))]
}
const ON = { audio: true, video: true }

test('연결 점검 — 정상은 good·원인 없음', () => {
  assert.deepEqual(gradeNet(...samples(), ON), { grade: 'good', reason: null })
})

test('연결 점검 — 손실률 임계(오디오 0.05 보통·0.33 나쁨)', () => {
  assert.equal(gradeNet(...samples({ aLost: 0.06 }), ON).grade, 'fair')
  const r = gradeNet(...samples({ aLost: 0.4 }), ON)
  assert.deepEqual([r.grade, r.reason.kind, r.reason.metric], ['poor', 'audio', 'loss'])
  // 영상 0.05~0.1 은 good 이되 원인 문장
  assert.deepEqual(gradeNet(...samples({ vLost: 0.07 }), ON).grade, 'good')
  assert.equal(gradeNet(...samples({ vLost: 0.07 }), ON).reason.metric, 'loss')
  assert.equal(gradeNet(...samples({ vLost: 0.12 }), ON).grade, 'fair')
})

test('연결 점검 — 처리량 임계(영상 750 보통·60 나쁨 kbps), 꺼진 종류는 제외', () => {
  const r = gradeNet(...samples({ vKbps: 300 }), ON)
  assert.equal(r.grade, 'fair')
  assert.equal(Math.round(r.reason.value), 300)
  assert.equal(gradeNet(...samples({ vKbps: 40 }), ON).grade, 'poor')
  assert.equal(gradeNet(...samples({ vKbps: 600 }), ON).grade, 'fair') // 750 미만 경계 안쪽
  assert.equal(gradeNet(...samples({ vKbps: 750 }), ON).grade, 'good') // 750 은 "미만" 이 아님
  assert.equal(gradeNet(...samples({ aKbps: 10 }), ON).grade, 'fair')
  assert.deepEqual(gradeNet(...samples({ vKbps: 40 }), { audio: true, video: false }), { grade: 'good', reason: null })
  assert.equal(gradeNet(readStats(null), readStats([]), ON), null)
})

test('하단 바 슬롯 수 — 폭 임계 565·420·370 초과 기준', () => {
  assert.equal(mainSlots(566, 'presenter'), 6)
  assert.equal(mainSlots(565, 'presenter'), 4)
  assert.equal(mainSlots(421, 'audience'), 4)
  assert.equal(mainSlots(371, 'audience'), 3)
  assert.equal(mainSlots(370, 'audience'), 2)
  assert.equal(mainSlots(566, 'audience'), 5)
  assert.equal(mainSlots(420, 'audience'), 3) // 경계값 420 은 "초과" 가 아니므로 아래 단계
  assert.equal(mainSlots(420, 'panel'), 3)
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

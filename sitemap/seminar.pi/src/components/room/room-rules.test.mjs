// room-rules.ts 판정 시험 — node src/components/room/room-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  barOrder,
  batchReaction,
  enqueueReactions,
  gradeNet,
  handKey,
  handNotice,
  mainSlots,
  nextPin,
  nextSpeaking,
  readStats,
  sortPeers,
  splitSlots,
} from './room-rules.ts'

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

// ── M3 ──
const P = (peerId, role, raisedTs = 0, name = peerId) => ({ peerId, name, role, raisedTs })

test('참가자 정렬 — presenter → panel → 손든 청중(먼저 든 순) → 나머지 이름순', () => {
  const list = [
    P('b', 'audience', 0, '나비'),
    P('h2', 'audience', 2000, '가람'),
    P('pn', 'panel'),
    P('a', 'audience', 0, '가람'),
    P('h1', 'audience', 1000, '하늘'),
    P('pr', 'presenter'),
  ]
  assert.deepEqual(
    sortPeers(list).map((p) => p.peerId),
    ['pr', 'pn', 'h1', 'h2', 'a', 'b'],
  )
  assert.notEqual(list[0].peerId, 'pr') // 원본 배열은 건드리지 않는다
})

test('반응 묶음 — 허용 7종만, 묶음당 최대 3개', () => {
  let b = []
  for (const e of ['👍', '🔥', '👏', '👍', '💖']) b = batchReaction(b, e)
  assert.deepEqual(b, ['👍', '👏', '👍']) // 🔥 허용 밖, 4번째 💖 는 넘쳐 버림
})

test('반응 큐 — 최대 3종·50개 상한·5초 소멸', () => {
  const counts = { '👍': 30, '👏': 30, '😀': 1, '💖': 2 }
  let { queue, nextId } = enqueueReactions([], counts, 0, 1)
  assert.equal(queue.length, 50)
  assert.ok(!queue.some((f) => f.emoji === '😀')) // 적은 4번째 종류는 빠진다
  assert.equal(nextId, 51)
  ;({ queue } = enqueueReactions(queue, { '👍': 1 }, 4999, nextId))
  assert.equal(queue.length, 50) // 꽉 찬 큐는 새 것을 버린다
  ;({ queue } = enqueueReactions(queue, { '👍': 1 }, 5000, nextId))
  assert.equal(queue.length, 1) // 5초 지난 것은 모두 정리
  assert.equal(enqueueReactions([], { '🔥': 3 }, 0, 1).queue.length, 0)
})

test('손든 사람 알림 쌓임 방지 — 1명 = 그 사람, 2명 이상 = 묶음, 무시한 손은 제외', () => {
  const one = [P('pr', 'presenter'), P('a', 'audience', 1000), P('pn', 'panel', 0)]
  assert.equal(handNotice(one, new Set()).kind, 'one')
  assert.equal(handNotice(one, new Set()).peer.peerId, 'a')
  const two = [...one, P('b', 'audience', 500)]
  assert.deepEqual(handNotice(two, new Set()), { kind: 'many', count: 2 })
  assert.equal(handNotice(two, new Set([handKey(two[3])])).peer.peerId, 'a')
  assert.deepEqual(handNotice(one, new Set([handKey(one[1])])), { kind: 'none' })
  // 무시한 뒤 다시 손을 들면(새 raisedTs) 다시 알린다
  assert.equal(handNotice([P('a', 'audience', 3000)], new Set([handKey(one[1])])).kind, 'one')
})

test('하단 바 순서 — 역할별, 가장 좁은 청중은 채팅이 반응보다 앞', () => {
  assert.deepEqual(barOrder('audience', 371).slice(0, 3), ['hand', 'react', 'chat'])
  assert.deepEqual(barOrder('audience', 370).slice(0, 2), ['hand', 'chat'])
  assert.equal(barOrder('presenter', 600).at(-1), 'hands')
  assert.equal(barOrder('panel', 600).at(-1), 'react')
})

test('화면공유 자동 고정 1회 → 끝나면 이전 고정 복원, 수동 해제 뒤 재고정 없음', () => {
  let st = { pin: 'cam:x', prev: null, seen: [] }
  st = nextPin(st, ['cam:x', 'screen:1'], ['screen:1'])
  assert.deepEqual(st, { pin: 'screen:1', prev: 'cam:x', seen: ['screen:1'] })
  const manual = { ...st, pin: null, prev: null } // 사용자가 고정 해제
  assert.equal(nextPin(manual, ['cam:x', 'screen:1'], ['screen:1']).pin, null)
  st = nextPin(st, ['cam:x'], [])
  assert.deepEqual(st, { pin: 'cam:x', prev: null, seen: [] })
  // 다시 공유하면(새 키) 또 1회 자동 고정
  assert.equal(nextPin(st, ['cam:x', 'screen:2'], ['screen:2']).pin, 'screen:2')
})

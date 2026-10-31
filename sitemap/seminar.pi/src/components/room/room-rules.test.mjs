// room-rules.ts 판정 시험 — node src/components/room/room-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  barOrder,
  capLayer,
  followKey,
  fxFrameDue,
  layoutFor,
  lockedFor,
  modActions,
  peerMedia,
  presenterGone,
  presenterHere,
  presenterResync,
  speechOn,
  ringFor,
  isBadGrade,
  layerFor,
  layerSender,
  nextToast,
  TOAST,
  wantLayer,
  worstGrade,
  batchReaction,
  enqueueReactions,
  gradeNet,
  groupTracks,
  handKey,
  handNotice,
  handsWaiting,
  mainSlots,
  nextPin,
  nextSpeaking,
  ownerKey,
  readStats,
  sortPeers,
  splitSlots,
  visibleExtras,
  APP_MAX,
  APP_PROBE,
  appSupportedBy,
  consentPlan,
  consentKeepLocal,
} from './room-rules.ts'
import { failHit, topDialog } from './room-rules.ts'

// 회귀(T05 r6) — 효과 시트(모달 dialog)가 열린 채 ctx.notice(소음 줄 실패 등)가 뜨면 바깥 알림 줄은 inert 라 가려지고 낭독되지 않았다
test('화면 알림 자리 — 열린 dialog 중 맨 위, 없으면 null(바깥 줄)', async () => {
  const a = { open: true, n: 'a' }
  const b = { open: false, n: 'b' }
  const c = { open: true, n: 'c' }
  assert.equal(topDialog([]), null)
  assert.equal(topDialog([b]), null)
  assert.equal(topDialog([a, b]), a)
  assert.equal(topDialog([a, b, c]), c)
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./room-view.tsx', import.meta.url), 'utf8')
  assert.match(src, /topDialog\(document\.querySelectorAll\('dialog'\)\)/)
  assert.match(src, /createPortal\(\s*<div role="alert"[\s\S]{0,200}noticeHost/)
})

// 회귀(T05 r2) — 연속 실패로 끈 효과의 횟수가 남아, 조명 등으로 파이프라인이 살아 있는 동안 다시 켠 배경이 실패 1번에 바로 꺼졌다
test('효과 연속 실패 — 상한에서 끄고 횟수를 지운다', () => {
  const fails = new Map()
  for (let i = 1; i < 30; i++) assert.equal(failHit(fails, 'bg', 30), false)
  assert.equal(failHit(fails, 'bg', 30), true) // 30번째에 끈다
  assert.equal(fails.has('bg'), false)
  assert.equal(failHit(fails, 'bg', 30), false) // 다시 켠 뒤 1번 실패로는 끄지 않는다(고치기 전 : 31 ≥ 30 → 바로 끔)
})

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

test('전체 화면 손들기 목록 — 손든 청중만, 무시한 손 제외, 알림 묶음과 같은 대상', () => {
  const ps = [P('pr', 'presenter'), P('a', 'audience', 1000), P('pn', 'panel', 0), P('b', 'audience', 500), P('c', 'audience', 0)]
  assert.deepEqual(handsWaiting(ps, new Set()).map((p) => p.peerId).sort(), ['a', 'b'])
  assert.deepEqual(handsWaiting(ps, new Set([handKey(ps[1])])).map((p) => p.peerId), ['b'])
  assert.equal(handsWaiting(ps, new Set()).length, handNotice(ps, new Set()).count)
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

test('트랙 주인 — consumerCreated.peer 정본, 비면 producer 별 키(합치지 않음)', () => {
  assert.equal(ownerKey('pe_1', 'p_1'), 'pe_1')
  assert.equal(ownerKey(undefined, 'p_1'), '?p_1')
  assert.equal(ownerKey('', 'p_2'), '?p_2')
})

test('무대 묶음 — 주인별 카메라·마이크 1타일, 주인 모르는 카메라 2개도 둘 다 남는다, 화면공유는 따로', () => {
  const T = (producerId, peer, kind, source) => ({ producerId, peerId: ownerKey(peer, producerId), kind, source })
  const { screens, groups } = groupTracks([
    T('v1', 'a', 'video', 'camera'),
    T('m1', 'a', 'audio', 'mic'),
    T('v2', 'b', 'video', 'camera'),
    T('s1', 'a', 'video', 'screen'),
    T('vx', '', 'video', 'camera'),
    T('vy', undefined, 'video', 'camera'),
  ])
  assert.deepEqual(
    screens.map((x) => x.producerId),
    ['s1'],
  )
  assert.deepEqual([...groups.keys()], ['a', 'b', '?vx', '?vy'])
  assert.deepEqual([groups.get('a').cam.producerId, groups.get('a').mic.producerId], ['v1', 'm1'])
  assert.equal(groups.get('?vy').cam.producerId, 'vy')
})

// ── M4 ──

test('화질 단계 — 높이 × (DPR>2 면 2) : <360 l, <720 m, 그 외 h', () => {
  assert.equal(layerFor(359, 1), 0)
  assert.equal(layerFor(360, 1), 1)
  assert.equal(layerFor(719, 2), 1) // DPR 2 는 배율 1 — 한 층 덜 받는다
  assert.equal(layerFor(720, 1), 2)
  assert.equal(layerFor(200, 3), 1) // DPR 3 → 400
  assert.equal(layerFor(360, 3), 2) // → 720
})

test('화면 밖 2초 이상·탭 숨김 → 0, 그 전엔 높이대로', () => {
  const base = { height: 800, dpr: 1, offMs: null, hidden: false }
  assert.equal(wantLayer(base), 2)
  assert.equal(wantLayer({ ...base, offMs: 1999 }), 2)
  assert.equal(wantLayer({ ...base, offMs: 2000 }), 0)
  assert.equal(wantLayer({ ...base, hidden: true }), 0)
})

test('수동 상한 — 자동값을 넘지 못하게 자름', () => {
  assert.equal(capLayer(2, 'auto'), 2)
  assert.equal(capLayer(2, 'medium'), 1)
  assert.equal(capLayer(1, 'high'), 1)
  assert.equal(capLayer(2, 'low'), 0)
})

// 가짜 타이머 — set 은 대기열에 넣고 run 으로 실행
function fakeTimers() {
  const q = new Map()
  let n = 0
  return {
    set: (fn) => (q.set(++n, fn), n),
    clear: (t) => q.delete(t),
    run: () => {
      const fns = [...q.values()]
      q.clear()
      fns.forEach((f) => f())
    },
    size: () => q.size,
  }
}

test('setLayer 송신 — 100ms 디바운스 마지막 값만, 같은 값은 안 보냄(처음 기준 2)', () => {
  const sent = []
  const tm = fakeTimers()
  const s = layerSender((id, v) => sent.push([id, v]), tm)
  s.update('c1', 2) // 서버 기본과 같음
  assert.equal(tm.size(), 0)
  s.update('c1', 1)
  s.update('c1', 0) // 디바운스 안에서 덮어씀
  assert.equal(tm.size(), 1)
  tm.run()
  assert.deepEqual(sent, [['c1', 0]])
  s.update('c1', 0)
  assert.equal(tm.size(), 0)
  s.update('c1', 2)
  s.update('c1', 0) // 되돌아오면 대기 취소
  assert.equal(tm.size(), 0)
  s.forget('c1')
  s.update('c1', 1)
  tm.run()
  assert.deepEqual(sent, [
    ['c1', 0],
    ['c1', 1],
  ])
})

test('품질 등급 — 가장 나쁜 것, poor·lost 만 나쁨', () => {
  assert.equal(worstGrade([]), 'excellent')
  assert.equal(worstGrade(['good', 'lost', 'poor']), 'lost')
  assert.deepEqual(['excellent', 'good', 'poor', 'lost'].map(isBadGrade), [false, false, true, true])
})

test('품질 알림 — 나빠지면 즉시, 회복 5초 뒤 숨김, 그사이 다시 나쁘면 유지', () => {
  let st = { shown: false, okAt: 0 }
  st = nextToast(st, false, 0)
  assert.equal(st.shown, false)
  st = nextToast(st, true, 100)
  assert.deepEqual(st, { shown: true, okAt: 0 })
  st = nextToast(st, false, 1000) // 회복 시각 기록
  assert.deepEqual(st, { shown: true, okAt: 1000 })
  st = nextToast(st, false, 1000 + TOAST.hideMs - 1)
  assert.equal(st.shown, true)
  st = nextToast(st, true, 3000) // 다시 나빠짐 — 회복 시각 초기화
  assert.deepEqual(st, { shown: true, okAt: 0 })
  st = nextToast(nextToast(st, false, 4000), false, 4000 + TOAST.hideMs)
  assert.deepEqual(st, { shown: false, okAt: 0 })
})

test('청중 화질 칸 — 맨 뒤, 폭 > 565 에서만 메인 5칸 안', () => {
  assert.equal(barOrder('audience', 600).at(-1), 'quality')
  assert.equal(barOrder('audience', 600).indexOf('quality') < mainSlots(600, 'audience'), true)
  assert.equal(barOrder('audience', 500).indexOf('quality') < mainSlots(500, 'audience'), false)
  assert.equal(barOrder('presenter', 600).includes('quality'), false)
})

test('v1.2 잠금 — 발표자는 대상 아님', () => {
  const locks = { audio: true, video: false }
  assert.deepEqual(lockedFor('presenter', locks), { audio: false, video: false })
  assert.deepEqual(lockedFor('panel', locks), locks)
})

test('v1.2 참가자 미디어 — 화면공유 제외, 일시정지 = 꺼짐', () => {
  const m = peerMedia([
    { peerId: 'n', kind: 'audio', source: 'mic', paused: false },
    { peerId: 'n', kind: 'video', source: 'camera', paused: true },
    { peerId: 'n', kind: 'video', source: 'screen', paused: false },
  ])
  assert.deepEqual(m.get('n'), { audio: true, video: false })
})

test('v1.2 사회 동작 — 발표자만, 켜진 것 끄기·꺼진 마이크 요청(잠금이면 없음)', () => {
  const panel = { peerId: 'n', name: 'N', role: 'panel', raisedTs: 0 }
  const free = { audio: false, video: false }
  assert.deepEqual(modActions('presenter', panel, { audio: true, video: true }, free), ['muteMic', 'muteCam'])
  assert.deepEqual(modActions('presenter', panel, { audio: false }, free), ['askMic'])
  assert.deepEqual(modActions('presenter', panel, undefined, free), ['askMic']) // 아직 발행 안 함 — 요청은 가능
  assert.deepEqual(modActions('presenter', panel, { audio: false }, { audio: true, video: false }), [])
  assert.deepEqual(modActions('panel', panel, { audio: true }, free), [])
  assert.deepEqual(modActions('presenter', { ...panel, role: 'presenter' }, { audio: true }, free), [])
  assert.deepEqual(modActions('presenter', { ...panel, role: 'audience' }, undefined, free), []) // 청중은 요청 대상 아님
})

test('v1.2 레이아웃 — 따라 보기·발표자 고정 변환', () => {
  const spot = { mode: 'spotlight', spotlight: 'cam:p', follow: true }
  assert.equal(followKey(spot, 'audience'), 'cam:p')
  assert.equal(followKey(spot, 'presenter'), null)
  assert.equal(followKey({ ...spot, follow: false }, 'panel'), null)
  assert.equal(followKey({ mode: 'auto', spotlight: '', follow: true }, 'audience'), null)
  assert.equal(followKey(null, 'audience'), null)
  assert.deepEqual(layoutFor('cam:n', undefined), { mode: 'spotlight', spotlight: 'cam:n', follow: true })
  assert.deepEqual(layoutFor('screen:self', 'p9'), { mode: 'spotlight', spotlight: 'screen:p9', follow: true })
  assert.equal(layoutFor('screen:self', undefined), null)
  assert.deepEqual(layoutFor(null, undefined), { mode: 'auto', spotlight: '', follow: true })
})

test('v1.2 말하기 링 — 엔진 발언자 우선, 없으면 타일 자체 판정', () => {
  assert.equal(ringFor('a', 'a', true), true)
  assert.equal(ringFor('b', 'a', true), false)
  assert.equal(ringFor(undefined, null, true), false)
  assert.equal(ringFor('a', null, false), undefined)
})

test('부가 ⋯ 항목(15.2) — 있으면 +1칸은 늘 더보기, 칸 수 상한 메인 + 1 불변(역할 3 × 폭 4)', () => {
  // 부가 항목이 없으면 기존 규칙 그대로(회귀 0)
  assert.deepEqual(splitSlots([1, 2, 3], 2, []), { main: [1, 2, 3], more: [] })
  // 넘친 기본 버튼이 1개여도 바로 노출하지 않고 ⋯ 안으로, 부가 항목은 그 뒤
  assert.deepEqual(splitSlots([1, 2, 3], 2, ['x']), { main: [1, 2], more: [3, 'x'] })
  assert.deepEqual(splitSlots([1, 2], 2, ['x', 'y']), { main: [1, 2], more: ['x', 'y'] })
  for (const role of ['presenter', 'panel', 'audience'])
    for (const width of [800, 500, 400, 300]) {
      const items = barOrder(role, width)
      const slots = mainSlots(width, role)
      for (const extra of [[], ['captions'], ['captions', 'record', 'notes', 'effects']]) {
        const { main, more } = splitSlots(items, slots, extra)
        assert.ok(main.length + (more.length ? 1 : 0) <= slots + 1, `${role} ${width} ${extra.length}`)
        assert.deepEqual([...main, ...more], [...items, ...extra]) // 빠지거나 겹친 항목 없음
      }
    }
})

test('부가 ⋯ 항목 거르기 — 역할, app 필요 항목은 지원 확인 뒤에만', () => {
  const items = [
    { id: 'cap', roles: ['presenter', 'panel', 'audience'], app: true },
    { id: 'fx', roles: ['presenter', 'panel'] },
    { id: 'rec', roles: ['presenter'], app: true },
  ]
  const ids = (role, app) => visibleExtras(items, role, app).map((x) => x.id)
  assert.deepEqual(ids('presenter', true), ['cap', 'fx', 'rec'])
  assert.deepEqual(ids('presenter', null), ['fx']) // 확인 중
  assert.deepEqual(ids('presenter', false), ['fx']) // 구 엔진
  assert.deepEqual(ids('panel', true), ['cap', 'fx'])
  assert.deepEqual(ids('audience', true), ['cap'])
  assert.deepEqual(ids('audience', false), [])
})

// 엔진 app 중계 지원 확인 — v1.3 엔진은 모르는·빈 topic 에 NOT_FOUND(주제표 ①)라서, 확인 요청은 주제표 안 topic + 상한 초과 d 여야
// 구 엔진(미구현 메서드 NOT_FOUND)과 갈린다(REA_04_UI_EXT R-A2 — 엔진 배포본 a11f7f36 의 검사 순서)
test('app 지원 확인 요청·판정', () => {
  assert.ok(['caption', 'state', 'refresh'].includes(APP_PROBE.topic)) // 주제표(SIGNAL_API 3.6) 안 — 아니면 v1.3 도 NOT_FOUND
  const bytes = new TextEncoder().encode(JSON.stringify(APP_PROBE.d)).length
  assert.ok(bytes > APP_MAX) // ② 에서 거절(중계·속도 한도 사용 없음)
  assert.ok(new TextEncoder().encode(JSON.stringify({ t: 'req', id: 1, m: 'app.send', d: APP_PROBE })).length < 64 << 10) // 엔진 MaxMessage
  assert.equal(appSupportedBy('SDP_INVALID'), true) // v1.3
  assert.equal(appSupportedBy(null), true)
  assert.equal(appSupportedBy('ROLE_FORBIDDEN'), true)
  assert.equal(appSupportedBy('NOT_FOUND'), false) // 구 엔진
  assert.equal(appSupportedBy('TIMEOUT'), false)
})

// 마이크 동의 — 서버가 정본, 이 기기 기록은 서버를 모를 때만, 서버에 없고 기기에 있으면 다시 기록
test('동의 서버·기기 맞추기', () => {
  assert.equal(consentPlan({ agreed: true, stored: true }, false), 'mark')
  assert.equal(consentPlan({ agreed: false, stored: true }, false), 'ask')
  assert.equal(consentPlan({ agreed: false, stored: true }, true), 'repost') // 전에 POST 실패
  assert.equal(consentPlan({ agreed: false, stored: false }, true), 'mark') // DB 미적용
  assert.equal(consentPlan({ agreed: false, stored: false }, false), 'ask')
  assert.equal(consentPlan(null, true), 'mark') // 네트워크·오류
  assert.equal(consentPlan(null, false), 'ask')
})

// F-U A3 — 동의 POST 실패 뒤 이 기기 기록을 남길지 : 서버를 모르는 실패만 남기고, 서버가 거절한 4xx 는 지운다(NO_AGR → 다시 묻기 순환 차단)
test('동의 저장 실패 — 네트워크·5xx·401 은 로컬 유지, 403·404·409 는 삭제', () => {
  for (const s of [0, 401, 500, 502, 503]) assert.equal(consentKeepLocal(s), true, String(s))
  for (const s of [400, 403, 404, 409, 429]) assert.equal(consentKeepLocal(s), false, String(s))
})

test('발표자가 방에 있을 때만 panel 음성 처리(자막·AI 회의록) — 발표자가 끊김 신호 없이 사라지면 멈춘다', () => {
  assert.equal(presenterHere([{ role: 'presenter' }, { role: 'panel' }]), true)
  assert.equal(presenterHere([{ role: 'panel' }, { role: 'audience' }]), false)
  assert.equal(presenterHere([]), false)
})

test('음성 조각 녹음 판정(room-view on) — 발표자 아닌 무대 역할은 발표자가 있을 때만, 동의·요청·입장 필수', () => {
  const base = { live: true, wants: ['quiet'], agreed: true, role: 'panel', peers: [{ role: 'presenter' }] }
  assert.equal(speechOn(base), true)
  assert.equal(speechOn({ ...base, peers: [{ role: 'audience' }] }), false) // 발표자 없음 — 끌 사람이 없다
  assert.equal(speechOn({ ...base, role: 'presenter', peers: [] }), true) // 발표자 본인
  assert.equal(speechOn({ ...base, wants: [] }), false)
  assert.equal(speechOn({ ...base, agreed: false }), false)
  assert.equal(speechOn({ ...base, live: false }), false)
})

test('발표자 부재 시 방 상태(자막·AI 회의록) 내리기 — 입장 전·발표자 본인은 제외', () => {
  assert.equal(presenterGone('panel', 'p1', [{ role: 'audience' }]), true)
  assert.equal(presenterGone('audience', 'p1', []), true)
  assert.equal(presenterGone('panel', 'p1', [{ role: 'presenter' }]), false)
  assert.equal(presenterGone('panel', null, []), false) // 입장 전(peers 미수신) 오판 방지
  assert.equal(presenterGone('presenter', 'p1', []), false)
})

test('발표자 입장·재입장 때 현재 state 1번 방송(notes:false 포함) — app 지원·입장 완료한 발표자만', () => {
  assert.equal(presenterResync('presenter', true, 'p1'), true)
  assert.equal(presenterResync('presenter', null, 'p1'), false) // app 지원 미확정
  assert.equal(presenterResync('presenter', false, 'p1'), false)
  assert.equal(presenterResync('presenter', true, null), false)
  assert.equal(presenterResync('panel', true, 'p1'), false) // state 는 presenter 만 보낼 수 있다
})

// 회귀(T03 r2) — 카메라를 끈 동안에도 효과 파이프라인이 검은 프레임을 그려 조명 배율이 최대로 치솟고(다시 켜면 과노출) 배경 분리가 헛돌던 결함
test('fxFrameDue — 카메라 꺼짐·같은 프레임·준비 전이면 그리지 않는다', () => {
  const ok = { enabled: true, w: 640, h: 360, ready: 4, time: 1.5, last: 1.4 }
  assert.equal(fxFrameDue(ok), true)
  assert.equal(fxFrameDue({ ...ok, enabled: false }), false)
  assert.equal(fxFrameDue({ ...ok, time: 1.4 }), false)
  assert.equal(fxFrameDue({ ...ok, ready: 1 }), false)
  assert.equal(fxFrameDue({ ...ok, w: 0 }), false)
})

// 회귀(2026-10-28 마스터) — 무대에 올랐던 참가자가 나갔다 다시 들어오면 엔진이 panel 역할을 되살려(room.go roles)
// 개최자 화면엔 무대에 있는 것처럼 보이고, 참가자는 손들기 버튼이 없어 다시 오를 방법이 없었다 → 발표자 화면이 새로 온 panel 을 청중으로
test('재입장 panel — 발표자가 peerJoined 에서 청중으로 돌린다(발표자 자신의 재입장 목록은 그대로)', async () => {
  const { readFileSync } = await import('node:fs')
  const room = readFileSync(new URL('./use-room.ts', import.meta.url), 'utf8')
  const pj = room.slice(room.indexOf("e.m === 'peerJoined'"), room.indexOf("e.m === 'peerLeft'"))
  assert.match(pj, /roleNowRef\.current === 'presenter'[\s\S]{0,120}p\.role === 'panel'[\s\S]{0,40}setPeerRole\(p\.peerId, 'audience'\)/)
})

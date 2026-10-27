// 녹화 순수 판정 시험 — node --test src/components/room/features/recording/rules.test.mjs (Node 24 타입 제거)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyRec, fitRect, meetRect, othersRecording, pickMime, pruneRec, readRecording, recFileName, saveVia, stopToast } from './rules.ts'
import { readFileSync } from 'node:fs'

test('pickMime — 앞 후보 우선, iOS(mp4 만)·미지원', () => {
  assert.equal(pickMime(() => true), 'video/webm;codecs=vp9,opus')
  assert.equal(pickMime((m) => m.startsWith('video/mp4')), 'video/mp4;codecs=avc1,mp4a.40.2')
  assert.equal(pickMime(() => false), '')
})

test('recFileName — 확장자·시각·id 정리', () => {
  const at = new Date(2026, 9, 27, 9, 5, 3)
  assert.equal(recFileName('abc-123', 'video/webm;codecs=vp8', at), 'seminar-abc-123-20261027-090503.webm')
  assert.equal(recFileName('a/b..c', 'video/mp4', at), 'seminar-abc-20261027-090503.mp4')
  assert.equal(recFileName('///', '', at), 'seminar-room-20261027-090503.webm')
})

test('fitRect — 가운데 맞춤·0 크기', () => {
  assert.deepEqual(fitRect({ x: 0, y: 0, w: 1280, h: 720 }, 640, 480), { x: 160, y: 0, w: 960, h: 720 })
  assert.deepEqual(fitRect({ x: 10, y: 20, w: 100, h: 100 }, 200, 100), { x: 10, y: 45, w: 100, h: 50 })
  assert.equal(fitRect({ x: 0, y: 0, w: 100, h: 100 }, 0, 100), null)
})

test('readRecording — 녹화 키만, 다른 기능 state·이상한 값은 무시', () => {
  assert.equal(readRecording({ recording: true }), true)
  assert.equal(readRecording({ recording: false }), false)
  for (const d of [null, undefined, 'x', 1, [], { notes: false }, { captions: false }, { recording: 'false' }, { recording: 0 }])
    assert.equal(readRecording(d), null)
})

test('applyRec — 명시적 false 만 배지를 내리고, 주기 재알림(같은 값)은 토스트 없음', () => {
  const a = applyRec({}, 'P', { recording: true })
  assert.deepEqual(a, { P: true })
  assert.equal(applyRec(a, 'P', { recording: true }), null) // 10초 재알림 — 변화 없음
  assert.equal(applyRec(a, 'P', { notes: false }), null) // 같은 주제 다른 키 — 녹화 배지 유지
  assert.equal(applyRec(a, 'P', {}), null) // 키 없음 ≠ false
  assert.deepEqual(applyRec({ P: true, Q: true }, 'P', { recording: false }), { Q: true })
  assert.equal(applyRec({}, 'P', { recording: false }), null) // 모르는 사람의 종료 — 토스트 없음
})

test('othersRecording — 알린 사람이 지금 발표자일 때만(퇴장·강등이면 내림)', () => {
  const by = { P: true }
  assert.equal(othersRecording(by, [{ peerId: 'P', role: 'presenter' }]), true)
  assert.equal(othersRecording(by, [{ peerId: 'P', role: 'panel' }]), false) // 강등
  assert.equal(othersRecording(by, [{ peerId: 'Q', role: 'presenter' }]), false) // 퇴장
  assert.equal(othersRecording({}, [{ peerId: 'P', role: 'presenter' }]), false)
})

test('saveVia — 파일 공유 되면 share, 없거나 거절·예외면 download', () => {
  const f = {}
  assert.equal(saveVia({ share() {}, canShare: () => true }, f), 'share')
  assert.equal(saveVia({ share() {}, canShare: () => false }, f), 'download')
  assert.equal(saveVia({ canShare: () => true }, f), 'download') // share 없음
  assert.equal(saveVia({ share() {} }, f), 'download') // canShare 없음(구형) — 파일 공유 가능 여부 모름
  assert.equal(
    saveVia({ share() {}, canShare: () => { throw new TypeError() } }, f),
    'download',
  )
  assert.equal(saveVia(undefined, f), 'download')
})

test('pruneRec — 강등·퇴장한 사람의 녹화 표시는 지운다(다시 발표자가 돼도 배지가 되살아나지 않게)', () => {
  // Q 강등 — 강등 뒤 끄기 알림은 엔진이 거절해 표에 남았고, 다시 승격되면 녹화도 안 하는데 배지가 켜졌다(r5 T06)
  const peers = [
    { peerId: 'P', role: 'presenter' },
    { peerId: 'Q', role: 'panel' },
  ]
  assert.deepEqual(pruneRec({ P: true, Q: true }, peers), { P: true })
  assert.equal(othersRecording(pruneRec({ Q: true }, peers) ?? {}, [{ peerId: 'Q', role: 'presenter' }]), false)
  // 퇴장(목록에 없음)도 지운다
  assert.deepEqual(pruneRec({ P: true, X: true }, peers), { P: true })
  // 바뀐 것이 없으면 null(다시 그리지 않게)
  assert.equal(pruneRec({ P: true }, peers), null)
  assert.equal(pruneRec({}, peers), null)
})

test('stopToast — 자동 종료는 이유를 알리고, 토스트 키는 ko·en 둘 다 있다', () => {
  assert.equal(stopToast(10, false), 'saved')
  assert.equal(stopToast(10, true), 'autoStopped')
  assert.equal(stopToast(0, true), 'empty')
  for (const l of ['ko', 'en']) {
    const m = JSON.parse(readFileSync(new URL(`../../../../../messages/${l}.json`, import.meta.url), 'utf8'))
    for (const k of ['saved', 'autoStopped', 'empty', 'saveFailed']) assert.ok(m.room.recording.toast[k], `${l} ${k}`)
  }
})

test('meetRect — 겹친 부분·안 겹침·맞닿음', () => {
  const b = (left, top, right, bottom) => ({ left, top, right, bottom })
  assert.deepEqual(meetRect(b(0, 0, 10, 10), b(5, 5, 20, 20)), b(5, 5, 10, 10))
  assert.equal(meetRect(b(0, 0, 10, 10), b(20, 0, 30, 10)), null)
  assert.equal(meetRect(b(0, 0, 10, 10), b(10, 0, 20, 10)), null) // 선만 닿음
})

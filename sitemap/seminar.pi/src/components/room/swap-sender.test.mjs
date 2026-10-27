// 영상 효과 송신기 교체·되돌리기 경합 시험(room-rules swapSender) — node --test src/components/room/swap-sender.test.mjs
// 회귀 대상 : 교체(replaceTrack) 대기 중 되돌리면 늦게 끝난 교체가 멈춘 처리 트랙을 송신기에 남겨 청중 영상이 멈춤(ended)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localPlan, swapSender } from './room-rules.ts'

// 송신기 모의 — PC 작업 큐처럼 replaceTrack 을 순서대로, 비동기로 반영
function fakeSender(track) {
  let chain = Promise.resolve()
  const s = {
    track,
    replaceTrack(t) {
      chain = chain.then(() => {
        s.track = t
      })
      return chain
    },
  }
  return s
}
const flush = () => new Promise((r) => setTimeout(r, 0))

test('교체가 끝나기 전에 되돌려도 원본으로 끝난다', async () => {
  const s = fakeSender('cam')
  const revert = swapSender(s, 'fx', () => 'cam')
  assert.equal(s.track, 'cam') // 아직 교체 대기 중
  revert()
  await flush()
  assert.equal(s.track, 'cam')
})

test('교체 뒤 되돌리기·곧바로 다시 켬(StrictMode 이중 실행)·송신기 없음', async () => {
  const s = fakeSender('cam')
  const r1 = swapSender(s, 'fx1', () => 'cam')
  await flush()
  assert.equal(s.track, 'fx1')
  r1()
  const r2 = swapSender(s, 'fx2', () => 'cam')
  await flush()
  assert.equal(s.track, 'fx2')
  r2()
  await flush()
  assert.equal(s.track, 'cam')
  // 교체 완료 뒤 다른 것이 송신기를 바꿨으면 건드리지 않는다
  const r3 = swapSender(s, 'fx3', () => 'cam')
  await flush()
  s.track = 'other'
  r3()
  await flush()
  assert.equal(s.track, 'other')
  swapSender(null, 'fx', () => 'cam')() // 발행 전 — 오류 없음
})

test('교체 실패(닫힌 PC)면 되돌리기 요청을 하지 않는다', async () => {
  let calls = 0
  const s = { track: 'cam', replaceTrack: () => (calls++, Promise.reject(new Error('closed'))) }
  const r = swapSender(s, 'fx', () => 'cam')
  await flush()
  r()
  assert.equal(calls, 1)
})

test('localPlan — 끝난 트랙을 켤 때만 새로 받는다', () => {
  assert.equal(localPlan(true, 'ended'), 'reacquire')
  assert.equal(localPlan(true, 'live'), 'toggle')
  assert.equal(localPlan(false, 'ended'), 'toggle') // 끄기는 권한 팝업 없이 서버 일시정지만
  assert.equal(localPlan(false, 'live'), 'toggle')
})

test('use-room — 발행한 카메라·마이크 끝남을 감시하고, 다시 켤 때 같은 송신기에 새 트랙을 끼운다', () => {
  const src = readFileSync(new URL('./use-room.ts', import.meta.url), 'utf8')
  assert.match(src, /if \(source !== 'screen'\) watchLocalEnd\(t, source, my\)/)
  assert.match(src, /localPlan\(on, track\.readyState\) === 'reacquire'/)
  assert.match(src, /sendersRef\.current\[source\]\?\.sender\.replaceTrack\(nt\)/)
  // 끝남 처리 = 서버 일시정지 + 끔 표시(청중에게 멈춘 화면 대신 꺼짐)
  const w = src.slice(src.indexOf('function watchLocalEnd'), src.indexOf('async function setMedia'))
  assert.match(w, /'producer\.pause'/)
  assert.match(w, /\[t\.kind\]: false/)
})

test('effects.ts 가 송신기 교체를 swapSender 로만 한다(직접 replaceTrack 회귀 금지)', () => {
  const src = readFileSync(new URL('./effects.ts', import.meta.url), 'utf8')
  assert.match(src, /swapSender\(sender, p\.track/)
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\.replaceTrack\(/)
})

// 녹화기 본체(recorder.ts) 실패 경로 시험 — 브라우저 객체를 가짜로 두고 시작 실패 누수·녹화 중 오류 알림을 본다.
// node --test src/components/room/features/recording/recorder.test.mjs (Node 24 타입 제거 + 확장자 없는 import 를 .ts 로 풀기)
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx)
    } catch (e) {
      if (spec.startsWith('.')) return next(`${spec}.ts`, ctx)
      throw e
    }
  },
})

// 가짜 브라우저 — 만든 트랙·켠 타이머를 센다
const live = { tracks: 0, timers: 0 }
const track = () => {
  live.tracks++
  let on = true
  return { stop: () => on && (on = false, live.tracks--) }
}
const drawn = [] // 그린 영상 id
const clips = [] // 그릴 때 건 자르기 사각형(canvas 좌표)
globalThis.getComputedStyle = (el) => ({ overflow: el.overflow ?? 'visible' })
let recorderMode = 'ok' // 'ok' | 'ctorThrows' | 'startThrows'
let lastRec = null
function install() {
  delete globalThis.Worker // ticker 가 창 타이머로 — 켜진 수를 센다
  const si = globalThis.setInterval
  const ci = globalThis.clearInterval
  const ids = new Set()
  globalThis.setInterval = (fn, ms) => {
    live.timers++
    const id = si(fn, ms)
    ids.add(id)
    return id
  }
  globalThis.clearInterval = (id) => {
    if (ids.delete(id)) live.timers--
    ci(id)
  }
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillRect() {},
        save() {},
        restore() {},
        beginPath() {},
        clip() {},
        rect: (...a) => clips.push(a.map(Math.round)),
        drawImage: (v) => drawn.push(v.id),
      }),
      captureStream: () => ({ getVideoTracks: () => [track()] }),
    }),
  }
  globalThis.MediaStream = class {
    constructor(ts = []) {
      this.ts = ts
    }
    getTracks() {
      return this.ts
    }
    getAudioTracks() {
      return []
    }
  }
  globalThis.MediaRecorder = class {
    static isTypeSupported = () => true
    constructor() {
      if (recorderMode === 'ctorThrows') throw new Error('NotSupportedError')
      this.state = 'inactive'
      this.mimeType = 'video/webm'
      lastRec = this
    }
    start() {
      if (recorderMode === 'startThrows') throw new Error('NotSupportedError')
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.onstop?.()
    }
  }
  return () => {
    ids.forEach((id) => ci(id)) // 누수가 있어도 시험 프로세스는 끝나게
    globalThis.setInterval = si
    globalThis.clearInterval = ci
  }
}
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const stage = { getBoundingClientRect: () => rect(0, 0, 640, 360), querySelectorAll: () => [] }
const ac = () => ({ createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [track()] } }), close: async () => {} })

const undo = install()
after(undo)
const { startRecorder } = await import('./recorder.ts')

for (const mode of ['ctorThrows', 'startThrows'])
  test(`시작 실패(${mode}) — 던지고, 그리기 타이머·트랙이 남지 않는다`, () => {
    recorderMode = mode
    assert.throws(() => startRecorder(stage, ac()))
    assert.equal(live.timers, 0, '그리기 타이머 누수')
    assert.equal(live.tracks, 0, '만든 트랙(canvas·오디오 대상)은 닫혀야 함')
    live.tracks = 0
    live.timers = 0
  })

test('정상 — 녹화 중 오류면 onFail, 멈추면 타이머·트랙 정리', async () => {
  recorderMode = 'ok'
  let failed = 0
  const r = startRecorder(stage, ac(), () => failed++)
  assert.equal(live.timers, 1)
  lastRec.onerror()
  assert.equal(failed, 1)
  const blob = await r.stop()
  assert.equal(blob.type, 'video/webm')
  assert.equal(live.timers, 0)
})

test('메모리 상한 — 모은 조각이 2GB 를 넘으면 onFail 1번(자동 종료·저장), 그 전엔 부르지 않는다', async () => {
  recorderMode = 'ok'
  let failed = 0
  const r = startRecorder(stage, ac(), () => failed++)
  const GB = 1024 ** 3
  lastRec.ondataavailable({ data: { size: 0 } })
  lastRec.ondataavailable({ data: { size: GB } })
  assert.equal(failed, 0)
  lastRec.ondataavailable({ data: { size: GB } }) // 2GB 도달
  lastRec.ondataavailable({ data: { size: 1 } }) // 종료 처리 중 마지막 조각 — 다시 부르지 않는다
  assert.equal(failed, 1)
  await r.stop()
})

test('그리기 — 대화상자(효과 시트 미리보기) 안 영상은 무대 녹화에 덧그리지 않는다', async () => {
  recorderMode = 'ok'
  const vid = (id, inDialog) => ({
    id,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 360,
    closest: (sel) => (sel === 'dialog' && inDialog ? {} : null),
    getBoundingClientRect: () => rect(0, 0, 320, 180),
  })
  const st = { ...stage, querySelectorAll: () => [vid('tile', false), vid('preview', true)] }
  drawn.length = 0
  const r = startRecorder(st, ac())
  assert.deepEqual(drawn, ['tile'])
  await r.stop()
})

test('그리기 — 스크롤 줄 밖으로 밀려난 타일은 건너뛰고, 걸친 타일은 보이는 만큼만 자른다', async () => {
  recorderMode = 'ok'
  // 무대 640x360 → 녹화 1280x720(배율 2). 타일 줄(overflow auto)은 x 400~640
  const strip = { overflow: 'auto', getBoundingClientRect: () => rect(400, 280, 240, 80), parentElement: stage }
  const tile = (id, left) => ({
    id,
    readyState: 4,
    videoWidth: 160,
    videoHeight: 90,
    closest: () => null,
    parentElement: { parentElement: strip }, // overflow 없는 감싸개 → 줄
    getBoundingClientRect: () => rect(left, 280, 144, 81),
  })
  const st = { ...stage, querySelectorAll: () => [tile('in', 410), tile('half', 560), tile('out', 700), tile('left', 200)] }
  drawn.length = 0
  clips.length = 0
  const r = startRecorder(st, ac())
  assert.deepEqual(drawn, ['in', 'half'])
  assert.deepEqual(clips, [
    [820, 560, 288, 160], // 줄 아래 끝(360)에서 잘림 — 279.. 대신 y 280~360
    [1120, 560, 160, 160], // x 560~640 만
  ])
  await r.stop()
})

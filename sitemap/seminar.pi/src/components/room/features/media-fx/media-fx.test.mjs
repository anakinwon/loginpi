// 조명 보정·자막 메시지 검사 시험 — node --test src/components/room/features/media-fx/media-fx.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIGHT, lightFilter, lightGain, lightStep, lightTracker, meanLuma } from './light.ts'
import { syncNoise } from './noise.ts'

// 가짜 마이크 — applyConstraints 가 ms 뒤에 끝나고 그때 설정이 바뀐다(ignore = 브라우저가 무시)
function fakeMic({ ms = 20, ignore = false } = {}) {
  const s = { noiseSuppression: true }
  const calls = []
  return {
    calls,
    readyState: 'live',
    getSettings: () => ({ ...s }),
    applyConstraints: (c) => {
      calls.push(c.noiseSuppression)
      return new Promise((r) =>
        setTimeout(() => {
          if (!ignore) s.noiseSuppression = c.noiseSuppression
          r()
        }, ms),
      )
    },
  }
}

test('소음 스위치 빠른 연타(끔→켬) — 앞 요청이 진행 중이어도 마지막 값으로 맞춘다(T03 r4)', async () => {
  const mic = fakeMic()
  let want = false
  const a = { live: true }
  const p1 = syncNoise(mic, () => want, () => a.live)
  // 연타 : 앞 effect 정리(live=false) 뒤 켬 요청
  a.live = false
  want = true
  const p2 = syncNoise(mic, () => want, () => true)
  assert.deepEqual(await Promise.all([p1, p2]), [null, null])
  assert.equal(mic.getSettings().noiseSuppression, true)
})

test('소음 — 앞 요청이 이미 나간 뒤 연타해도 최종 설정은 스위치와 같다', async () => {
  const mic = fakeMic()
  let want = false
  const a = { live: true }
  const p1 = syncNoise(mic, () => want, () => a.live)
  await new Promise((r) => setTimeout(r, 1)) // 끔 요청이 applyConstraints 진행 중
  a.live = false
  want = true
  await Promise.all([p1, syncNoise(mic, () => want, () => true)])
  assert.deepEqual(mic.calls, [false, true])
  assert.equal(mic.getSettings().noiseSuppression, true)
})

test('소음 — 이미 같은 값이면 요청 안 함, 브라우저가 무시하면 실제 값을 돌려준다', async () => {
  const mic = fakeMic({ ignore: true })
  assert.equal(await syncNoise(mic, () => true, () => true), null)
  assert.equal(mic.calls.length, 0)
  assert.equal(await syncNoise(mic, () => false, () => true), true)
  // 끝난 트랙은 건드리지 않는다
  assert.equal(await syncNoise({ ...mic, readyState: 'ended' }, () => false, () => true), null)
})

test('조명 — 끄면 배율 1·즉시 표본으로 돌아간다(다시 켤 때 옛 장면 배율 금지, T03 r4)', () => {
  let v = true
  const subs = []
  const on = { get: () => v, sub: (fn) => subs.push(fn) }
  const set = (x) => {
    v = x
    subs.forEach((f) => f())
  }
  const t = lightTracker(on)
  assert.equal(t.due(), true)
  for (let i = 0; i < 30; i++) t.sample(0.05)
  t.due()
  assert.ok(t.gain() > 1.5)
  set(false)
  assert.equal(t.gain(), 1)
  set(true)
  assert.equal(t.due(), true) // 다시 켜면 첫 프레임에 바로 잰다
  assert.equal(t.due(), false)
})
import { captionsState, parseCaption, stepSize } from '../captions/caption-rules.ts'

test('보통 조명은 보정하지 않는다', () => {
  assert.equal(lightGain(0.5), 1)
  assert.equal(lightGain(0.45), 1)
  // 경계에서 1 로 이어진다(불연속 없음)
  assert.ok(Math.abs(lightGain(0.419) - 1) < 0.01)
  assert.ok(Math.abs(lightGain(0.581) - 1) < 0.01)
})

test('어두우면 올리고 상한에서 멈춘다, 밝으면 하한까지만 낮춘다', () => {
  assert.equal(lightGain(0.3), (LIGHT.target - LIGHT.dead) / 0.3)
  assert.equal(lightGain(0.05), LIGHT.max)
  assert.equal(lightGain(0), LIGHT.max)
  assert.equal(lightGain(1), LIGHT.min)
  assert.equal(lightGain(NaN), 1)
})

test('급변 없이 목표로 수렴한다', () => {
  let b = 1
  const first = lightStep(0.1, b)
  assert.ok(first > 1 && first < 1.2)
  for (let i = 0; i < 60; i++) b = lightStep(0.1, b)
  assert.ok(Math.abs(b - LIGHT.max) < 0.01)
})

test('필터 문자열 — 밝힐 때만 대비 보강', () => {
  assert.equal(lightFilter(1), 'brightness(1.000) contrast(1.000)')
  assert.equal(lightFilter(1.4), 'brightness(1.400) contrast(1.100)')
  assert.equal(lightFilter(0.9), 'brightness(0.900) contrast(1.000)')
})

test('평균 밝기', () => {
  assert.ok(Math.abs(meanLuma([255, 255, 255, 255, 0, 0, 0, 255]) - 0.5) < 1e-9)
  assert.equal(meanLuma([]), LIGHT.target)
})

test('자막 d 검사 — 모양이 틀리면 버린다', () => {
  assert.equal(parseCaption(null), null)
  assert.equal(parseCaption({ text: 3 }), null)
  assert.equal(parseCaption({ text: '   ' }), null)
  assert.deepEqual(parseCaption({ text: ' 안녕\n하세요 ', ts: 5, lang: 'ko' }), {
    text: '안녕 하세요',
    ts: 5,
    lang: 'ko',
    sig: null,
  })
  // 서버 발급 서명(D-2)은 그대로 전달, 문자열 아님·64자 초과는 버림
  assert.equal(parseCaption({ text: 'x', sig: 'abc' }).sig, 'abc')
  assert.equal(parseCaption({ text: 'x', sig: 5 }).sig, null)
  assert.equal(parseCaption({ text: 'x', sig: 'a'.repeat(65) }).sig, null)
  assert.equal(parseCaption({ text: 'a'.repeat(900) }).text.length, 500)
  assert.equal(parseCaption({ text: '<b>x</b>', ts: 'x' }).lang, '')
})

test('state 의 자막 키만 읽는다', () => {
  assert.equal(captionsState({ captions: true }), true)
  assert.equal(captionsState({ captions: false, record: true }), false)
  assert.equal(captionsState({ record: true }), null)
  assert.equal(captionsState('x'), null)
})

test('자막 글자 크기 라디오 — 화살표 순환·Home·End, 다른 키는 무시', () => {
  assert.equal(stepSize('md', 'ArrowRight'), 'lg')
  assert.equal(stepSize('lg', 'ArrowRight'), 'sm')
  assert.equal(stepSize('lg', 'ArrowDown'), 'sm')
  assert.equal(stepSize('sm', 'ArrowLeft'), 'lg')
  assert.equal(stepSize('md', 'ArrowUp'), 'sm')
  assert.equal(stepSize('lg', 'Home'), 'sm')
  assert.equal(stepSize('sm', 'End'), 'lg')
  assert.equal(stepSize('md', 'Tab'), null)
  assert.equal(stepSize('md', ' '), null)
})

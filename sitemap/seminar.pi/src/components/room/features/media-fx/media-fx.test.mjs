// 조명 보정·자막 메시지 검사 시험 — node --test src/components/room/features/media-fx/media-fx.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIGHT, lightFilter, lightGain, lightStep, meanLuma } from './light.ts'
import { captionsState, parseCaption } from '../captions/caption-rules.ts'

test('보통 조명은 보정하지 않는다', () => {
  assert.equal(lightGain(0.5), 1)
  assert.equal(lightGain(0.45), 1)
})

test('어두우면 올리고 상한에서 멈춘다, 밝으면 하한까지만 낮춘다', () => {
  assert.equal(lightGain(0.3), 0.5 / 0.3)
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
  })
  assert.equal(parseCaption({ text: 'a'.repeat(900) }).text.length, 500)
  assert.equal(parseCaption({ text: '<b>x</b>', ts: 'x' }).lang, '')
})

test('state 의 자막 키만 읽는다', () => {
  assert.equal(captionsState({ captions: true }), true)
  assert.equal(captionsState({ captions: false, record: true }), false)
  assert.equal(captionsState({ record: true }), null)
  assert.equal(captionsState('x'), null)
})

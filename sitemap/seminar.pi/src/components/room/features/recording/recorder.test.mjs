// recorder.ts 순수 판정 시험 — node --test src/components/room/features/recording/recorder.test.mjs (Node 24 타입 제거)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitRect, pickMime, recFileName } from './recorder.ts'

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

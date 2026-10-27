// speech-rules.ts 판정 시험 — node --test src/lib/speech-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aiMime,
  baseMime,
  chunkError,
  chunkSec,
  LANG_RE,
  MAX_CHUNK_BYTES,
  paceStyle,
  sniffBox,
  speechMaxSec,
  vcUseError,
} from './speech-rules.ts'

const bytes = (...head) => {
  const b = new Uint8Array(64)
  head.forEach((v, i) => (b[i] = typeof v === 'string' ? v.charCodeAt(0) : v))
  return b
}
const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3)
const OGG = bytes(...'OggS')
const MP4 = bytes(0, 0, 0, 0x20, ...'ftypM4A ')
const WAV = bytes(...'RIFF', 0, 0, 0, 0, ...'WAVE')
const CLUSTER = bytes(0x1f, 0x43, 0xb6, 0x75) // timeslice 2번째 조각 = webm Cluster 로 시작(머리 없음)

test('MIME 정규화·외부 AI 형식', () => {
  assert.equal(baseMime('audio/webm;codecs=opus'), 'audio/webm')
  assert.equal(baseMime('AUDIO/OGG; codecs=opus'), 'audio/ogg')
  assert.equal(baseMime('video/webm'), null)
  assert.equal(baseMime(''), null)
  assert.equal(baseMime(undefined), null)
  assert.equal(aiMime('audio/mp4'), 'audio/m4a')
  assert.equal(aiMime('audio/webm;codecs=opus'), 'audio/webm')
  assert.equal(aiMime('text/plain'), null)
})

test('컨테이너 머리 판별', () => {
  assert.equal(sniffBox(WEBM), 'webm')
  assert.equal(sniffBox(OGG), 'ogg')
  assert.equal(sniffBox(MP4), 'mp4')
  assert.equal(sniffBox(WAV), 'wav')
  assert.equal(sniffBox(CLUSTER), null)
  assert.equal(sniffBox(new Uint8Array(2)), null)
})

test('조각 검사', () => {
  const ok = { type: 'audio/webm;codecs=opus', bytes: WEBM, durMs: 5000 }
  assert.equal(chunkError(ok), null)
  assert.equal(chunkError({ ...ok, type: 'audio/mp4', bytes: MP4 }), null)
  assert.equal(chunkError({ ...ok, type: 'video/mp4' }), 'mime')
  assert.equal(chunkError({ ...ok, bytes: new Uint8Array(0) }), 'size')
  assert.equal(
    chunkError({ ...ok, bytes: new Uint8Array(MAX_CHUNK_BYTES + 1) }),
    'size',
  )
  assert.equal(chunkError({ ...ok, durMs: 499 }), 'duration')
  assert.equal(chunkError({ ...ok, durMs: 10001 }), 'duration')
  assert.equal(chunkError({ ...ok, durMs: 5000.5 }), 'duration')
  // timeslice 이어 붙은 조각(머리 없음)·형식 위장은 거른다
  assert.equal(chunkError({ ...ok, bytes: CLUSTER }), 'header')
  assert.equal(chunkError({ ...ok, bytes: OGG }), 'header')
})

test('사용 초·상한', () => {
  assert.equal(chunkSec(5000), 5)
  assert.equal(chunkSec(500), 1)
  assert.equal(chunkSec(5001), 6)
  assert.equal(speechMaxSec(undefined), 7200)
  assert.equal(speechMaxSec(30), 1800)
  assert.equal(speechMaxSec(0), 7200)
  assert.equal(speechMaxSec(1.5), 7200)
})

test('사용 판정 결과 매핑', () => {
  assert.equal(vcUseError('OK'), null)
  assert.deepEqual(vcUseError('NO_AGR'), { code: 'SPEECH_NO_AGR', status: 403 })
  assert.deepEqual(vcUseError('RATE'), { code: 'SPEECH_RATE', status: 429 })
  assert.deepEqual(vcUseError('QUOTA'), { code: 'SPEECH_QUOTA', status: 429 })
  assert.deepEqual(vcUseError('NOT_LIVE'), {
    code: 'SPEECH_NOT_LIVE',
    status: 409,
  })
  assert.deepEqual(vcUseError('FORBIDDEN'), { code: 'FORBIDDEN', status: 403 })
  assert.deepEqual(vcUseError('NOT_FOUND'), { code: 'NOT_FOUND', status: 404 })
  assert.deepEqual(vcUseError('INVALID'), {
    code: 'INVALID_INPUT',
    status: 400,
  })
  assert.deepEqual(vcUseError(undefined), { code: 'INTERNAL', status: 500 })
})

test('언어 코드·속도 문구', () => {
  for (const v of ['ko', 'en', 'pt-BR', 'zh-Hant', 'sr-Latn-RS', 'fil'])
    assert.ok(LANG_RE.test(v), v)
  for (const v of ['', 'k', 'KO', 'ko_KR', 'en-', 'x'.repeat(20), 'ko;drop'])
    assert.ok(!LANG_RE.test(v), v)
  assert.equal(paceStyle(1), null)
  assert.equal(paceStyle(1.2), 'speaking quickly')
  assert.equal(paceStyle(0.8), 'speaking slowly')
  assert.equal(paceStyle(NaN), null)
})

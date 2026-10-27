// speech-rules.ts 판정 시험 — node --test src/lib/speech-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aiMime,
  baseMime,
  billSec,
  RESERVE_BYTES_PER_SEC,
  reserveSec,
  settleSec,
  chunkError,
  chunkSec,
  LANG_RE,
  MAX_CHUNK_BYTES,
  paceStyle,
  sniffBox,
  speechMaxSec,
  usrMaxSec,
  vcUseError,
  once,
  dubRate,
  pushDub,
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
  assert.equal(sniffBox(WAV), null) // wav 는 받지 않는다(5초 16kHz ≈ 160KB = 크기 상한)
  assert.equal(sniffBox(CLUSTER), null)
  assert.equal(sniffBox(new Uint8Array(2)), null)
})

test('조각 검사', () => {
  const ok = { type: 'audio/webm;codecs=opus', bytes: WEBM, durMs: 5000 }
  assert.equal(chunkError(ok), null)
  assert.equal(chunkError({ ...ok, type: 'audio/mp4', bytes: MP4 }), null)
  assert.equal(chunkError({ ...ok, type: 'video/mp4' }), 'mime')
  assert.equal(chunkError({ ...ok, type: 'audio/wav', bytes: WAV }), 'mime')
  assert.equal(MAX_CHUNK_BYTES, 160_000) // 10초 × 128kbps
  const full = new Uint8Array(MAX_CHUNK_BYTES)
  full.set(WEBM.subarray(0, 4))
  assert.equal(chunkError({ ...ok, bytes: full }), null)
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
  assert.equal(usrMaxSec(7200), 1800) // 참가자 1인 = 전체의 1/4
})

test('과금 초 — 신고 길이 vs 바이트(128kbps) 중 큰 쪽', () => {
  assert.equal(billSec(5000, 30_000), 5) // 정상 opus 5초 = 신고 길이
  assert.equal(billSec(500, MAX_CHUNK_BYTES), 10) // 160KB 를 0.5초로 신고 = 10초 과금
  assert.equal(billSec(500, 512 * 1024), 33) // (구 상한 512KB 라면 33초)
  assert.equal(billSec(5000, 16_001), 5)
  assert.equal(billSec(1000, 16_001), 2)
})

test('선예약 — opus 최저 6kbps 로 본 최악 길이(사후 정산 경합 차단)', () => {
  assert.equal(RESERVE_BYTES_PER_SEC, 750)
  assert.equal(reserveSec(5000, 3750), 5) // 6kbps 5초 = 신고 길이 그대로
  assert.equal(reserveSec(5000, 32_000), 43) // 크롬 기본(약 51kbps) 5초 조각 = 43초 예약
  assert.equal(reserveSec(500, MAX_CHUNK_BYTES), 214) // 160KB 에 담길 수 있는 최장 = 213.3초 → 214
  assert.ok(reserveSec(5000, 100) >= 5) // 예약 >= 신고 길이
})

test('호출 뒤 정산 — 음수 = 환급, 양수 = 추가, 실패 = 과금 초까지 환급', () => {
  assert.equal(settleSec(43, 5, 160), -38) // 실제 5초 → 38초 환급
  assert.equal(settleSec(43, 5, 32 * 7), -36) // 실제 7초
  assert.equal(settleSec(214, 10, 32 * 213), -1) // 저비트레이트 213초 = 거의 전부 과금
  assert.equal(settleSec(5, 5, 32 * 9), 4) // 6kbps 보다 낮은 비트레이트 = 차이 추가
  assert.equal(settleSec(43, 5, null), -38) // 호출 실패·토큰 없음 = 128kbps 하한까지만
  assert.equal(settleSec(43, 5, NaN), -38)
  assert.equal(settleSec(43, 5, -1), -38)
  assert.equal(settleSec(5, 5, 160), 0) // 차이 없음 = 호출 생략
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

test('더빙 — 끝 처리 1회·재생 속도·큐 넘침', () => {
  let n = 0
  const end = once(() => n++)
  end() // 디코드 실패 = onerror
  end() // 같은 문장의 play() 거부
  assert.equal(n, 1)

  assert.equal(dubRate(5), 1)
  assert.equal(dubRate(6), 1.2)
  assert.equal(dubRate(10), 1.5) // 상한
  assert.equal(dubRate(2), 0.8) // 하한
  assert.equal(dubRate(NaN), 1)

  let q = []
  for (const x of [1, 2, 3]) q = pushDub(q, x).q
  const r = pushDub(q, 4)
  assert.deepEqual(r.q, [2, 3, 4])
  assert.deepEqual(r.dropped, [1])
})

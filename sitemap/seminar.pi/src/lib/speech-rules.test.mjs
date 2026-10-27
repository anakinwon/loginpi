// speech-rules.ts 판정 시험 — node --test src/lib/speech-rules.test.mjs (Node 24 는 .ts 를 타입 제거로 바로 읽는다)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aiMime,
  engineAdminBase,
  stageAllowed,
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
  settleWithin,
  captionFresh,
  chunkHeard,
  VAD,
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
  assert.equal(baseMime('constructor'), null) // 원형 속성 이름은 모르는 형식(r2)
  assert.equal(baseMime('__proto__'), null)
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

// 회귀(T02 r1) — 대면 노트 [종료] 가 진행 중 조각을 기다리지 않고 요약해 마지막 말이 빠지던 결함
test('settleWithin — 진행 중 업로드 기다림(실패 포함)·상한 초과 시 false', async () => {
  const wait = (ms, v) => new Promise((r) => setTimeout(r, ms, v))
  assert.equal(await settleWithin([], 50), true)
  assert.equal(
    await settleWithin([wait(5), Promise.reject(new Error('x'))], 200),
    true,
  )
  const t0 = Date.now()
  assert.equal(await settleWithin([wait(1000)], 30), false)
  assert.ok(Date.now() - t0 < 500) // 느린 업로드가 종료를 붙잡지 않는다
})

// 회귀(T09 r2) — 합성이 다음 문장도 실패할 상태(한도 소진·종료·자격 없음·AI 꺼짐)면 더빙을 끈다. 일시 실패는 그 문장만 건너뜀
test('dubStop — 401·403·409·503·SPEECH_QUOTA 는 끔, SPEECH_RATE·400·502 는 계속', async () => {
  const { dubStop, TTS_MAX_CHARS } = await import('./speech-rules.ts')
  for (const s of [401, 403, 409, 503]) assert.equal(dubStop(s), true, String(s))
  assert.equal(dubStop(429, 'SPEECH_QUOTA'), true)
  assert.equal(dubStop(429, 'SPEECH_RATE'), false)
  for (const s of [400, 500, 502]) assert.equal(dubStop(s), false, String(s))
  assert.equal(TTS_MAX_CHARS, 300)
})

// 회귀(T09 r2, 보안 검토 D-2) — 캐시 적중도 자격 판정 : 비참가자 + 적중 → 403, 종료 세미나 + 적중 → 409.
//  라우트는 DB·외부 AI 가 필요해 원문 순서로 확인 — 적중 분기의 aiGate 가 내주기(await p)보다 앞
test('tts·translate 라우트 — 캐시 적중 분기에서 aiGate 를 await p 보다 먼저, tts 본문 상한 = TTS_MAX_CHARS', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const f of ['tts', 'translate']) {
    const src = (await readFile(new URL(`../app/api/speech/${f}/route.ts`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n')
    const hit = src.indexOf('if (p) {')
    const g = src.indexOf('await aiGate(smnId, user)')
    const serve = src.indexOf('await p\n')
    assert.ok(hit > 0 && g > hit && g < src.indexOf('} else {', hit) && serve > g, `${f}: 적중 분기 aiGate 순서`)
  }
  const tts = await readFile(new URL('../app/api/speech/tts/route.ts', import.meta.url), 'utf8')
  assert.match(tts, /\.max\(TTS_MAX_CHARS\)/)
  const e = await readFile(new URL('./engage.ts', import.meta.url), 'utf8')
  const ag = e.slice(e.indexOf('export async function agreeGate'))
  // aiGate = agreeGate(live) — LIVE 아님 409, 비참가(개최자·참가·ADMIN 아님) 403
  assert.ok(ag.includes(`liveOnly && m.data.smn_sts_cd !== 'LIVE'`) && ag.includes(`apiError('FORBIDDEN', 403)`))
  assert.match(e, /export const aiGate = \(smnId: string, user: UserRow\) => agreeGate\(smnId, user, true\)/)
})

// 회귀(T03 r2) — 겹친 조각 업로드에서 늦게 온 옛 조각이 최신 자막을 덮고 더빙이 거꾸로 읽던 결함
test('captionFresh — 앞서 방송한 조각보다 오래된 조각은 버린다', () => {
  let last = 0
  const deliver = (ts) => {
    if (!captionFresh(last, ts)) return false
    last = ts
    return true
  }
  assert.equal(deliver(10_000), true) // 조각 A(0~5초)
  assert.equal(deliver(15_000), true) // 조각 B 응답이 먼저
  assert.equal(deliver(10_500), false) // 늦게 온 옛 조각 — 버림
  assert.equal(deliver(20_000), true)
})

// 보강(T03 r2) — 마이크 켜진 채 무음인 조각은 외부 AI 로 보내지 않는다(비용), 측정 못 하면 보낸다(fail-open)
test('chunkHeard — 무음 조각 거르기·측정 불가 시 보냄', () => {
  assert.equal(chunkHeard(0.002, 50), false) // 5초 내내 조용함
  assert.equal(chunkHeard(VAD.level, 50), true) // 경계 = 보냄
  assert.equal(chunkHeard(0.05, 50), true) // 말함
  assert.equal(chunkHeard(0, 0), true) // AudioContext suspended·미지원 = 표본 없음 → 보냄
  assert.equal(chunkHeard(0, VAD.minSamples - 1), true)
  assert.ok(VAD.level < 0.04) // 말하기 링 기준보다 낮다(작은 목소리 보냄)
})

// D-1 — 엔진 관리 API 주소·무대 판정(서버 /api/speech/chunk stageGate 가 쓴다)
test('engineAdminBase : ws(s) 시그널링 주소 → 같은 호스트·포트의 http(s) origin', () => {
  assert.equal(engineAdminBase('wss://media.example.com/signal'), 'https://media.example.com')
  assert.equal(engineAdminBase('ws://localhost:7880/signal'), 'http://localhost:7880')
  assert.equal(engineAdminBase('WSS://Media.example.com:8443/signal?x=1'), 'https://media.example.com:8443')
  for (const bad of [undefined, null, '', 'https://x/signal', 'wss://', 'javascript:alert(1)']) assert.equal(engineAdminBase(bad), null, String(bad))
})

test('stageAllowed : presenter 늘, panel 은 발표자 있을 때만, audience·미접속 거절(화면 speechOn 과 같은 규칙)', () => {
  assert.equal(stageAllowed({ role: 'presenter', presenter: true }), true)
  assert.equal(stageAllowed({ role: 'panel', presenter: true }), true)
  assert.equal(stageAllowed({ role: 'panel', presenter: false }), false)
  assert.equal(stageAllowed({ role: 'panel' }), false)
  assert.equal(stageAllowed({ role: 'audience', presenter: true }), false)
  assert.equal(stageAllowed(null), false)
  assert.equal(stageAllowed({}), false)
})

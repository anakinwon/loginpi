// translate-rules.ts 시험(SA8) — node --test src/lib/translate-rules.test.mjs. 한국어 → 영어 번역 요청의 규칙·캐시 키 확인
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_LIMIT,
  cacheKey,
  capSig,
  capSigOk,
  cleanText,
  hitRate,
  isTranslateLang,
  Lru,
  MAX_TEXT_CHARS,
  sameLang,
  TRANSLATE_LANGS,
} from './translate-rules.ts'

test('대상 언어 — 60개 이상, 중복 없음, 목록 밖·형식 이상 거부', () => {
  assert.ok(TRANSLATE_LANGS.length >= 60)
  assert.equal(new Set(TRANSLATE_LANGS).size, TRANSLATE_LANGS.length)
  assert.ok(isTranslateLang('en') && isTranslateLang('ko') && isTranslateLang('zh-TW'))
  assert.ok(!isTranslateLang('dz') && !isTranslateLang('EN') && !isTranslateLang(1))
})

test('한국어 자막 → 영어 : 언어가 달라 번역 요청, 같은 언어면 건너뜀', () => {
  assert.equal(sameLang('ko', 'en'), false)
  assert.equal(sameLang('ko-KR', 'ko'), true)
  assert.equal(sameLang('en', 'en'), true)
  assert.equal(sameLang('zh', 'zh-TW'), false)
  assert.equal(sameLang('', 'en'), false) // 감지 실패 = 요청(외부 AI 가 같은 언어면 그대로 돌려줌)
})

test('문장 정리 — 공백 정규화, 빈 글·500자 초과 거부', () => {
  assert.equal(cleanText('  안녕하세요,\n 여러분  '), '안녕하세요, 여러분')
  assert.equal(cleanText('   '), null)
  assert.equal(cleanText('가'.repeat(500)), '가'.repeat(500))
  assert.equal(cleanText('가'.repeat(501)), null)
  assert.equal(cleanText(3), null)
})

test('글자 상한(D-2) = 자막 표시 상한 CAPTION.maxChars(500), 외부 AI translate 상한(speech-rules) 이하', async () => {
  const [{ MAX_TEXT_CHARS: AI_MAX }, { CAPTION }] = await Promise.all([
    import('./speech-rules.ts'),
    import('../components/room/features/captions/caption-rules.ts'),
  ])
  assert.equal(MAX_TEXT_CHARS, CAPTION.maxChars)
  assert.ok(MAX_TEXT_CHARS <= AI_MAX)
})

// D-2 회귀 — 번역·합성은 서버가 서명한 자막만. 임의 글·다른 세미나·변조 서명은 거부
const SECRET = 's'.repeat(32)
const SMN = '0b5e7a52-3c1d-4e8f-9a6b-1c2d3e4f5a6b'
test('자막 서명 — 서명한 글·세미나만 통과, 공백 차이·대문자 uuid 는 같은 글로 본다', async () => {
  const sig = await capSig(SECRET, SMN, '안녕하세요 여러분')
  assert.match(sig, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분', sig), true)
  assert.equal(await capSigOk(SECRET, SMN.toUpperCase(), ' 안녕하세요\n여러분 ', sig), true)
  assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분!', sig), false) // 글 변조
  assert.equal(await capSigOk(SECRET, '1b5e7a52-3c1d-4e8f-9a6b-1c2d3e4f5a6b', '안녕하세요 여러분', sig), false) // 다른 세미나
  assert.equal(await capSigOk('t'.repeat(32), SMN, '안녕하세요 여러분', sig), false) // 다른 키
  const bad = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분', bad), false)
  for (const s of [undefined, null, '', 'x', sig + 'A', 1]) assert.equal(await capSigOk(SECRET, SMN, '안녕하세요 여러분', s), false)
})

test('자막 서명 — 빈 글·500자 초과는 서명하지 않음(번역 불가 = 원문만)', async () => {
  assert.equal(await capSig(SECRET, SMN, '  '), null)
  assert.equal(await capSig(SECRET, SMN, 'a'.repeat(501)), null)
  assert.equal(await capSigOk(SECRET, SMN, 'a'.repeat(501), await capSig(SECRET, SMN, 'a'.repeat(500))), false)
})

test('AI 계량 상한 — 합성이 번역보다 작고, 분당 상한은 세미나 상한보다 작음', () => {
  for (const k of ['TRANS', 'TTS']) assert.ok(AI_LIMIT[k].maxMinChr > MAX_TEXT_CHARS && AI_LIMIT[k].maxMinChr < AI_LIMIT[k].maxChr)
  assert.ok(AI_LIMIT.TTS.maxChr < AI_LIMIT.TRANS.maxChr)
})

test('번역·합성 라우트 — engage.gate(OPEN·무료 미등록 통과) 대신 서명 확인 + fn_use_smn_ai 계량(D-2 회귀 방지)', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const [f, kind] of [['translate', 'TRANS'], ['tts', 'TTS']]) {
    const src = await readFile(new URL(`../app/api/speech/${f}/route.ts`, import.meta.url), 'utf8')
    assert.ok(src.includes('capSigOk(env.PI_SESSION_SECRET'), f)
    assert.ok(src.includes(`'fn_use_smn_ai'`) && src.includes(`p_kind: '${kind}'`), f)
    assert.ok(!/\bgate\(/.test(src), f)
  }
  const sql = await readFile(new URL('../../sql/010_seminar_ai_use.sql', import.meta.url), 'utf8')
  assert.ok(sql.includes(`smn_sts_cd <> 'LIVE'`) && sql.includes('FROM smn_ptc p'))
})

test('캐시 키 =언어 + 문장 sha256 — 같은 문장·언어는 같은 키, 언어·문장이 다르면 다른 키', async () => {
  const a = await cacheKey('안녕하세요, 여러분', 'en')
  assert.match(a, /^en:[0-9a-f]{64}$/)
  assert.equal(a, await cacheKey('안녕하세요, 여러분', 'en'))
  assert.notEqual(a, await cacheKey('안녕하세요, 여러분', 'ja'))
  assert.notEqual(a, await cacheKey('안녕하세요 여러분', 'en'))
  await assert.rejects(cacheKey('x', 'en; drop'))
})

test('LRU — 상한 넘으면 가장 오래 안 쓴 것부터 버림, get 은 최근으로 올림', () => {
  const c = new Lru(2)
  c.set('a', 1)
  c.set('b', 2)
  assert.equal(c.get('a'), 1) // a 최근
  c.set('c', 3) // b 버림
  assert.equal(c.get('b'), undefined)
  assert.equal(c.get('a'), 1)
  assert.equal(c.size, 2)
})

test('사용자당 분당 60회 — 61번째 거부, 1분 지나면 다시 허용, 사용자별 분리', () => {
  const t = new Map()
  for (let i = 0; i < 60; i++) assert.ok(hitRate(t, 'u1', 1000))
  assert.equal(hitRate(t, 'u1', 1000), false)
  assert.ok(hitRate(t, 'u2', 1000))
  assert.ok(hitRate(t, 'u1', 61_000))
})

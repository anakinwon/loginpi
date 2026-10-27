// translate-rules.ts 시험(SA8) — node --test src/lib/translate-rules.test.mjs. 한국어 → 영어 번역 요청의 규칙·캐시 키 확인
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cacheKey, cleanText, hitRate, isTranslateLang, Lru, sameLang, TRANSLATE_LANGS } from './translate-rules.ts'

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

test('문장 정리 — 공백 정규화, 빈 글·2,000자 초과 거부', () => {
  assert.equal(cleanText('  안녕하세요,\n 여러분  '), '안녕하세요, 여러분')
  assert.equal(cleanText('   '), null)
  assert.equal(cleanText('가'.repeat(2001)), null)
  assert.equal(cleanText(3), null)
})

test('글자 상한 = speech-rules MAX_TEXT_CHARS(외부 AI translate 상한)와 같음', async () => {
  const { MAX_TEXT_CHARS } = await import('./speech-rules.ts')
  assert.ok(cleanText('a'.repeat(MAX_TEXT_CHARS)))
  assert.equal(cleanText('a'.repeat(MAX_TEXT_CHARS + 1)), null)
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

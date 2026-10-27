// caption-sig.ts 서명·검증 시험 — node --test src/lib/caption-sig.test.mjs (보안 검토 D-2 : 서버가 발급한 자막만 번역·합성)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPTION_SIG_TTL_MS, signCaption, verifyCaption } from './caption-sig.ts'

const K = 'k'.repeat(32)
const c = { smnId: '11111111-1111-1111-1111-111111111111', lang: 'en', text: 'Hello  world' }
const now = 1_800_000_000_000

test('발급한 서명은 통과 — 공백 정규화·uuid 대소문자 무관', () => {
  const s = signCaption(K, c, now)
  assert.ok(verifyCaption(K, s, c, now))
  assert.ok(verifyCaption(K, s, { ...c, text: ' Hello world ' }, now))
  assert.ok(verifyCaption(K, s, { ...c, smnId: c.smnId.toUpperCase() }, now))
})

test('글·언어·세미나·키가 다르면 거부(임의 글 합성 차단)', () => {
  const s = signCaption(K, c, now)
  assert.equal(verifyCaption(K, s, { ...c, text: 'Hello world!' }, now), false)
  assert.equal(verifyCaption(K, s, { ...c, lang: 'ko' }, now), false)
  assert.equal(verifyCaption(K, s, { ...c, lang: '' }, now), false) // 원문 서명을 번역문 서명으로 못 씀
  assert.equal(verifyCaption(K, s, { ...c, smnId: '22222222-2222-2222-2222-222222222222' }, now), false)
  assert.equal(verifyCaption('x'.repeat(32), s, c, now), false)
})

test('만료·만료 시각 위조·형식 오류는 거부', () => {
  const s = signCaption(K, c, now)
  assert.equal(verifyCaption(K, s, c, now + CAPTION_SIG_TTL_MS + 1), false)
  const [exp, m] = s.split('.')
  assert.equal(verifyCaption(K, `${Number(exp) + 1}.${m}`, c, now), false)
  assert.equal(verifyCaption(K, `${now + CAPTION_SIG_TTL_MS * 10}.${m}`, c, now), false) // 먼 미래 만료
  for (const bad of [undefined, null, 1, '', '.', 'abc', `${exp}.`, `.${m}`, 'x'.repeat(65)])
    assert.equal(verifyCaption(K, bad, c, now), false)
})

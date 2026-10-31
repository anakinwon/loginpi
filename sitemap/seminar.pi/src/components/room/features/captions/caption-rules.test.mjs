// 자막 d 검사·선번역·크기 맞춤 시험(마스터 A안 2026-10-31) — node --test src/components/room/features/captions/caption-rules.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CAPTION, CAPTION_MAX_BYTES, fitCaption, parseCaption, preOf } from './caption-rules.ts'
import { localDubRate, pickVoice } from '../../../../lib/speech-rules.ts'

const SIG = 'a'.repeat(43)

test('parseCaption — 선번역 tr·trSig 는 언어 키·글만 받고, 서명은 글이 있는 언어만', () => {
  const c = parseCaption({ text: ' 안녕  하세요 ', ts: 1, lang: 'ko', sig: SIG, tr: { en: ' Hello ', ja: '', 'zh-TW': '你好', bad_key: 'x', fr: 42 }, trSig: { en: SIG, ja: SIG, fr: SIG } })
  assert.equal(c.text, '안녕 하세요')
  assert.deepEqual(c.tr, { en: 'Hello', 'zh-TW': '你好' })
  assert.deepEqual(c.trSig, { en: SIG }) // ja 는 글이 없어 빠짐, fr 은 글이 문자열이 아님
  // 선번역 없는 옛 자막은 키 자체가 없다(기존 화면·시험과 같은 모양)
  const o = parseCaption({ text: 'hi', ts: 1, lang: 'en', sig: SIG })
  assert.equal('tr' in o, false)
  assert.equal(parseCaption({ text: 'hi', tr: 'nope' }).tr, undefined)
  // 글 상한 500 — 선번역도 같은 상한
  assert.equal(parseCaption({ text: 'x', tr: { en: 'y'.repeat(600) } }).tr.en.length, CAPTION.maxChars)
})

test('preOf — 내 언어 글이 있으면 {text, sig}, 서명 없으면 sig null, 없으면 null', () => {
  const c = { tr: { en: 'Hello', ja: 'こんにちは' }, trSig: { en: SIG } }
  assert.deepEqual(preOf(c, 'en'), { text: 'Hello', sig: SIG })
  assert.deepEqual(preOf(c, 'ja'), { text: 'こんにちは', sig: null })
  assert.equal(preOf(c, 'fr'), null)
  assert.equal(preOf(null, 'en'), null)
})

test('fitCaption — 엔진 d 4KB 안으로 번역을 뒤에서부터 덜어 내고 원문·서명은 남긴다', () => {
  const long = '한'.repeat(500) // 1,500바이트
  const d = { text: '원문', ts: 1, lang: 'ko', sig: SIG, tr: { en: long, ja: long, de: long }, trSig: { en: SIG, ja: SIG, de: SIG } }
  const out = fitCaption(d)
  const bytes = new TextEncoder().encode(JSON.stringify(out)).length
  assert.ok(bytes <= CAPTION_MAX_BYTES, `bytes ${bytes}`)
  assert.deepEqual(Object.keys(out.tr), ['en', 'ja']) // 마지막(de)만 빠짐
  assert.deepEqual(Object.keys(out.trSig), ['en', 'ja'])
  assert.equal(out.text, '원문')
  assert.equal(out.sig, SIG)
  // 작으면 그대로, 번역 없는 자막은 키가 생기지 않는다
  const small = { text: 'a', ts: 1, lang: 'ko', sig: SIG, tr: { en: 'b' }, trSig: { en: SIG } }
  assert.deepEqual(fitCaption(small), small)
  const bare = fitCaption({ text: 'a', ts: 1, lang: 'ko', sig: SIG })
  assert.equal('tr' in bare, false)
  // 번역을 다 빼도 넘는 경우(있을 수 없는 크기)에도 원문은 남는다
  const huge = fitCaption({ text: long, ts: 1, lang: 'ko', sig: SIG, tr: { en: long } }, 100)
  assert.equal(huge.text, long)
  assert.equal(huge.tr, undefined)
})

test('기기 목소리 고르기 — 정확 태그 → 기본 언어, 없으면 null · 기기 합성 속도는 밀린 수만 반영', () => {
  const list = [{ lang: 'en-US' }, { lang: 'en_GB' }, { lang: 'zh-CN' }, { lang: 'zh-TW' }, { lang: 'ja-JP' }]
  assert.equal(pickVoice('en', list).lang, 'en-US')
  assert.equal(pickVoice('zh-TW', list).lang, 'zh-TW')
  assert.equal(pickVoice('zh', list).lang, 'zh-CN')
  assert.equal(pickVoice('ja', list).lang, 'ja-JP')
  assert.equal(pickVoice('fr', list), null)
  assert.equal(pickVoice('', list), null)
  assert.equal(pickVoice('en', []), null)
  assert.equal(localDubRate(0), 1)
  assert.equal(localDubRate(2), 1.3)
  assert.equal(localDubRate(9), 1.5)
  assert.equal(localDubRate(NaN), 1)
})

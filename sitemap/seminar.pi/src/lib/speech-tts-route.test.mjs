// /api/speech/tts 순서 회귀 시험(D-2) — 라우트는 next·DB 를 불러 node:test 로 직접 못 돌리므로 소스 순서로 확인한다.
// 지키는 것 : ① 서명 확인 → ② 권한·계량 DB 판정(fn_use_smn_tts) → ③ 캐시 오디오 사용. 예전엔 캐시 적중이면 권한 확인 없이 통과했다(비참가자 + 캐시 적중 → 200).
// node --test src/lib/speech-tts-route.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../app/api/speech/tts/route.ts', import.meta.url), 'utf8')
const body = src.slice(src.indexOf('export const POST'))
const at = (s) => {
  const i = body.indexOf(s)
  assert.ok(i >= 0, `없음 : ${s}`)
  return i
}

test('권한 판정이 캐시 오디오 사용보다 앞(비참가자 + 캐시 적중 → 판정 오류로 끝남)', () => {
  const verify = at('verifyCaption(')
  const rpc = at("rpc('fn_use_smn_tts'")
  const gateErr = at('if (e) return apiError')
  const useAudio = at('await p')
  assert.ok(verify < rpc && rpc < gateErr && gateErr < useAudio)
  // 판정 전엔 캐시 값으로 응답하지 않는다 — 판정 전 구간에 오디오 응답이 없어야 한다
  assert.ok(!body.slice(0, gateErr).includes('new NextResponse('))
})

test('캐시 적중은 0글자(판정만), 미스만 글자 수 차감 · 서명·글자 상한 필수', () => {
  assert.match(body, /p_chr: miss \? body\.text\.length : 0/)
  assert.match(src, /sig: z\.string\(\)/)
  assert.match(src, /max\(TTS_MAX_CHARS\)/)
})

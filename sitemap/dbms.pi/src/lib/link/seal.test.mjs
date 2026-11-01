// seal.ts 단위 시험 — 왕복·AAD(lnk_id) 불일치·키 불일치·변조 거부. 실행 : node --test src/lib/link/seal.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { seal, unseal } from './seal.ts'

const S = 'x'.repeat(40)
const T = 'slk_' + 'a'.repeat(40)

test('왕복', () => {
  const s = seal(T, 'L1', S)
  assert.notEqual(s, seal(T, 'L1', S)) // iv 무작위
  assert.equal(unseal(s, 'L1', S), T)
})

test('다른 lnk_id·다른 키·변조는 거부', () => {
  const s = seal(T, 'L1', S)
  assert.throws(() => unseal(s, 'L2', S))
  assert.throws(() => unseal(s, 'L1', 'y'.repeat(40)))
  const b = Buffer.from(s, 'base64'); b[b.length - 1] ^= 1
  assert.throws(() => unseal(b.toString('base64'), 'L1', S))
})

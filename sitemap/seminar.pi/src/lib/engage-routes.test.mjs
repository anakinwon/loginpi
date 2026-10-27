// 설문·Q&A·출석·동의 쓰기 라우트 순서 시험 — node --test src/lib/engage-routes.test.mjs
//  쓰기(update·insert·rpc)는 반드시 gate()(세미나 존재·유료 참가·OPEN) 뒤에 — 종료 세미나에 출석 시각이 늘던 결함(야간 시험 T04)의 회귀 방지.
//  라우트는 Supabase 를 직접 불러 단위 시험이 어렵다 → 원문에서 각 핸들러의 gate 호출이 첫 쓰기보다 앞인지 본다
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const api = new URL('../app/api/seminars/[id]/', import.meta.url)
const src = (f) => readFileSync(new URL(f, api), 'utf8')
// 'export const NAME' 부터 다음 export 전까지
const handler = (s, name) => {
  const i = s.indexOf(`export const ${name} =`)
  assert.ok(i >= 0, `${name} 없음`)
  const j = s.indexOf('export const ', i + 1)
  return s.slice(i, j < 0 ? undefined : j)
}
const WRITE = /\.(update|insert|upsert)\(|\.rpc\('fn_vote/

for (const [file, names] of [
  ['attendance/route.ts', ['POST']],
  ['polls/route.ts', ['POST', 'PATCH']],
  ['qna/route.ts', ['POST', 'PATCH']],
]) {
  for (const name of names) {
    test(`${file} ${name} — gate·종료 확인이 첫 쓰기보다 앞`, () => {
      const h = handler(src(file), name)
      const g = h.indexOf('gate(')
      const c = h.indexOf('closed()')
      const w = h.search(WRITE)
      assert.ok(w > 0, '쓰기 없음')
      assert.ok(g > 0 && g < w, 'gate 가 쓰기보다 뒤')
      assert.ok(c > 0 && c < w, '종료(closed) 확인이 쓰기보다 뒤')
    })
  }
}

// 동의 POST 는 agreeGate(개최자·ADMIN·활성 참가 + 종료 409) 한 곳 — /api/speech/agree 와 형제(D-3·T04·T10 병합)
test('consent/route.ts POST — agreeGate 가 첫 쓰기보다 앞, agreeGate 안에 종료(closed) 확인', () => {
  const h = handler(src('consent/route.ts'), 'POST')
  const g = h.indexOf('agreeGate(')
  const w = h.search(WRITE)
  assert.ok(w > 0 && g > 0 && g < w, 'agreeGate 가 쓰기보다 뒤')
  const e = readFileSync(new URL('./engage.ts', import.meta.url), 'utf8')
  const ag = e.slice(e.indexOf('export async function agreeGate'))
  assert.ok(ag.includes('closed()'), 'agreeGate 에 종료 확인 없음')
})

test('처리방침 — 출석부의 Pi 사용자명 개최자 제공·보관 기간 고지(ko·en)', () => {
  const msg = (l) => JSON.parse(readFileSync(new URL(`../../messages/${l}.json`, import.meta.url), 'utf8')).privacy.keep
  const [ko, en] = [msg('ko'), msg('en')]
  assert.equal(ko.length, en.length)
  assert.ok(ko.some((s) => s.includes('Pi 사용자명') && s.includes('개최자') && s.includes('세미나를 삭제할 때까지')))
  assert.ok(en.some((s) => s.includes('Pi username') && s.includes('host') && s.includes('until the seminar is deleted')))
})

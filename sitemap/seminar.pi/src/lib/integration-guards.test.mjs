// 통합 회귀 관문(T10) — 소스를 읽어 형제 경로·번역 짝·Pi Browser 철칙이 깨지지 않았는지 본다. 실행 : pnpm --dir sitemap/seminar.pi test
//  ① smn_agr 에 동의 행을 넣는 라우트는 모두 agreeGate(개최자·ADMIN·참가 등록자)를 거친다(D-3)
//  ② /privacy 전역 링크 + ko·en 키 ③ ko·en 번역 키 짝 ④ 일반 fetch('/api/…) 는 허용 목록만(나머지는 piFetch)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = fileURLToPath(new URL('../..', import.meta.url))
const read = (p) => readFileSync(join(APP, p), 'utf8')
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
const rel = (p) => relative(APP, p).split(sep).join('/')
const srcFiles = walk(join(APP, 'src')).filter((p) => /\.(ts|tsx)$/.test(p))

test('① smn_agr 에 넣는 라우트는 모두 agreeGate 를 거친다', () => {
  const writers = srcFiles.filter((p) => {
    const s = readFileSync(p, 'utf8')
    return /from\('smn_agr'\)\s*\.insert|const TABLE = 'smn_agr'[\s\S]*from\(TABLE\)\s*\.insert/.test(s)
  })
  assert.ok(writers.length >= 2, `동의 기록 라우트를 찾지 못함 : ${writers.map(rel)}`)
  for (const p of writers) assert.match(readFileSync(p, 'utf8'), /await agreeGate\(/, `${rel(p)} 에 agreeGate 없음`)
})

test('② 헤더에 /privacy 링크, nav.privacy 가 ko·en 모두 있다', () => {
  assert.match(read('src/components/site-header.tsx'), /href="\/privacy"/)
  for (const l of ['ko', 'en']) {
    const m = JSON.parse(read(`messages/${l}.json`))
    assert.ok(m.nav?.privacy?.trim(), `${l} nav.privacy 비어 있음`)
  }
})

test('③ ko·en 번역 키가 짝이 맞고 빈 값이 없다', () => {
  const keys = (o, pre = '') =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [[`${pre}${k}`, v]]))
  const [ko, en] = ['ko', 'en'].map((l) => new Map(keys(JSON.parse(read(`messages/${l}.json`)))))
  assert.deepEqual([...ko.keys()].filter((k) => !en.has(k)), [], 'en 에 없는 키')
  assert.deepEqual([...en.keys()].filter((k) => !ko.has(k)), [], 'ko 에 없는 키')
  const empty = [...ko, ...en].filter(([, v]) => typeof v === 'string' && v === '').map(([k]) => k)
  assert.deepEqual(empty, [], '빈 값("") 키')
})

test('④ 일반 fetch(\'/api/…) 는 허용 목록만 — 나머지는 piFetch(Pi Browser 는 쿠키가 없다)', () => {
  // 허용 : Pi 토큰 발급(로그인 전이라 토큰 없음)·Google 세션 확인(일반 브라우저 쿠키 경로)
  const ALLOW = new Set(['src/app/[locale]/auth/pi/callback/page.tsx:/api/auth/pi', 'src/components/google-auth.tsx:/api/auth/me'])
  const hits = srcFiles.flatMap((p) =>
    [...readFileSync(p, 'utf8').matchAll(/(?<![\w.])fetch\(\s*[`'"](\/api\/[^`'"$?]*)/g)].map((m) => `${rel(p)}:${m[1]}`),
  )
  assert.deepEqual(hits.filter((h) => !ALLOW.has(h)), [])
})

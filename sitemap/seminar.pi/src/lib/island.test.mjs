// 세미나 이름 = 섬 이름(sql/011, 마스터 2026-10-28) — 정적 시험. node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../sql/011_seminar_isl.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/seminars/route.ts', import.meta.url), 'utf8')

test('섬 100개 — 번호 1~100 빠짐없이, 한글 이름 중복 없음', () => {
  const rows = [...sql.matchAll(/^  \((\d+), '(?:[^']|'')*', '(?:[^']|'')*', '((?:[^']|'')*)'/gm)]
  assert.equal(rows.length, 100)
  assert.deepEqual(rows.map((r) => +r[1]), Array.from({ length: 100 }, (_, i) => i + 1))
  assert.equal(new Set(rows.map((r) => r[2])).size, 100)
})

test('개설 — 이름을 받지 않고 fn_crt_smn 이 고른다, 남은 섬 없으면 409', () => {
  const create = route.slice(route.indexOf('const createSchema'))
  assert.doesNotMatch(create.slice(0, create.indexOf('})')), /title/)
  assert.match(create, /rpc\('fn_crt_smn'/)
  assert.match(create, /apiError\('ISLAND_FULL', 409\)/)
  assert.match(sql, /pg_advisory_xact_lock/) // 동시 개설이 같은 섬을 고르지 않게
  assert.match(sql, /smn_sts_cd IN \('SCHEDULED', 'LIVE'\)/) // 끝나거나 취소되면 다시 쓸 수 있다
})

test('룸 이름 = 섬 이름 - 부제, 부제 없으면 섬 이름만', async () => {
  const { smnTitle } = await import('./seminar-rules.ts')
  assert.equal(smnTitle('발리', '파이 개발 세미나'), '발리 - 파이 개발 세미나')
  assert.equal(smnTitle('발리', ''), '발리')
  assert.equal(smnTitle('발리', '   '), '발리')
  assert.equal(smnTitle('발리', null), '발리')
  const patch = readFileSync(new URL('../app/api/seminars/[id]/route.ts', import.meta.url), 'utf8')
  assert.match(patch, /if \(!isAdmin\(user\)\) q = q\.eq\('hst_usr_id', user\.id\)/) // 개최자·ADMIN 만
})

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

test('룸 이름 신호 — 별명은 한 줄 1~30자, 제목 신호, 나머지는 버린다', async () => {
  const { parseNameSignal } = await import('./seminar-rules.ts')
  assert.deepEqual(parseNameSignal({ what: 'name', name: '  아소카 ' }), { what: 'name', name: '아소카' })
  assert.deepEqual(parseNameSignal({ what: 'title' }), { what: 'title' })
  assert.equal(parseNameSignal({ what: 'name', name: '' }), null)
  assert.equal(parseNameSignal({ what: 'name', name: 'x'.repeat(31) }), null)
  assert.equal(parseNameSignal({ what: 'name', name: 'a\nb' }), null)
  assert.equal(parseNameSignal({ what: 'polls' }), null) // 설문 신호는 engage 몫
  const ticket = readFileSync(new URL('../app/api/media/ticket/route.ts', import.meta.url), 'utf8')
  assert.match(ticket, /name: nickname \|\| user\.display_name/) // 별명이 입장권 표시명
})

test('별명 사칭 막기 — 서식 문자 거절, 정규화 키로 같은 이름 판정', async () => {
  const { nameOk, nameKey, parseNameSignal } = await import('./seminar-rules.ts')
  assert.equal(nameOk('아소카'), true)
  assert.equal(nameOk('ab‮cd'), false) // RLO(방향 바꿈)
  assert.equal(nameOk('ho​st'), false) // 폭 0 공백
  assert.equal(parseNameSignal({ what: 'name', name: 'a⁦b' }), null)
  assert.equal(nameKey('Ａｎａｋｉｎ'), nameKey('anakin')) // 전각 → NFKC
  assert.equal(nameKey('Anakin Won'), nameKey('anakinwon'))
  const route = readFileSync(new URL('../app/api/seminars/[id]/ncknm/route.ts', import.meta.url), 'utf8')
  assert.match(route, /apiError\('NAME_TAKEN', 409\)/)
})

test('별명 문자 체계 — 라틴·키릴 섞기 거절, 한글·라틴·한자는 허용', async () => {
  const { nameOk } = await import('./seminar-rules.ts')
  assert.equal(nameOk('аnakin'), false) // 키릴 а + 라틴
  assert.equal(nameOk('아소카 Ahsoka'), true)
  assert.equal(nameOk('元 아나킨'), true)
  assert.equal(nameOk('Анакин'), true) // 한 체계(키릴)만 — 허용(ponytail 한계)
  const room = readFileSync(new URL('../components/room/use-room.ts', import.meta.url), 'utf8')
  assert.match(room, /nameKey\(p\.name\) === nameKey\(name\)/) // 받는 쪽 사칭 검사(applyName — 신호·채팅 표식 공용)
})

test('구 엔진 예비 통로 — 채팅 표식으로 이름 변경, 일반 채팅은 그대로', async () => {
  const { NAME_MARK, nameFromChat } = await import('./seminar-rules.ts')
  assert.deepEqual(nameFromChat(NAME_MARK + '마스터 아나킨'), { what: 'name', name: '마스터 아나킨' })
  assert.equal(nameFromChat('안녕하세요'), null)
  assert.equal(nameFromChat('smn-name:가짜'), null) // 표식 없이 친 글은 이름 변경 아님
  assert.equal(nameFromChat(NAME_MARK + 'a‮b'), null) // 서식 문자 거절은 같다
  const room = readFileSync(new URL('../components/room/use-room.ts', import.meta.url), 'utf8')
  assert.match(room, /request\('chat\.send', \{ text: NAME_MARK \+ name \}\)/)
  assert.match(room, /name: peersRef\.current\.get\(c\.peerId\)\?\.name \?\? c\.name/) // 채팅에도 바꾼 이름
})

// 사이트 연결 순수 규칙(src/lib/link/rules.ts) — 토큰 형식·해시, EXPLAIN 대상 판정, 호스트 가림, 분당 상한 · 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bearerOf, explainTarget, maskHost, newToken, rateOk, TKN_RE, tokenHash, tokenPfx } from '../src/lib/link/rules.ts'

test('토큰 — slk_ + base64url 43자, 해시 = SHA-256 hex, 접두 8자', () => {
  const t = newToken()
  assert.match(t, TKN_RE)
  assert.notEqual(t, newToken())
  assert.match(tokenHash(t), /^[0-9a-f]{64}$/)
  assert.equal(tokenHash(t), tokenHash(t))
  assert.equal(tokenHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') // SHA-256 표준 시험값
  assert.equal(tokenPfx(t), t.slice(0, 8))
  assert.equal(bearerOf(`Bearer ${t}`), t)
  assert.equal(bearerOf(t), null)
  assert.equal(bearerOf('Bearer spa_' + t.slice(4)), null)
  assert.equal(bearerOf(null), null)
})

test('EXPLAIN 대상 — SELECT/WITH 1문장만', () => {
  assert.equal(explainTarget('SELECT * FROM t WHERE a = 1'), 'SELECT * FROM t WHERE a = 1')
  assert.equal(explainTarget('select 1;'), 'select 1')
  assert.equal(explainTarget('select 1; -- 끝'), 'select 1')
  assert.equal(explainTarget('WITH x AS (SELECT 1) SELECT * FROM x'), 'WITH x AS (SELECT 1) SELECT * FROM x')
  assert.equal(explainTarget("SELECT 'a;b' FROM t"), "SELECT 'a;b' FROM t") // 문자열 안 ; 허용
  assert.equal(explainTarget('SELECT a\n\nFROM t'), 'SELECT a\n\nFROM t') // 빈 줄 있는 서식도 1문장
  assert.equal(explainTarget('(SELECT 1) UNION (SELECT 2)'), '(SELECT 1) UNION (SELECT 2)')
})

test('EXPLAIN 대상 — 거부', () => {
  for (const s of [
    '',
    '   ',
    'SELECT 1; SELECT 2',
    'SELECT 1; DROP TABLE t',
    'DELETE FROM t',
    'UPDATE t SET a = 1',
    'INSERT INTO t VALUES (1)',
    'EXPLAIN ANALYZE SELECT 1',
    'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d',
    'SELECT * INTO t2 FROM t',
    'SELECT * FROM t FOR UPDATE',
    'SELECT pg_terminate_backend(1)',
    'SELECT pg_sleep(10)',
    'SELECT set_config(\'a\', \'b\', false)',
    'SELECT nextval(\'s\')',
    'SET search_path = x',
    'COPY t TO STDOUT',
    'CALL p()',
    'BEGIN',
    'SELECT 1 /* ; */ ; COMMIT',
    'SELECT "pg_terminate_backend"(1)',
    'SELECT 1 a$$$; COMMIT; DROP TABLE t; SELECT 1 b$$$', // 식별자 속 $ 를 달러 인용으로 오인(2026-11-01)
    'SELECT 1 한$a$; COMMIT; SELECT * FROM sys_user; SELECT 1 x$a$', // 비 ASCII 식별자 뒤 $tag$
    "SELECT 1 한E'\\'; COMMIT; DROP TABLE t; SELECT '\\'", // 비 ASCII 식별자 뒤 E' — PG 는 일반 문자열로 해석
    'x'.repeat(20_001),
  ])
    assert.equal(explainTarget(s), null, s.slice(0, 60))
  assert.equal(explainTarget(1 as unknown as string), null)
})

test('호스트 가림', () => {
  assert.equal(maskHost('db.abcdefgh.supabase.co'), 'db.***.supabase.co')
  assert.equal(maskHost('10.1.2.3'), '10.***')
  assert.equal(maskHost('localhost'), 'lo***')
  assert.equal(maskHost(null), null)
})

test('분당 상한 — 60회 후 거부, 1분 뒤 초기화, 토큰별 분리', () => {
  const m = new Map<string, { w: number; n: number }>()
  const t0 = 1_000_000
  for (let i = 0; i < 60; i++) assert.equal(rateOk(m, 'a', t0 + i), true)
  assert.equal(rateOk(m, 'a', t0 + 100), false)
  assert.equal(rateOk(m, 'b', t0 + 100), true)
  assert.equal(rateOk(m, 'a', t0 + 60_000), true)
})

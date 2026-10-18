// SQL 편집기 문장 분리·분류·위험 판정(2026-10-18, DBeaver 동작 참고) · 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitSql, stmtAt, classify, danger } from '../src/lib/modelpi/sql-split.ts'

const txts = (t: string, d: 'PG' | 'ORA' = 'PG') => splitSql(t, d).map((s) => s.txt)
const k = (t: string, d: 'PG' | 'ORA' = 'PG') => classify(splitSql(t, d)[0], d)
const dg = (t: string) => danger(splitSql(t, 'PG')[0])

test('분리 : ; · 빈 줄 · 문자열·주석 안 무시', () => {
  assert.deepEqual(txts('SELECT 1; SELECT 2;'), ['SELECT 1', 'SELECT 2'])
  assert.deepEqual(txts('SELECT *\nFROM t\n\nSELECT 2'), ['SELECT *\nFROM t', 'SELECT 2'])
  assert.deepEqual(txts("SELECT 'a;b', \"x;y\" FROM t -- c;d\n; SELECT 2"), ["SELECT 'a;b', \"x;y\" FROM t -- c;d", 'SELECT 2'])
  assert.deepEqual(txts("SELECT 'it''s;' ; SELECT E'a\\';b'"), ["SELECT 'it''s;'", "SELECT E'a\\';b'"])
  assert.deepEqual(txts('SELECT /* a /* b; */ c; */ 1; SELECT 2'), ['SELECT /* a /* b; */ c; */ 1', 'SELECT 2'])
  assert.deepEqual(txts('-- 주석만\n\nSELECT 1'), ['SELECT 1'])
  assert.deepEqual(txts("SELECT '줄\n\n바꿈'; SELECT 2"), ["SELECT '줄\n\n바꿈'", 'SELECT 2'])
})

test('분리 : PG 달러 인용 함수 본문(빈 줄·; 포함) 한 문장', () => {
  const fn = 'CREATE FUNCTION f() RETURNS int AS $body$\nBEGIN\n  RETURN 1;\n\nEND;\n$body$ LANGUAGE plpgsql'
  assert.deepEqual(txts(`${fn};\nSELECT f()`), [fn, 'SELECT f()'])
  assert.deepEqual(txts('SELECT $$a;b$$; SELECT 2'), ['SELECT $$a;b$$', 'SELECT 2'])
})

test('분리 : Oracle PL/SQL 블록은 / 단독 줄까지, q 인용', () => {
  const blk = 'BEGIN\n  UPDATE t SET a = 1;\n\n  COMMIT;\nEND;'
  assert.deepEqual(txts(`${blk}\n/\nSELECT 1 FROM DUAL;`, 'ORA'), [blk, 'SELECT 1 FROM DUAL'])
  assert.deepEqual(txts("SELECT q'[a;b']' FROM DUAL; SELECT 2 FROM DUAL", 'ORA'), ["SELECT q'[a;b']' FROM DUAL", 'SELECT 2 FROM DUAL'])
  assert.deepEqual(txts('CREATE OR REPLACE PROCEDURE p IS\nBEGIN\n  NULL;\nEND;\n/', 'ORA'), ['CREATE OR REPLACE PROCEDURE p IS\nBEGIN\n  NULL;\nEND;'])
})

test('커서 문장 : 안·사이 빈 곳은 앞 문장·맨 앞은 첫 문장', () => {
  const t = 'SELECT 1;\n\nSELECT 2;'
  const s = splitSql(t, 'PG')
  assert.equal(stmtAt(s, 3)?.txt, 'SELECT 1')
  assert.equal(stmtAt(s, 10)?.txt, 'SELECT 1')
  assert.equal(stmtAt(s, t.length)?.txt, 'SELECT 2')
  assert.equal(stmtAt(splitSql('\n\nSELECT 3', 'PG'), 0)?.txt, 'SELECT 3')
  assert.equal(stmtAt([], 0), null)
})

test('분류 : 조회·쓰기·트랜잭션 제어', () => {
  for (const t of ['SELECT * FROM t', '  (SELECT 1)', 'WITH a AS (SELECT 1) SELECT * FROM a', 'SHOW search_path', 'VALUES (1)', 'TABLE t', 'EXPLAIN SELECT 1', 'EXPLAIN (FORMAT JSON) SELECT 1', "SELECT 'delete from t'", '-- x\nSELECT 1'])
    assert.equal(k(t), 'READ', t)
  for (const t of ['INSERT INTO t VALUES (1)', 'UPDATE t SET a=1 WHERE b=2', 'DELETE FROM t WHERE a=1', 'CREATE TABLE x (a int)', 'DROP TABLE x', 'SELECT * INTO x FROM t', 'SELECT * FROM t FOR UPDATE', 'WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d', 'EXPLAIN ANALYZE DELETE FROM t', 'SELECT pg_terminate_backend(1)', "SELECT set_config('a','b',false)", "SELECT nextval('s')", 'SET search_path TO x', 'CALL p()', 'DO $$BEGIN END$$', 'COPY t TO STDOUT', 'LOCK TABLE t'])
    assert.equal(k(t), 'WRITE', t)
  for (const t of ['BEGIN', 'COMMIT', 'ROLLBACK', 'END', 'START TRANSACTION', 'SAVEPOINT a', 'SET TRANSACTION READ WRITE', 'SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE', 'SET transaction_read_only = off', 'SET default_transaction_read_only TO off', 'abort'])
    assert.equal(k(t), 'TXN', t)
  assert.equal(k('BEGIN\n NULL;\nEND;\n/', 'ORA'), 'WRITE') // Oracle 익명 블록
  assert.equal(k('SELECT 1 FROM DUAL', 'ORA'), 'READ')
  // 보안 검토 2026-10-18 : 따옴표·유니코드 이스케이프 식별자로 부작용 함수 숨기기
  for (const t of ['SELECT "pg_terminate_backend"(1)', "SELECT pg_catalog.\"set_config\"('a','b',false)", 'SELECT U&"pg\\005Fterminate_backend"(1)', 'SELECT pg_terminate_backend /* x */ (1)']) assert.equal(k(t), 'WRITE', t)
  for (const t of ["SELECT query_to_xml('SELECT pg_terminate_backend(1)', true, true, '')", "SELECT * FROM cursor_to_xml('c', 1, true, true, '')"]) assert.equal(k(t), 'WRITE', t)
  for (const t of ["SELECT DBMS_LOCK.SLEEP(1) FROM DUAL", 'SELECT hr.pkg.fn(1) FROM DUAL', 'SELECT "APP"."F"(1) FROM DUAL']) assert.equal(k(t, 'ORA'), 'WRITE', t)
  assert.equal(k('SELECT t.a, NVL(t.b, 0) FROM s.t t', 'ORA'), 'READ') // 칼럼 참조·내장 함수는 조회
  // Oracle 은 주석 중첩 없음 — 첫 */ 뒤는 코드
  assert.deepEqual(txts('SELECT 1 /* a /* b */ FROM DUAL; SELECT 2 FROM DUAL', 'ORA'), ['SELECT 1 /* a /* b */ FROM DUAL', 'SELECT 2 FROM DUAL'])
  assert.equal(k('EXPLAIN PLAN FOR SELECT 1 FROM DUAL', 'ORA'), 'WRITE')
})

test('위험 : WHERE 없는 UPDATE·DELETE, DROP·TRUNCATE·ALTER', () => {
  assert.equal(dg('DELETE FROM t'), 'NO_WHERE')
  assert.equal(dg('UPDATE t SET a = (SELECT b FROM u WHERE u.id = 1)'), 'NO_WHERE') // 하위 질의 WHERE 는 바깥 아님
  assert.equal(dg("UPDATE t SET a = 'where'"), 'NO_WHERE')
  assert.equal(dg('DELETE FROM t WHERE id IN (SELECT 1)'), null)
  assert.equal(dg('UPDATE t SET a = 1 WHERE id = 2'), null)
  assert.equal(dg('DROP TABLE t'), 'DROP')
  assert.equal(dg('TRUNCATE t'), 'TRUNCATE')
  assert.equal(dg('ALTER TABLE t ADD c int'), 'ALTER')
  assert.equal(dg('SELECT 1'), null)
  assert.equal(dg('INSERT INTO t VALUES (1)'), null)
})

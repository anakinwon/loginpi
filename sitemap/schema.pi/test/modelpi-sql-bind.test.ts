// SQL 편집기 바인드 변수 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBinds, bindNames } from '../src/lib/modelpi/sql-bind.ts'

test('바인드 변수 찾기 — 마스터 이미지(DBeaver Bind parameter(s))', () => {
  const sql = 'SELECT *\n  FROM public.std_dic\n WHERE 1=:inparam1\n   AND 2=:inparam2\n  ;'
  assert.deepEqual(bindNames(sql, 'PG'), ['inparam1', 'inparam2'])
  assert.equal(applyBinds(sql, 'PG', { inparam1: '1', inparam2: '2' }), 'SELECT *\n  FROM public.std_dic\n WHERE 1=1\n   AND 2=2\n  ;')
})

test('바인드 변수 아님 — 문자열·주석·따옴표 식별자·형 변환·대입·배열 범위', () => {
  const sql = "SELECT ':a', \":b\", x::text, a[1:2], c[lo:hi] -- :c\n/* :d */ FROM t WHERE v := 1 AND $$ :e $$ = y"
  assert.deepEqual(bindNames(sql, 'PG'), [])
  assert.deepEqual(bindNames("SELECT q'[:a]' FROM t WHERE k = :k", 'ORA'), ['k'])
  assert.deepEqual(bindNames('BEGIN :NEW.a := :old.b + :news; END;', 'ORA'), ['news']) // 트리거 :new·:old 는 제외, 비슷한 이름은 바인드
})

test('같은 이름 여러 번 = 한 번만 묻고 모두 바꿈, 값은 SQL 식 그대로', () => {
  const sql = 'SELECT * FROM t WHERE a = :id OR b = :id AND c = :nm::text'
  assert.deepEqual(bindNames(sql, 'PG'), ['id', 'nm'])
  assert.equal(applyBinds(sql, 'PG', { id: '10', nm: "'홍길동'" }), "SELECT * FROM t WHERE a = 10 OR b = 10 AND c = '홍길동'::text")
  assert.equal(applyBinds(sql, 'PG', { id: 'now()' }), 'SELECT * FROM t WHERE a = now() OR b = now() AND c = :nm::text') // 값 없는 이름 = 그대로
  assert.equal(applyBinds('SELECT :a, :ab', 'PG', { a: '1', ab: '2' }), 'SELECT 1, 2') // 앞부분이 같은 이름
})

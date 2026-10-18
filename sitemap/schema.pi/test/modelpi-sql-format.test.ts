// SQL 편집기 강(river) 정렬 들여쓰기(2026-10-18) · 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commaIndent, contIndent, riverFormat, riverIndent, splitItem } from '../src/lib/modelpi/sql-format.ts'

test('입력 중 줄 정렬 칸 수', () => {
  assert.equal(riverIndent('SELECT a'), 0)
  assert.equal(riverIndent('from t'), 2)
  assert.equal(riverIndent('    WHERE'), 1)
  assert.equal(riverIndent('and x'), 3)
  assert.equal(riverIndent('OR x'), 4)
  assert.equal(riverIndent('group by a'), 1)
  assert.equal(riverIndent('LEFT JOIN u'), 2)
  assert.equal(riverIndent(', b'), 5)
  assert.equal(riverIndent(';'), 2)
  assert.equal(riverIndent('RETURNING *'), 0)
  assert.equal(riverIndent('std_dic'), null)
  assert.equal(riverIndent('fromage'), null)
})

test('Enter 다음 줄', () => {
  assert.equal(contIndent('SELECT std_sts_cd'), 7)
  assert.equal(contIndent('     , COUNT(*)'), 7)
  assert.equal(contIndent(' GROUP BY std_sts_cd'), 10)
  assert.equal(contIndent('        , std_se_cd'), 10)
  assert.equal(contIndent('SELECT'), 7)
  assert.equal(contIndent('       x + 1'), 7)
  assert.equal(contIndent('foo'), 0)
  assert.equal(contIndent('  ;'), 2)
})

test('문장 다시 배치 — 이미지 예시', () => {
  const src = 'select std_sts_cd, count(*) from std_dic where 1=1 and 2=2 group by std_sts_cd order by 1 desc;'
  assert.equal(riverFormat(src, 'PG'), ['SELECT std_sts_cd  AS std_sts_cd', '     , COUNT(*)', '  FROM std_dic', ' WHERE 1=1', '   AND 2=2', ' GROUP BY std_sts_cd', ' ORDER BY 1 DESC', '  ;'].join('\n'))
})

test('문장 다시 배치 — 그대로 둘 곳', () => {
  // 문자열 안 공백·키워드, 함수 인자 괄호, BETWEEN…AND, CASE…END, 조인 — 하위 질의는 펼침(아래 시험)
  const src = "SELECT a,  'x  from  y' AS s, f(b, c), CASE WHEN a = 1 AND b = 2 THEN 1 ELSE 0 END AS k FROM t LEFT OUTER JOIN u ON u.id = t.id AND u.x = 1 WHERE d BETWEEN 1 AND 2 AND e IN (SELECT e FROM v WHERE z = 1)"
  assert.equal(riverFormat(src, 'PG'), [
    "SELECT a             AS a",
    "     , 'x  from  y'  AS s",
    '     , f(b, c)',
    '     , CASE WHEN a = 1 AND b = 2 THEN 1 ELSE 0 END AS k',
    '  FROM t',
    '  LEFT OUTER JOIN u',
    '    ON u.id = t.id',
    '   AND u.x = 1',
    ' WHERE d BETWEEN 1 AND 2',
    '   AND e IN ( SELECT e  AS e',
    '                FROM v',
    '               WHERE z = 1',
    '            )',
  ].join('\n'))
})

test('문장 다시 배치 — UPDATE·DELETE·주석', () => {
  assert.equal(riverFormat('update t set a = 1, b = 2 where c = 3', 'PG'), ['UPDATE t', '   SET a = 1', '     , b = 2', ' WHERE c = 3'].join('\n'))
  assert.equal(riverFormat('delete from t where a = 1', 'PG'), ['DELETE FROM t', ' WHERE a = 1'].join('\n'))
  // 주석 있으면 줄은 그대로, 들여쓰기만
  assert.equal(riverFormat('select a -- 이름\nfrom t\nwhere b = 1', 'PG'), ['select a -- 이름', '  from t', ' where b = 1'].join('\n'))
})

test('쉼표 = 절 내용 열 − 2(마스터 이미지 2)', () => {
  assert.equal(commaIndent(['SELECT std_sts_cd']), 5)
  assert.equal(commaIndent(['SELECT a', '     , b']), 5)
  assert.equal(commaIndent([' GROUP BY std_sts_cd']), 8)
  assert.equal(commaIndent([' ORDER BY std_sts_cd', '        , x']), 8)
  assert.equal(commaIndent([]), 5)
  const src = 'select std_sts_cd, std_se_cd, count(*) from std_dic where 1=1 and 2=2 group by std_sts_cd, std_se_cd order by std_sts_cd, std_se_cd desc;'
  assert.equal(riverFormat(src, 'PG'), ['SELECT std_sts_cd  AS std_sts_cd', '     , std_se_cd   AS std_se_cd', '     , COUNT(*)', '  FROM std_dic', ' WHERE 1=1', '   AND 2=2', ' GROUP BY std_sts_cd', '        , std_se_cd', ' ORDER BY std_sts_cd', '        , std_se_cd DESC', '  ;'].join('\n'))
})

test('SELECT 별칭 — 칼럼 = AS 칼럼명, AS 한 열 맞춤(마스터 이미지 2026-10-18)', () => {
  const src = 'select std_sts_cd, std_se_cd, count(*) cnt from std_dic sd where 1=1 and 2=2 group by std_sts_cd, std_se_cd order by std_sts_cd, std_se_cd desc;'
  assert.equal(riverFormat(src, 'PG'), [
    'SELECT std_sts_cd  AS std_sts_cd',
    '     , std_se_cd   AS std_se_cd',
    '     , COUNT(*)    AS cnt',
    '  FROM std_dic sd',
    ' WHERE 1=1',
    '   AND 2=2',
    ' GROUP BY std_sts_cd',
    '        , std_se_cd',
    ' ORDER BY std_sts_cd',
    '        , std_se_cd DESC',
    '  ;',
  ].join('\n'))
})

test('SELECT 별칭 — 판정 경계', () => {
  const eq = (s: string, expr: string, alias: string | null) => assert.deepEqual(splitItem(s, 'PG'), { expr, alias }, s)
  eq('sd.std_sts_cd', 'sd.std_sts_cd', 'std_sts_cd') // 칼럼 = 칼럼명
  eq('b x', 'b', 'x') // AS 없는 별칭
  eq('a as B', 'a', 'B')
  eq("'p q' AS \"My Col\"", "'p q'", '"My Col"') // 공백 든 따옴표 별칭
  eq("'a as b'", "'a as b'", null) // 문자열 안 AS
  eq('CASE WHEN a = 1 THEN 1 END k', 'CASE WHEN a = 1 THEN 1 END', 'k')
  eq('f(a, b)', 'f(a, b)', null) // 식 = 별칭 안 붙임
  for (const s of ['a + b', 'NULL', '*', 't.*', 'x::text', '1', 'COUNT(*)', 'a INTO v', 'f(a b)']) eq(s, s, null)
  eq('t.date', 't.date', null) // Oracle 예약어 칼럼명 = 별칭 안 붙임
  assert.equal(riverFormat('select top 5 a from t', 'PG'), ['SELECT top 5 a  AS a', '  FROM t'].join('\n'))
  // 여러 칼럼 SELECT … INTO 변수 목록 = 별칭 없이 그대로(팀장 반례), 줄 나눠 입력해도 같음·두 번 정렬 멱등
  const into = ['SELECT a', '     , b INTO v_a', '     , v_b', '  FROM t', ' WHERE id = 1'].join('\n')
  for (const dl of ['PG', 'ORA'] as const) {
    assert.equal(riverFormat('select a, b into v_a, v_b from t where id = 1', dl), into)
    assert.equal(riverFormat(into, dl), into)
  }
  assert.equal(riverFormat('SELECT a\n, b\nINTO x\n, y\nFROM t', 'PG'), ['SELECT a', '     , b INTO x', '     , y', '  FROM t'].join('\n'))
  const img = riverFormat('select std_sts_cd, count(*) cnt from std_dic', 'PG')
  assert.equal(riverFormat(img, 'PG'), img)
  // SELECT … INTO 는 그대로, DISTINCT 뒤 첫 항목도 맞춤
  assert.equal(riverFormat('select a into v from t', 'PG'), ['SELECT a INTO v', '  FROM t'].join('\n'))
  assert.equal(riverFormat('select distinct a, bb from t', 'PG'), ['SELECT DISTINCT a  AS a', '     , bb' + ' '.repeat(10) + 'AS bb', '  FROM t'].join('\n'))
})

test('하위 질의 펼침 — 여는 괄호 + 2 칸 강 정렬, 닫는 괄호 = 여는 괄호 열(마스터 이미지 2026-10-18)', () => {
  const src = "select c.table_name from information_schema.columns c left join (select con.conname as constraint_name, cl.relname as tbl from pg_constraint con join pg_class cl on cl.oid = con.conrelid and cl.relkind = 'r' where con.contype = 'f') f on f.tbl = c.table_name where c.table_schema = 'public';"
  const want = [
    'SELECT c.table_name  AS table_name',
    '  FROM information_schema.columns c',
    '  LEFT JOIN ( SELECT con.conname  AS constraint_name',
    '                   , cl.relname   AS tbl',
    '                FROM pg_constraint con',
    '                JOIN pg_class cl',
    '                  ON cl.oid = con.conrelid',
    "                 AND cl.relkind = 'r'",
    "               WHERE con.contype = 'f'",
    '            ) f',
    '    ON f.tbl = c.table_name',
    " WHERE c.table_schema = 'public'",
    '  ;',
  ].join('\n')
  assert.equal(riverFormat(src, 'PG'), want)
  assert.equal(riverFormat(want, 'PG'), want) // 두 번 정렬 = 같음
  // SELECT 목록 스칼라 하위 질의 = ') AS 별칭', 다른 항목 맞춤에 영향 없음
  assert.equal(riverFormat('select (select max(b) from u where u.a = t.a) mb, a from t', 'PG'), ['SELECT ( SELECT MAX(b)', '           FROM u', '          WHERE u.a = t.a', '       ) AS mb', '     , a  AS a', '  FROM t'].join('\n'))
  // 함수 괄호·문자열 안 SELECT 는 펼치지 않음
  assert.equal(riverFormat("select f(x) from t where s = '(select 1)'", 'PG'), ['SELECT f(x)', '  FROM t', " WHERE s = '(select 1)'"].join('\n'))
})


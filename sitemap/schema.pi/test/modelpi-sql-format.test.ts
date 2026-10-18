// SQL 편집기 강(river) 정렬 들여쓰기(2026-10-18) · 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commaIndent, contIndent, riverFormat, riverIndent } from '../src/lib/modelpi/sql-format.ts'

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
  assert.equal(riverFormat(src, 'PG'), ['SELECT std_sts_cd', '     , COUNT(*)', '  FROM std_dic', ' WHERE 1=1', '   AND 2=2', ' GROUP BY std_sts_cd', ' ORDER BY 1 DESC', '  ;'].join('\n'))
})

test('문장 다시 배치 — 그대로 둘 곳', () => {
  // 문자열 안 공백·키워드, 괄호 안(하위 질의·함수 인자), BETWEEN…AND, CASE…END, 조인
  const src = "SELECT a,  'x  from  y' AS s, f(b, c), CASE WHEN a = 1 AND b = 2 THEN 1 ELSE 0 END AS k FROM t LEFT OUTER JOIN u ON u.id = t.id AND u.x = 1 WHERE d BETWEEN 1 AND 2 AND e IN (SELECT e FROM v WHERE z = 1)"
  assert.equal(riverFormat(src, 'PG'), [
    "SELECT a",
    "     , 'x  from  y' AS s",
    '     , f(b, c)',
    '     , CASE WHEN a = 1 AND b = 2 THEN 1 ELSE 0 END AS k',
    '  FROM t',
    '  LEFT OUTER JOIN u',
    '    ON u.id = t.id',
    '   AND u.x = 1',
    ' WHERE d BETWEEN 1 AND 2',
    '   AND e IN (SELECT e FROM v WHERE z = 1)',
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
  assert.equal(riverFormat(src, 'PG'), ['SELECT std_sts_cd', '     , std_se_cd', '     , COUNT(*)', '  FROM std_dic', ' WHERE 1=1', '   AND 2=2', ' GROUP BY std_sts_cd', '        , std_se_cd', ' ORDER BY std_sts_cd', '        , std_se_cd DESC', '  ;'].join('\n'))
})

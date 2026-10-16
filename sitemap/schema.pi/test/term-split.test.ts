// 용어명 분해·결합·구성 규칙 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitTerm, termNames, termRuleError, type DicWord } from '../src/lib/term-split.ts'

const w = (log: string, phy: string, attr = 'N', forbid = 'N'): DicWord => ({ dic_id: phy, dic_log_nm: log, dic_phy_nm: phy, attr_clss_yn: attr, forbid_yn: forbid })
const DICT = [w('고객', 'CUST'), w('번호', 'NO', 'Y'), w('고객번호', 'CUSTNO', 'Y'), w('수신', 'RCV'), w('자료', 'DATA'), w('수신자', 'RCVR'), w('료', 'FEE', 'Y')]
const ids = (segs: ReturnType<typeof splitTerm>[number]) => segs.map((s) => ('word' in s ? s.word.dic_phy_nm : `?${s.unknown}`)).join('+')

test('긴 단어 우선 후보 정렬', () => {
  const c = splitTerm('고객번호', DICT)
  assert.deepEqual(c.map(ids), ['CUSTNO', 'CUST+NO'])
})

test('여러 분해 후보 모두 제시(매뉴얼 수신자료 예시)', () => {
  const c = splitTerm('수신자료', DICT).map(ids)
  assert.ok(c.includes('RCV+DATA'))
  assert.ok(c.includes('RCVR+FEE'))
})

test('공백 무시', () => {
  assert.equal(ids(splitTerm('고객 번호', DICT)[0]), 'CUSTNO')
})

test('미등록 구간은 1개 후보로 표시', () => {
  const c = splitTerm('고객주소번호', DICT)
  assert.equal(c.length, 1)
  assert.equal(ids(c[0]), 'CUST+?주소+NO')
})

test('용어명 결합 : 구분자 기본 _', () => {
  assert.deepEqual(termNames([DICT[0], DICT[1]], '_'), { term_log_nm: '고객번호', term_phy_nm: 'CUST_NO' })
  assert.equal(termNames([DICT[0], DICT[1]], '').term_phy_nm, 'CUSTNO')
})

test('구성 규칙 : 단일 단어 차단', () => {
  assert.equal(termRuleError([DICT[2]]), 'TERM_SINGLE_WORD')
  assert.equal(termRuleError([]), 'TERM_SINGLE_WORD')
})

test('구성 규칙 : 금칙어·끝 단어 속성 분류어', () => {
  assert.equal(termRuleError([DICT[0], DICT[1]]), null)
  assert.equal(termRuleError([DICT[1], DICT[0]]), 'TERM_LAST_NOT_ATTR')
  assert.equal(termRuleError([w('금지', 'BAN', 'N', 'Y'), DICT[1]]), 'TERM_FORBIDDEN_WORD')
})

test('빈 입력', () => {
  assert.deepEqual(splitTerm('  ', DICT), [])
})

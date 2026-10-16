// 표준단어 자동 채움 규칙 검사(지침서 예시 기준) — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abbrCands, engAbbr, engTitle, pickStd, wikiDesc } from '../src/lib/word-suggest.ts'

test('영문 명 : 하이픈·관사·괄호 정리, 첫 글자 대문자', () => {
  assert.equal(engTitle('Value-added tax'), 'Value Added Tax')
  assert.equal(engTitle('The customer (economics)'), 'Customer')
  assert.equal(engTitle('POSTAL CODE'), 'Postal Code')
})

test('영문 약어 명 : 지침서 예시(문단 384~398) 2자 우선', () => {
  for (const [eng, want] of [['Source', 'SC'], ['Level', 'LV'], ['Order', 'OD'], ['Demand', 'DM'], ['Customer', 'CT'], ['Modification', 'MD'], ['Code', 'CD'], ['Name', 'NM']]) assert.equal(engAbbr(eng), want, eng)
})

test('영문 약어 명 : 중복 시 앞쪽 자음부터 추가한 3자 후보', () => {
  for (const [eng, want] of [['Source', 'SRC'], ['Level', 'LVL'], ['Demand', 'DMN'], ['Agreement', 'AGM'], ['External', 'ETN']]) assert.equal(abbrCands(eng)[1], want, eng)
})

test('영문 약어 명 : 관용·짧은 단어·복합어', () => {
  assert.equal(engAbbr('Number'), 'NO')
  assert.equal(engAbbr('Date'), 'DT')
  assert.equal(engAbbr('Key'), 'KEY')
  assert.equal(engAbbr('Value Added Tax'), 'VAT')
  assert.equal(engAbbr('United States'), 'US')
  assert.equal(engAbbr('Account Number'), 'ACNO')
  assert.equal(engAbbr('Customer Name'), 'CTNM')
  assert.equal(engAbbr('Payment Amount'), 'PMAM')
  assert.equal(engAbbr('Zip Code'), 'ZCD')
  assert.equal(engAbbr('Additional Danger Special Contract'), 'ACT')
  assert.equal(engAbbr(''), '')
  assert.ok(abbrCands('Modification').every((a) => a.length >= 2 && a.length <= 4))
})

test('위키백과 요약 : 첫 문장·한자', () => {
  const r = wikiDesc('우편번호(郵便番號)는 우편물 발송시 주소별 구분을 위한 코드이다. 일정한 기준으로 정한다.')
  assert.equal(r.chn, '郵便番號')
  assert.equal(r.desc, '우편번호는 우편물 발송시 주소별 구분을 위한 코드이다.')
})

test('표준사전 후보 : 가장 많이 쓰인 물리명', () => {
  assert.equal(pickStd([{ dic_phy_nm: 'CT' }, { dic_phy_nm: 'CUST' }, { dic_phy_nm: 'CUST' }])?.dic_phy_nm, 'CUST')
  assert.equal(pickStd([]), null)
})

test('한자 범위에 한글 음절 미포함(괄호 안 한글은 한자 아님)', () => {
  assert.equal(wikiDesc('클라우드 컴퓨팅(서버, 저장소)은 임대 방식이다.').chn, null)
})

test('위키백과 동음이의 안내 문서는 설명에서 제외', () => {
  assert.deepEqual(wikiDesc('클레임은 다음을 가리킨다. 클레임 (상업) 클레임 (법률)'), { desc: '', chn: null })
})

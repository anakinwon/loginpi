// 일괄등록 순수 함수 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domTpByGrp, guessDomGroup, markCrossBatchDup, mapHeader, parseCsv, parseMoisDomName, resultsCsv, splitChn, splitList, toInt } from '../src/lib/bulk.ts'

test('CSV : BOM·따옴표 안 쉼표·줄바꿈·"" 이스케이프·CRLF·빈 줄', () => {
  const rows = parseCsv('﻿a,b\r\n"x,1","줄\n바꿈"\r\n\r\n"따""옴",\n')
  assert.deepEqual(rows, [['a', 'b'], ['x,1', '줄\n바꿈'], ['따"옴', '']])
})

test('헤더 대응 : 이름으로 찾고 필수 헤더 누락 보고', () => {
  const ok = mapHeader('words', ['공통표준단어명', '공통표준단어영문약어명'])
  assert.ok('idx' in ok && ok.idx.log_nm === 0 && ok.idx.phy_nm === 1 && ok.idx.eng_nm === -1)
  assert.deepEqual(mapHeader('terms', ['공통표준용어명']), { missing: ['공통표준용어영문약어명', '공통표준도메인명'] })
})

test('단어 설명 한자 분리', () => {
  assert.deepEqual(splitChn('一回投與量. 한 번에 투여되는 양'), { chn: '一回投與量', desc: '한 번에 투여되는 양' })
  assert.deepEqual(splitChn('API. 운영 체제'), { chn: null, desc: 'API. 운영 체제' })
})

test('행안부 도메인명 분해', () => {
  assert.deepEqual(parseMoisDomName('가격N9,2'), { key: '가격', tp: 'NUMERIC', len: 9, scale: 2 })
  assert.deepEqual(parseMoisDomName('명V100'), { key: '명', tp: 'VARCHAR', len: 100, scale: null })
  assert.deepEqual(parseMoisDomName('연월일시분초D'), { key: '연월일시분초', tp: 'DATETIME', len: null, scale: null })
  assert.equal(parseMoisDomName('번호'), null)
})

test('도메인유형·목록·숫자·결과 CSV', () => {
  assert.deepEqual(['번호', '코드', '금액'].map(domTpByGrp), ['NO', 'CD', 'GNRL'])
  const G = [
    { dom_grp_nm: '금액', dom_grp_desc: '행안부 공통표준도메인 그룹 : 금액·가격·비용·요금' },
    { dom_grp_nm: '번호', dom_grp_desc: '행안부 공통표준도메인 그룹 : 번호·일련번호·등록번호류' },
    { dom_grp_nm: '코드', dom_grp_desc: '행안부 공통표준도메인 그룹 : 코드·여부·유무' },
  ]
  assert.deepEqual(['금액', '가격', '등록번호', '여부', '사업자번호', '내용'].map((k) => guessDomGroup(k, G)?.dom_grp_nm ?? null), ['금액', '금액', '번호', '코드', '번호', null])
  assert.deepEqual(splitList(' 간접생산비, 공통비용,,간접생산비'), ['간접생산비', '공통비용'])
  assert.deepEqual([toInt(''), toInt('15'), toInt('1.5')], [null, 15, NaN])
  assert.equal(resultsCsv([{ row_no: 2, status: 'ERR', name: 'a,b', code: 'X' }]), '﻿행,판정,이름,코드,내용\r\n2,ERR,"a,b",X,')
})

test('묶음 사이 중복 : 앞 정상 행과 이름이 겹치면 오류, 키 없는 행은 그대로', () => {
  const r = markCrossBatchDup([
    { row_no: 2, status: 'OK', name: '보훈', keys: ['보훈'] },
    { row_no: 3, status: 'SKIP', name: '보훈' },
    { row_no: 1002, status: 'OK', name: '보훈', keys: ['보훈'] },
    { row_no: 1003, status: 'NSTD', name: 'x', keys: ['x', 'P:BNO'] },
    { row_no: 1004, status: 'OK', name: 'y', keys: ['y', 'P:BNO'] },
  ])
  assert.deepEqual(r.map((x) => x.status), ['OK', 'SKIP', 'ERR', 'NSTD', 'ERR'])
  assert.equal(r[2].code, 'DUP_IN_FILE')
})

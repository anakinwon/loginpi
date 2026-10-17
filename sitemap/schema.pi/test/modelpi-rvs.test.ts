// 리버스 매핑(PRD_PiErd S4 R2~R4) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDdl } from '../src/lib/modelpi/ddl-parse.ts'
import { catalogSql, csvToRvs, mapCol, relCands, tblWords, type MapTerm, type MapWord } from '../src/lib/modelpi/rvs.ts'

const W = (id: string, log: string, phy: string, sfx: string | null = null): MapWord => ({ dic_id: id, dic_log_nm: log, dic_phy_nm: phy, tbl_sfx_txt: sfx })
const words = [W('w1', '고객', 'CUST'), W('w2', '번호', 'NO'), W('w3', '주문', 'ORDR'), W('w4', '기본', 'BSC', '_M'), W('w5', '명', 'NM'), W('w6', '등급', 'GRD'), W('w7', '코드', 'CD')]
const terms: MapTerm[] = [{ term_id: 't1', term_log_nm: '고객번호', term_phy_nm: 'CUST_NO' }, { term_id: 't2', term_log_nm: '고객명', term_phy_nm: 'CUST_NM' }]

test('용어 역매핑 : 완전일치 → 코멘트 → 단어 분해(신청 후보) → 미매핑', () => {
  assert.deepEqual(mapCol({ name: 'cust_no', comment: null }, terms, words), { map_cd: 'EXACT', term_id: 't1', cand_nm: null })
  assert.deepEqual(mapCol({ name: 'C_NAME', comment: '고객명' }, terms, words), { map_cd: 'CMNT', term_id: 't2', cand_nm: null })
  assert.deepEqual(mapCol({ name: 'CUST_GRD_CD', comment: null }, terms, words), { map_cd: 'SPLIT', term_id: null, cand_nm: '고객등급코드' })
  assert.deepEqual(mapCol({ name: 'XYZ_FLAG', comment: null }, terms, words), { map_cd: 'NONE', term_id: null, cand_nm: null })
  assert.equal(mapCol({ name: 'CUST', comment: null }, terms, words).map_cd, 'NONE') // 단어 1개는 용어 아님
})

test('테이블명 → 엔터티 단어 : 접두·주제영역 약어 건너뜀, 마지막 토큰은 테이블 접미어 허용', () => {
  assert.deepEqual(tblWords('ECM_CST_CUST_M', words)?.map((w) => w.dic_log_nm), ['고객', '기본'])
  assert.deepEqual(tblWords('TB_ORDR', words)?.map((w) => w.dic_log_nm), ['주문'])
  assert.equal(tblWords('TB_CUST_ZZZ', words), null) // 중간 미등록
  assert.equal(tblWords('T_M_CUST', words)?.length, 1) // 앞 M 은 접미어가 아니라 건너뜀
  const w2 = [...words, W('w9', '비용', 'CST')] // 주제영역 약어 CST 가 표준단어와 겹침
  assert.deepEqual(tblWords('ECM_CST_CUST_M', w2, new Set(['ECM', 'CST']))?.map((w) => w.dic_log_nm), ['고객', '기본'])
})

test('카탈로그 CSV → 해석(PK 위치 정렬·NULL·복합 FK 묶음·중복 행), 머리글 누락 오류, 조회 SQL', () => {
  const csv = '﻿TABLE_NAME,TABLE_COMMENT,COLUMN_NAME,COLUMN_ID,DATA_TYPE,DATA_LENGTH,DATA_SCALE,NULLABLE,DATA_DEFAULT,PK_POS,COLUMN_COMMENT,FK_NAME,REF_TABLE,REF_COLUMN\n' +
    'ORD_D,주문상세,SN,2,NUMBER,5,0,N,,2,,,,\n' +
    'ORD_D,주문상세,ORDR_NO,1,VARCHAR2,10,,N,,1,,FK_D,ORD_M,ORDR_NO\n' +
    'ORD_D,주문상세,ORDR_NO,1,VARCHAR2,10,,N,,1,,FK_D2,ORD_X,ORDR_NO\n' +
    'ORD_M,주문,ORDR_NO,1,VARCHAR2,10,,N,,1,주문번호,,,\n' +
    "ORD_M,주문,STS,2,CHAR,1,,Y,'N',,,,,\n"
  const r = csvToRvs(csv)
  assert.ok(!('missing' in r))
  if ('missing' in r) return
  const d = r.tables.find((t) => t.name === 'ORD_D')!
  assert.deepEqual(d.pk, ['ORDR_NO', 'SN'])
  assert.equal(d.cols.length, 2)
  assert.equal(r.tables.find((t) => t.name === 'ORD_M')!.cols[1].dflt, "'N'")
  assert.equal(r.fks.length, 2)
  assert.deepEqual(csvToRvs('A,B\n1,2'), { missing: ['TABLE_NAME', 'COLUMN_NAME', 'DATA_TYPE'] })
  assert.match(catalogSql('0001'), /user_tab_columns/)
  assert.match(catalogSql('0014'), /information_schema\.columns/)
})

test('관계 후보 : 선언 FK(식별·선택성) + 이름 기반(범용 이름 제외)', () => {
  const r = parseDdl(`CREATE TABLE cust (cust_no varchar(10) PRIMARY KEY, nm varchar(50));
    CREATE TABLE ordr (ordr_no varchar(10) PRIMARY KEY, cust_no varchar(10), id int);
    CREATE TABLE ordr_d (ordr_no varchar(10) NOT NULL REFERENCES ordr(ordr_no), sn int, PRIMARY KEY (ordr_no, sn));
    CREATE TABLE gen (id int PRIMARY KEY);`)
  const c = relCands(r)
  assert.deepEqual(c.map((x) => [x.prnt, x.chld, x.src, x.idnt, x.opt]), [['ORDR', 'ORDR_D', 'FK', true, false], ['CUST', 'ORDR', 'NAME', false, true]])
})

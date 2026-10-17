// 논리 → 물리 변환(PRD_PiErd S2 P2~P4) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fkName, phyDiff, phyGate, pkName, toPhysical, type PhyEntIn, type TpMap } from '../src/lib/modelpi/phy.ts'

const dom = (id: string, tp: string, len: number | null, ver = 1, scale: number | null = null) => ({ dom_id: id, ver_no: ver, lgc_tp_cd: tp, data_len: len, data_scale: scale })
const tpPg: TpMap[] = [
  { lgc_tp_cd: '0003', phy_tp_nm: 'VARCHAR', len_use_yn: 'Y' },
  { lgc_tp_cd: '0022', phy_tp_nm: 'TIMESTAMPTZ', len_use_yn: 'N' },
]
const cust: PhyEntIn = {
  ent_id: 'c',
  tbl_phy_nm: 'TB_CST_CUST',
  ent_desc: '고객',
  attrs: [
    { attr_id: 'c2', term_phy_nm: 'CUST_NM', pk_yn: 'N', pk_seq: null, esntl_yn: 'Y', dom: dom('dn', '0003', 100) },
    { attr_id: 'c1', term_phy_nm: 'CUST_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('dno', '0003', 10) },
    { attr_id: 'c3', term_phy_nm: 'JOIN_DTM', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('dt', '0022', 6) },
  ],
}
const ord: PhyEntIn = { ent_id: 'o', tbl_phy_nm: 'TB_ORD_ORDR', attrs: [{ attr_id: 'o1', term_phy_nm: 'ORDR_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('dno', '0003', 10) }] }
const rels = [{ rel_id: 'r1', prnt_ent_id: 'c', chld_ent_id: 'o', crdn_cd: '1N' }]

test('변환 : PK 먼저·NOT NULL·타입 매핑(길이 사용 여부)·시스템 칼럼 맨 끝', () => {
  const { tables, fks, issues } = toPhysical([cust, ord], rels, tpPg, { dbms: '0014', delCol: true })
  const c = tables[0].cols
  assert.deepEqual(c.map((x) => x.col_nm), ['CUST_NO', 'CUST_NM', 'JOIN_DTM', 'REGR_ID', 'REG_DTM', 'MODR_ID', 'MOD_DTM', 'DEL_YN', 'DEL_DTM'])
  assert.deepEqual([c[0].pk_yn, c[0].null_yn, c[0].phy_tp_nm, c[0].data_len], ['Y', 'N', 'VARCHAR', 10])
  assert.equal(c[2].null_yn, 'Y')
  assert.equal(c[2].data_len, null) // TIMESTAMPTZ 는 길이 미사용
  assert.equal(c[3].bsc_val_txt, `'ADMIN'`)
  assert.equal(c.at(-1)!.null_yn, 'Y')
  assert.deepEqual(fks, [{ rel_id: 'r1', fk_nm: 'FK_TB_ORD_ORDR_01' }])
  assert.deepEqual(issues, [])
  const ora = toPhysical([cust], [], [{ lgc_tp_cd: '0003', phy_tp_nm: 'VARCHAR2', len_use_yn: 'Y' }], { dbms: '0001', delCol: false })
  assert.equal(ora.tables[0].cols.at(-1)!.col_nm, 'MOD_DTM')
  assert.ok(ora.issues.some((i) => i.includes('JOIN_DTM') && i.includes('매핑 없음')))
})

test('이름 규칙 : PK·FK 한도(Oracle 30) 안으로 자름', () => {
  const long = 'TB_ABCDEFGHIJKLMNOPQRSTUV' // 25자
  assert.equal(pkName('0001', long), `PK_${long}`)
  assert.equal(pkName('0014', 'TB_X'), 'TB_X_PKEY')
  const f = fkName('0001', long, 3)
  assert.ok(f.length <= 30 && f.endsWith('_03') && f.startsWith('FK_TB_'))
})

test('관문 : N:M·FK 누락·수정 필요·주식별자 누락이면 막음', () => {
  assert.deepEqual(phyGate({ no_pk: 0, fk_missing: 0, issues: 0 }, rels, 2), [])
  assert.equal(phyGate({ no_pk: 1, fk_missing: 2, issues: 3 }, [{ crdn_cd: 'NM' }], 2).length, 4)
  assert.deepEqual(phyGate({ no_pk: 0, fk_missing: 0, issues: 0 }, [], 0), ['엔터티가 없습니다'])
})

test('diff : 추가·삭제·변경, 도메인 버전만 오르고 모양 같으면 영향 아님', () => {
  const opt = { dbms: '0014' as const, delCol: false }
  const prev = toPhysical([cust], [], tpPg, opt).tables
  const verOnly = { ...cust, attrs: cust.attrs.map((a) => (a.attr_id === 'c2' ? { ...a, dom: dom('dn', '0003', 100, 2) } : a)) }
  assert.deepEqual(phyDiff(prev, toPhysical([verOnly], [], tpPg, opt).tables).dom_chg, [])
  const lenUp = { ...cust, attrs: [...cust.attrs.filter((a) => a.attr_id !== 'c3').map((a) => (a.attr_id === 'c2' ? { ...a, dom: dom('dn', '0003', 200, 2) } : a)), { attr_id: 'c4', term_phy_nm: 'EML_ADDR', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('de', '0003', 320) }] }
  const d = phyDiff(prev, toPhysical([lenUp, ord], [], tpPg, opt).tables)
  assert.deepEqual(d.dom_chg, ['TB_CST_CUST.CUST_NM'])
  assert.deepEqual(d.add_col, ['TB_CST_CUST.EML_ADDR'])
  assert.deepEqual(d.del_col, ['TB_CST_CUST.JOIN_DTM'])
  assert.deepEqual(d.add_tbl, ['TB_ORD_ORDR'])
})

test('검증 결함 회귀 : 칼럼명 중복·한도 이슈, PK 순번 재부여, 테이블명 변경 diff', () => {
  const bad: PhyEntIn = {
    ent_id: 'b',
    tbl_phy_nm: 'TB_X',
    attrs: [
      { attr_id: 'b1', term_phy_nm: 'A_NO', pk_yn: 'Y', pk_seq: null, esntl_yn: 'Y', dom: dom('d', '0003', 5) },
      { attr_id: 'b2', term_phy_nm: 'B_NO', pk_yn: 'Y', pk_seq: null, esntl_yn: 'Y', dom: dom('d', '0003', 5) },
      { attr_id: 'b3', term_phy_nm: 'a_no', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('d', '0003', 5) },
      { attr_id: 'b4', term_phy_nm: 'X'.repeat(31), pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('d', '0003', 5) },
    ],
  }
  const r = toPhysical([bad], [], tpPg, { dbms: '0001', delCol: false })
  assert.deepEqual(r.tables[0].cols.filter((c) => c.pk_yn === 'Y').map((c) => c.pk_seq), [1, 2])
  assert.ok(r.issues.some((i) => i.includes('칼럼명 중복')))
  assert.ok(r.issues.some((i) => i.includes('31자 > 한도 30')))
  const opt = { dbms: '0014' as const, delCol: false }
  const prev = toPhysical([cust], [], tpPg, opt).tables
  assert.deepEqual(phyDiff(prev, toPhysical([{ ...cust, tbl_phy_nm: 'TB_CST_CUST_M' }], [], tpPg, opt).tables).chg_tbl, ['TB_CST_CUST → TB_CST_CUST_M'])
})

test('칼럼 그리드 편집 검증 : 기본값 허용 목록·PK NULL·시스템 고정·순서 중복·시스템 맨 끝', async () => {
  const { checkColEdits, bscOk } = await import('../src/lib/modelpi/phy.ts')
  const t = toPhysical([cust], [], tpPg, { dbms: '0014', delCol: false }).tables[0]
  const cols = t.cols.map((c, i) => ({ ...c, phy_col_id: `k${i}` })) // k0 CUST_NO(PK) k1 CUST_NM k2 JOIN_DTM k3~k6 시스템
  for (const ok of ["'N'", '0', '-1.5', 'CURRENT_TIMESTAMP', "'it''s'", null, 'TRUE']) assert.ok(bscOk(ok, '0014'), String(ok))
  assert.ok(bscOk('SYSDATE', '0001') && !bscOk('SYSDATE', '0014') && !bscOk('TRUE', '0013'))
  for (const bad of ["'a'; DROP TABLE x; --", '1; --', 'now()', "'unclosed", 'SELECT 1', "'a' || 'b'"]) assert.ok(!bscOk(bad, '0014'), bad)
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k1', bsc_val_txt: "'홍'", null_yn: 'Y' }], '0014'), null)
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k1', bsc_val_txt: "x'; DROP" }], '0014'), 'PHY_COL_DEFAULT')
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k0', null_yn: 'Y' }], '0014'), 'PHY_COL_PK_NULL')
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k3', col_seq: 1 }], '0014'), 'PHY_COL_SYS')
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k1', col_seq: 3 }], '0014'), 'PHY_COL_SEQ') // JOIN_DTM 과 중복
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k1', col_seq: 3 }, { phy_col_id: 'k2', col_seq: 2 }], '0014'), null) // 맞바꾸기
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k2', col_seq: 99 }], '0014'), 'PHY_COL_SEQ') // 시스템 칼럼 뒤로
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'zz', null_yn: 'N' }], '0014'), 'PHY_COL_INVALID')
  assert.equal(checkColEdits(cols, [{ phy_col_id: 'k1', null_yn: 'N' }, { phy_col_id: 'k1', null_yn: 'Y' }], '0014'), 'PHY_COL_INVALID') // 중복 편집
})

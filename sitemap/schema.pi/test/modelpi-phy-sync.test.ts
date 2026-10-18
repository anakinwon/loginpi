// 물리 diff 동기화·변경분 DDL(PRD_PiErd S5) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPhysical, type PhyEntIn, type TpMap } from '../src/lib/modelpi/phy.ts'
import { alterDdl, planSync, type StoredTbl } from '../src/lib/modelpi/phy-sync.ts'

const dom = (id: string, len: number, ver = 1) => ({ dom_id: id, ver_no: ver, lgc_tp_cd: '0003', data_len: len, data_scale: null })
const tp: TpMap[] = [{ lgc_tp_cd: '0003', phy_tp_nm: 'VARCHAR', len_use_yn: 'Y' }]
const opt = { dbms: '0014' as const }
const cust: PhyEntIn = {
  ent_id: 'c',
  tbl_phy_nm: 'TB_CUST',
  attrs: [
    { attr_id: 'a1', term_phy_nm: 'CUST_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', 10) },
    { attr_id: 'a2', term_phy_nm: 'CUST_NM', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('n', 50) },
    { attr_id: 'a3', term_phy_nm: 'OLD_CD', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('o', 2) },
  ],
}
// 저장된 모델 = 첫 전환 + 사용자 편집(CUST_NM 기본값)
const stored = (): StoredTbl[] =>
  toPhysical([cust], [], tp, opt).tables.map((t, i) => ({ phy_tbl_id: `t${i}`, ent_id: t.ent_id, tbl_nm: t.tbl_nm, tbl_desc: t.tbl_desc, cols: t.cols.map((c, k) => ({ ...c, phy_col_id: `c${k}`, bsc_val_txt: c.col_nm === 'CUST_NM' ? "'X'" : c.bsc_val_txt })) }))

test('변경 없음 = 계획 0', () => {
  assert.deepEqual(planSync(stored(), toPhysical([cust], [], tp, opt).tables), [])
})

test('추가·삭제·길이 변경·이름 변경·주키 변경·도메인 버전만 변경', () => {
  const next = {
    ...cust,
    tbl_phy_nm: 'TB_CUST_M',
    attrs: [
      { ...cust.attrs[0] },
      { ...cust.attrs[1], dom: dom('n', 100, 2) }, // 길이 50 → 100
      { attr_id: 'a4', term_phy_nm: 'GRD_CD', pk_yn: 'Y', pk_seq: 2, esntl_yn: 'Y', dom: dom('g', 2) }, // 새 칼럼 + 주키 추가
    ],
  }
  const ops = planSync(stored(), toPhysical([next], [], tp, opt).tables)
  const kinds = ops.map((o) => o.op)
  assert.ok(kinds.includes('REN_TBL') && kinds.includes('ADD_COL') && kinds.includes('DEL_COL') && kinds.includes('MOD_COL') && kinds.includes('PK'))
  const add = ops.find((o) => o.op === 'ADD_COL')!
  assert.equal(add.op === 'ADD_COL' && add.col.col_seq, 3) // 기존 일반 칼럼 2개(CUST_NO·CUST_NM, OLD_CD 삭제) 뒤
  assert.ok(!ops.some((o) => o.op === 'SEQ')) // OLD_CD 삭제로 빈 자리에 새 칼럼 — 시스템 칼럼 이동 불필요
  assert.match(alterDdl(ops, { dbms: '0014', ltr: 'LOWER', prjNm: 'p', at: 'now' }), /DROP CONSTRAINT tb_cust_pkey;/) // 이름 변경 전 제약명
  const sql = alterDdl(ops, { dbms: '0014', ltr: 'LOWER', prjNm: 'p\n;DROP', at: 'now' })
  assert.match(sql, /^ALTER TABLE tb_cust RENAME TO tb_cust_m;$/m)
  assert.match(sql, /^ALTER TABLE tb_cust_m ADD COLUMN grd_cd VARCHAR\(2\) NOT NULL;$/m)
  assert.match(sql, /^-- ALTER TABLE tb_cust_m DROP COLUMN old_cd;$/m)
  assert.match(sql, /^ALTER TABLE tb_cust_m ALTER COLUMN cust_nm TYPE VARCHAR\(100\);$/m)
  assert.match(sql, /^CREATE UNIQUE INDEX tb_cust_m_pkey ON tb_cust_m \(cust_no, grd_cd\);\nALTER TABLE tb_cust_m ADD CONSTRAINT tb_cust_m_pkey PRIMARY KEY USING INDEX tb_cust_m_pkey;$/m) // PK 인덱스 → PK
  assert.ok(!/^;DROP/m.test(sql))
  const ora = alterDdl(ops, { dbms: '0001', ltr: 'UPPER', prjNm: 'p', at: 'now' })
  assert.match(ora, /ADD \(GRD_CD VARCHAR\(2\) NOT NULL\);/)
  assert.match(ora, /MODIFY \(CUST_NM VARCHAR\(100\)\);/)
  assert.match(ora, /DROP CONSTRAINT PK_TB_CUST DROP INDEX;/) // Oracle 은 따로 만든 PK 인덱스도 지움
})

test('도메인 버전만 올라 모양이 같으면 스냅샷만(DDL 없음), 사용자 기본값 유지', () => {
  const next = { ...cust, attrs: cust.attrs.map((a) => (a.attr_id === 'a2' ? { ...a, dom: dom('n', 50, 7) } : a)) }
  const ops = planSync(stored(), toPhysical([next], [], tp, opt).tables)
  assert.equal(ops.length, 1)
  assert.ok(ops[0].op === 'MOD_COL' && !ops[0].ddl && ops[0].from.bsc_val_txt === "'X'")
  assert.match(alterDdl(ops, { dbms: '0014', ltr: 'LOWER', prjNm: 'p', at: 'now' }), /-- 변경 없음/)
})

test('새 칼럼은 일반 칼럼 끝 — 시스템 칼럼은 모델에 없어 순서 조정 없음', () => {
  const next = { ...cust, attrs: [...cust.attrs, { attr_id: 'a5', term_phy_nm: 'NEW_CD', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('x', 3) }] }
  const ops = planSync(stored(), toPhysical([next], [], tp, opt).tables)
  const add = ops.find((o) => o.op === 'ADD_COL')
  assert.equal(add?.op === 'ADD_COL' && add.col.col_seq, 4)
  assert.deepEqual(ops.filter((o) => o.op === 'SEQ').map((o) => o.op === 'SEQ' && o.col_seq), [])
})

test('테이블 추가·삭제', () => {
  const ord: PhyEntIn = { ent_id: 'o', tbl_phy_nm: 'TB_ORDR', attrs: [{ attr_id: 'o1', term_phy_nm: 'ORDR_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', 10) }] }
  const ops = planSync(stored(), toPhysical([ord], [], tp, opt).tables)
  assert.deepEqual(ops.map((o) => o.op), ['ADD_TBL', 'DEL_TBL'])
  assert.match(alterDdl(ops, { dbms: '0014', ltr: 'LOWER', prjNm: 'p', at: 'now' }), /^-- DROP TABLE tb_cust;$/m)
})

test('검증 결함 회귀 : 칼럼명 맞바꿈은 임시 이름을 거치고, 이름 변경이 칼럼 추가보다 먼저', () => {
  const swapped = {
    ...cust,
    attrs: [
      cust.attrs[0],
      { ...cust.attrs[1], term_phy_nm: 'OLD_CD' }, // a2 : CUST_NM → OLD_CD
      { ...cust.attrs[2], term_phy_nm: 'CUST_NM' }, // a3 : OLD_CD → CUST_NM
      { attr_id: 'a9', term_phy_nm: 'NEW_CD', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('x', 3) },
    ],
  }
  const sql = alterDdl(planSync(stored(), toPhysical([swapped], [], tp, opt).tables), { dbms: '0014', ltr: 'LOWER', prjNm: 'p', at: 'now' })
  const lines = sql.split('\n').filter((l) => l.startsWith('ALTER'))
  assert.deepEqual(lines.slice(0, 4), [
    'ALTER TABLE tb_cust RENAME COLUMN cust_nm TO tmp_ren_1;',
    'ALTER TABLE tb_cust RENAME COLUMN old_cd TO tmp_ren_2;',
    'ALTER TABLE tb_cust RENAME COLUMN tmp_ren_1 TO old_cd;',
    'ALTER TABLE tb_cust RENAME COLUMN tmp_ren_2 TO cust_nm;',
  ])
  assert.ok(lines.findIndex((l) => l.includes('ADD COLUMN new_cd')) > 3)
})

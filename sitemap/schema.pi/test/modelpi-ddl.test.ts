// DDL 생성(PRD_PiErd S2 P6) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fkPairs, genDdl, phyDocTables, type DdlIn, type DdlTbl } from '../src/lib/modelpi/ddl.ts'
import { toPhysical, type TpMap } from '../src/lib/modelpi/phy.ts'

const dom = (id: string, len: number) => ({ dom_id: id, ver_no: 1, lgc_tp_cd: '0003', data_len: len, data_scale: null })
const tp: TpMap[] = [{ lgc_tp_cd: '0003', phy_tp_nm: 'VARCHAR', len_use_yn: 'Y' }]
const ents = [
  { ent_id: 'c', tbl_phy_nm: 'TB_CST_CUST', ent_desc: "고객's 기본", attrs: [{ attr_id: 'c1', term_phy_nm: 'CUST_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', 10) }] },
  {
    ent_id: 'r',
    tbl_phy_nm: 'TB_CST_RMT',
    attrs: [
      { attr_id: 'r1', term_phy_nm: 'RMT_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', 10) },
      { attr_id: 'r2', term_phy_nm: 'SNDR_CUST_NO', pk_yn: 'N', pk_seq: null, esntl_yn: 'Y', dom: dom('d', 10) },
      { attr_id: 'r3', term_phy_nm: 'RCVR_CUST_NO', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('d', 10) },
    ],
  },
]
const rels = [
  { rel_id: 'x1', prnt_ent_id: 'c', chld_ent_id: 'r', crdn_cd: '1N' },
  { rel_id: 'x2', prnt_ent_id: 'c', chld_ent_id: 'r', crdn_cd: '1N' },
]
const build = (dbms: '0014' | '0001', ltr: 'UPPER' | 'LOWER'): DdlIn => {
  const p = toPhysical(ents, rels, tp, { dbms, delCol: dbms === '0014' })
  return {
    dbms,
    ltr,
    tables: p.tables as DdlTbl[],
    fks: p.fks.map((f) => ({ ...f, prnt_ent_id: 'c', chld_ent_id: 'r' })),
    src: new Map([['r2', 'c1'], ['r3', 'c1']]),
    fkOf: new Map([['r2', 'x1'], ['r3', 'x2']]),
  }
}

test('역할명 FK 칼럼 쌍 : 원천 속성 → 부모 PK 칼럼', () => {
  const d = build('0014', 'LOWER')
  const by = new Map(d.tables.map((t) => [t.ent_id, t]))
  assert.deepEqual(fkPairs(d.fks[0], by, d), [['SNDR_CUST_NO', 'CUST_NO']])
  assert.deepEqual(fkPairs(d.fks[1], by, d), [['RCVR_CUST_NO', 'CUST_NO']])
})

test('PostgreSQL DDL : 소문자·PK 제약·기본값·NOT NULL·코멘트 이스케이프·FK ALTER', () => {
  const s = genDdl(build('0014', 'LOWER'), { prjNm: 'p', at: 'now' })
  assert.match(s, /CREATE TABLE tb_cst_cust \(/)
  assert.match(s, /cust_no\s+VARCHAR\(10\) NOT NULL/)
  assert.match(s, /reg_dtm\s+TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL/)
  assert.match(s, /CONSTRAINT tb_cst_cust_pkey PRIMARY KEY \(cust_no\)/)
  assert.ok(s.includes("COMMENT ON TABLE tb_cst_cust IS '고객''s 기본';"))
  assert.match(s, /^ALTER TABLE tb_cst_rmt ADD CONSTRAINT fk_tb_cst_rmt_02 FOREIGN KEY \(rcvr_cust_no\) REFERENCES tb_cst_cust \(cust_no\);$/m)
})

test('Oracle DDL : 대문자·VARCHAR2 아님(매핑 그대로)·PK_ 이름·FK 는 주석(STD-08)', () => {
  const s = genDdl(build('0001', 'UPPER'), { prjNm: 'p', at: 'now' })
  assert.match(s, /CONSTRAINT PK_TB_CST_CUST PRIMARY KEY \(CUST_NO\)/)
  assert.match(s, /REG_DTM\s+TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL/)
  assert.ok(!/^ALTER TABLE/m.test(s))
  assert.match(s, /^-- \(관계, 물리 FK 미생성 STD-08\) ALTER TABLE TB_CST_RMT/m)
})

test('물리 정의서 2종 : 테이블(주키)·칼럼(타입·시스템 여부)', () => {
  const t = phyDocTables(build('0014', 'LOWER').tables)
  assert.deepEqual(t.tbl.rows[0], ['TB_CST_CUST', "고객's 기본", 7, 'CUST_NO'])
  assert.deepEqual(t.col.rows[0].slice(0, 9), ['TB_CST_CUST', 1, 'CUST_NO', '', 'VARCHAR(10)', 'N', '', 1, 'N'])
})

test('검증 결함 회귀 : 예약어 이름 이슈, FK 칼럼 쌍 수 불일치 경고', () => {
  const r = toPhysical([{ ent_id: 'u', tbl_phy_nm: 'USER', attrs: [{ attr_id: 'u1', term_phy_nm: 'ORDER', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', 5) }] }], [], tp, { dbms: '0014', delCol: false })
  assert.equal(r.issues.filter((i) => i.includes('예약어')).length, 2)
  const d = build('0014', 'LOWER')
  d.src.set('r2', 'zz') // 원천이 부모 PK 에 없음
  d.fkOf.set('r3', 'x1') // x1 에 FK 칼럼 2개 → 1개만 짝
  assert.match(genDdl(d, { prjNm: 'p', at: 'now' }), /⚠ FK_TB_CST_RMT_01 : FK 칼럼 2개 중 1개만/)
})

test('보안 : 프로젝트명 줄바꿈으로 주석 탈출 불가, 예약어 이름은 내려받기 시 경고', () => {
  const s = genDdl(build('0014', 'LOWER'), { prjNm: `p\nDROP TABLE x; --\r${String.fromCharCode(0x2028)}y`, at: 'now' })
  assert.ok(!/^DROP TABLE/m.test(s))
  assert.ok(s.startsWith('-- p DROP TABLE x; -'))
  const d = build('0014', 'LOWER')
  d.tables[0] = { ...d.tables[0], tbl_nm: 'USER' }
  assert.match(genDdl(d, { prjNm: 'p', at: 'now' }), /^-- ⚠ 예약어 이름 USER/m)
})

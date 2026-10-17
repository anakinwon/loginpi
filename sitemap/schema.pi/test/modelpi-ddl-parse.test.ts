// DDL 리버스 파서(PRD_PiErd S4 R1) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parseDdl, splitStatements } from '../src/lib/modelpi/ddl-parse.ts'
import { genDdl, type DdlTbl } from '../src/lib/modelpi/ddl.ts'
import { toPhysical, type TpMap } from '../src/lib/modelpi/phy.ts'

const dom = (id: string, tp: string, len: number | null, scale: number | null = null) => ({ dom_id: id, ver_no: 1, lgc_tp_cd: tp, data_len: len, data_scale: scale })
const ents = [
  { ent_id: 'c', tbl_phy_nm: 'TB_CST_CUST', ent_desc: "고객's 기본", attrs: [
    { attr_id: 'c1', term_phy_nm: 'CUST_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', '0003', 10) },
    { attr_id: 'c2', term_phy_nm: 'GRD_AMT', pk_yn: 'N', pk_seq: null, esntl_yn: 'N', dom: dom('a', '0015', 15, 2) },
  ] },
  { ent_id: 'o', tbl_phy_nm: 'TB_ORD_ORDR', attrs: [
    { attr_id: 'o1', term_phy_nm: 'ORDR_NO', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', '0003', 10) },
    { attr_id: 'o2', term_phy_nm: 'ORDR_SN', pk_yn: 'Y', pk_seq: 2, esntl_yn: 'Y', dom: dom('s', '0015', 5) },
    { attr_id: 'o3', term_phy_nm: 'CUST_NO', pk_yn: 'N', pk_seq: null, esntl_yn: 'Y', dom: dom('d', '0003', 10) },
  ] },
]
const rels = [{ rel_id: 'r1', prnt_ent_id: 'c', chld_ent_id: 'o', crdn_cd: '1N' }]
const gen = (dbms: '0014' | '0001', tp: TpMap[]) => {
  const p = toPhysical(ents, rels, tp, { dbms, delCol: true })
  return { p, sql: genDdl({ dbms, ltr: 'LOWER', tables: p.tables as DdlTbl[], fks: p.fks.map((f) => ({ ...f, prnt_ent_id: 'c', chld_ent_id: 'o' })), src: new Map([['o3', 'c1']]), fkOf: new Map([['o3', 'r1']]) }, { prjNm: "p'\n--x", at: 'now' }) }
}

test('왕복 : genDdl(PostgreSQL) → parseDdl = 테이블·칼럼·타입·길이·NULL·기본값·PK·FK·코멘트 차이 0', () => {
  const { p, sql } = gen('0014', [{ lgc_tp_cd: '0003', phy_tp_nm: 'character varying', len_use_yn: 'Y' }, { lgc_tp_cd: '0015', phy_tp_nm: 'NUMERIC', len_use_yn: 'Y' }])
  const r = parseDdl(sql)
  assert.deepEqual(r.warnings, [])
  assert.equal(r.tables.length, p.tables.length)
  for (const t of p.tables) {
    const g = r.tables.find((x) => x.name === t.tbl_nm)!
    assert.ok(g, t.tbl_nm)
    assert.equal(g.comment, t.tbl_desc)
    assert.deepEqual(g.pk, t.cols.filter((c) => c.pk_yn === 'Y').map((c) => c.col_nm))
    assert.deepEqual(
      g.cols.map((c) => [c.name, c.type, c.len, c.scale, c.nullable, c.dflt]),
      t.cols.map((c) => [c.col_nm, c.phy_tp_nm.toUpperCase(), c.data_len, c.data_scale, c.null_yn === 'Y', c.bsc_val_txt]),
    )
  }
  assert.deepEqual(r.fks, [{ name: 'FK_TB_ORD_ORDR_01', table: 'TB_ORD_ORDR', cols: ['CUST_NO'], ref_table: 'TB_CST_CUST', ref_cols: ['CUST_NO'] }])
})

test('Oracle DDL : 주석 처리된 FK 는 관계로 읽지 않음(STD-08), VARCHAR2·SYSTIMESTAMP', () => {
  const { sql } = gen('0001', [{ lgc_tp_cd: '0003', phy_tp_nm: 'VARCHAR2', len_use_yn: 'Y' }, { lgc_tp_cd: '0015', phy_tp_nm: 'NUMBER', len_use_yn: 'Y' }])
  const r = parseDdl(sql)
  assert.equal(r.fks.length, 0)
  const c = r.tables.find((t) => t.name === 'TB_CST_CUST')!.cols
  assert.deepEqual([c[0].type, c[0].len, c[1].type, c[1].len, c[1].scale], ['VARCHAR2', 10, 'NUMBER', 15, 2])
  assert.equal(c.find((x) => x.name === 'REG_DTM')!.dflt, 'SYSTIMESTAMP')
})

test('이 저장소 sql/*.sql 전체 : 예외 없이 해석, mdl_attr 칼럼·PK·FK, 함수 $$ 본문 안 ; 무시', () => {
  const dir = new URL('../sql/', import.meta.url)
  const all = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n;\n')
  const r = parseDdl(all)
  const a = r.tables.find((t) => t.name === 'MDL_ATTR')!
  assert.deepEqual(a.pk, ['ATTR_ID'])
  assert.deepEqual(a.cols.slice(0, 3).map((c) => [c.name, c.type, c.nullable]), [['ATTR_ID', 'UUID', false], ['AREA_ID', 'UUID', false], ['PRJ_ID', 'UUID', false]])
  assert.equal(a.cols.find((c) => c.name === 'ESNTL_YN')!.dflt, "'N'")
  assert.ok(r.fks.some((f) => f.table === 'MDL_ATTR' && f.ref_table === 'MDL_ENT' && f.cols[0] === 'ENT_ID' && f.ref_cols[0] === 'ENT_ID'))
  assert.ok(r.tables.length >= 20)
  assert.deepEqual(r.warnings, [])
})

test('경계 : 따옴표 식별자·스키마 접두·인라인 PK/REFERENCES·주석·문자열 안 ;', () => {
  const r = parseDdl(`-- 머리 ; 주석
    CREATE TABLE app."Order Line" ( id BIGINT PRIMARY KEY, ord_id bigint NOT NULL REFERENCES app.orders(id), memo varchar(20) DEFAULT 'a;b', amt numeric(10, 2), CHECK (amt > 0), UNIQUE (memo) );
    /* 블록 ; */ COMMENT ON COLUMN app."Order Line".memo IS '메모''s';
    GRANT SELECT ON x TO y;`)
  const t = r.tables[0]
  assert.equal(t.name, 'Order Line')
  assert.deepEqual(t.pk, ['ID'])
  assert.deepEqual(t.cols.map((c) => [c.name, c.type, c.len, c.scale, c.nullable, c.dflt]), [['ID', 'BIGINT', null, null, false, null], ['ORD_ID', 'BIGINT', null, null, false, null], ['MEMO', 'VARCHAR', 20, null, true, "'a;b'"], ['AMT', 'NUMERIC', 10, 2, true, null]])
  assert.equal(t.cols[2].comment, "메모's")
  assert.deepEqual(r.fks, [{ name: null, table: 'Order Line', cols: ['ORD_ID'], ref_table: 'ORDERS', ref_cols: ['ID'] }])
  assert.equal(r.skipped, 1)
  assert.equal(splitStatements("SELECT 'x;y'; SELECT $f$ a; b $f$;").length, 2)
})

test('검증 결함 회귀 : 중복 칼럼 경고, NUMBER(*,0), KEY·INDEX·CHECK 이름 칼럼', () => {
  const r = parseDdl('CREATE TABLE w (a int, a int, key varchar(5), "INDEX" int, check_yn char(1), n number(*,0), CHECK (a > 0));')
  const t = r.tables[0]
  assert.deepEqual(t.cols.map((c) => [c.name, c.type, c.len]), [['A', 'INT', null], ['KEY', 'VARCHAR', 5], ['INDEX', 'INT', null], ['CHECK_YN', 'CHAR', 1], ['N', 'NUMBER', null]])
  assert.ok(r.warnings.some((w) => w.includes('중복 칼럼')))
})

test('보안 회귀 : 한 테이블 칼럼 6만 개 — 선형 시간·상한에서 중단·경고', () => {
  const cols = Array.from({ length: 60_000 }, (_, i) => `c${i} int`).join(', ')
  const t0 = performance.now()
  const r = parseDdl(`CREATE TABLE big (${cols});`)
  assert.ok(performance.now() - t0 < 3000)
  assert.ok(r.tables[0].cols.length <= 50_001)
  assert.ok(r.warnings.some((w) => w.includes('중단')))
})

test('보안 회귀 : 주키 칼럼 5만 개 — 주키 판정도 선형 시간', () => {
  const n = 50_000
  const cols = Array.from({ length: n }, (_, i) => `c${i} int`).join(', ')
  const pk = Array.from({ length: n }, (_, i) => `c${i}`).join(', ')
  const t0 = performance.now()
  const r = parseDdl(`CREATE TABLE big (${cols}, PRIMARY KEY (${pk}));`)
  assert.ok(performance.now() - t0 < 3000)
  assert.equal(r.tables[0].cols.filter((c) => !c.nullable).length, n)
})

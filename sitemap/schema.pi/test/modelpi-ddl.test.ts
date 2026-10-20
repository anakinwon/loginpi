// DDL 생성(PRD_PiErd S2 P6) 검사 — 실행 : pnpm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoIncCol, fkPairs, genDdl, phyDocTables, type DdlIn, type DdlTbl } from '../src/lib/modelpi/ddl.ts'
import { idxName, toPhysical, type TpMap } from '../src/lib/modelpi/phy.ts'

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
  const p = toPhysical(ents, rels, tp, { dbms })
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

test('PostgreSQL DDL : 소문자·PK 인덱스 → PK·기본값·NOT NULL·코멘트 이스케이프·FK 없음', () => {
  const s = genDdl(build('0014', 'LOWER'), { prjNm: 'p', at: 'now' })
  assert.match(s, /^DROP TABLE IF EXISTS tb_cst_cust CASCADE;\nCREATE TABLE tb_cst_cust \(/m) // CREATE 직전 DROP … CASCADE(2026-10-20)
  assert.match(s, /cust_no\s+VARCHAR\(10\) NOT NULL/)
  assert.match(s, /lst_mddtm\s+TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,\n\s+lst_mdfr_id\s+VARCHAR\(50\) DEFAULT 'ADMIN' NOT NULL,\n\s+lst_rgdtm\s+TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,\n\s+lst_rgtr_id\s+VARCHAR\(50\) DEFAULT 'ADMIN' NOT NULL\n\);/) // 시스템 칼럼 4개 = 맨 끝
  assert.ok(s.includes("COMMENT ON COLUMN tb_cst_cust.lst_mdfr_id IS '최종수정자ID';"))
  assert.ok(!/del_yn|regr_id/.test(s)) // 삭제여부·구 시스템 칼럼 없음
  // PK : 유일 인덱스 먼저 → 그 인덱스로 PK 제약(마스터 지시 2026-10-18), CREATE TABLE 안에는 PK 제약 없음
  assert.match(s, /^CREATE UNIQUE INDEX tb_cst_cust_pkey ON tb_cst_cust \(cust_no\);\nALTER TABLE tb_cst_cust ADD CONSTRAINT tb_cst_cust_pkey PRIMARY KEY USING INDEX tb_cst_cust_pkey;$/m)
  assert.ok(!/^\s+CONSTRAINT/m.test(s))
  assert.ok(s.includes("COMMENT ON TABLE tb_cst_cust IS '고객''s 기본';"))
  assert.ok(!/FOREIGN KEY|REFERENCES/.test(s)) // FK 미생성(마스터 지시 2026-10-18)
})

test('Oracle DDL : 대문자·VARCHAR2 아님(매핑 그대로)·PK_ 인덱스 → PK USING INDEX·FK 없음', () => {
  const s = genDdl(build('0001', 'UPPER'), { prjNm: 'p', at: 'now' })
  assert.match(s, /^DROP TABLE TB_CST_CUST CASCADE CONSTRAINTS;\nCREATE TABLE TB_CST_CUST \(/m)
  assert.match(s, /^CREATE UNIQUE INDEX PK_TB_CST_CUST ON TB_CST_CUST \(CUST_NO\);\nALTER TABLE TB_CST_CUST ADD CONSTRAINT PK_TB_CST_CUST PRIMARY KEY \(CUST_NO\) USING INDEX PK_TB_CST_CUST;$/m)
  assert.match(s, /LST_MDDTM\s+TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,\n\s+LST_MDFR_ID\s+VARCHAR2\(50\) DEFAULT 'ADMIN' NOT NULL,\n\s+LST_RGDTM\s+TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,\n\s+LST_RGTR_ID\s+VARCHAR2\(50\) DEFAULT 'ADMIN' NOT NULL\n\);/)
  assert.ok(!/FOREIGN KEY|REFERENCES/.test(s))
  // 인덱스가 PK 보다 먼저
  assert.ok(s.indexOf('CREATE UNIQUE INDEX PK_TB_CST_RMT') < s.indexOf('ADD CONSTRAINT PK_TB_CST_RMT'))
})

test('물리 정의서 2종 : 테이블(주키)·칼럼(타입·시스템 여부)', () => {
  const t = phyDocTables(build('0014', 'LOWER').tables)
  assert.deepEqual(t.tbl.rows[0], ['TB_CST_CUST', "고객's 기본", 1, 'CUST_NO']) // 정의서에는 시스템 칼럼 없음
  assert.deepEqual(t.col.rows[0].slice(0, 9), ['TB_CST_CUST', 1, 'CUST_NO', '', 'VARCHAR(10)', 'N', '', 1, 'N'])
})

test('검증 결함 회귀 : 예약어 이름 이슈, FK 칼럼 쌍은 짝지은 것만(DDL 에는 FK 없음)', () => {
  const r = toPhysical([{ ent_id: 'u', tbl_phy_nm: 'USER', attrs: [{ attr_id: 'u1', term_phy_nm: 'ORDER', pk_yn: 'Y', pk_seq: 1, esntl_yn: 'Y', dom: dom('d', 5) }] }], [], tp, { dbms: '0014' })
  assert.equal(r.issues.filter((i) => i.includes('예약어')).length, 2)
  const d = build('0014', 'LOWER')
  d.src.set('r2', 'zz') // 원천이 부모 PK 에 없음
  d.fkOf.set('r3', 'x1') // x1 에 FK 칼럼 2개 → 1개만 짝
  assert.equal(fkPairs(d.fks[0], new Map(d.tables.map((t) => [t.ent_id, t])), d).length, 1)
  assert.ok(!/FOREIGN KEY/.test(genDdl(d, { prjNm: 'p', at: 'now' })))
})

test('보안 : 프로젝트명 줄바꿈으로 주석 탈출 불가, 예약어 이름은 내려받기 시 경고', () => {
  const s = genDdl(build('0014', 'LOWER'), { prjNm: `p\nDROP TABLE x; --\r${String.fromCharCode(0x2028)}y`, at: 'now' })
  assert.ok(!/^DROP TABLE x;/m.test(s))
  assert.ok(s.startsWith('-- p DROP TABLE x; -'))
  const d = build('0014', 'LOWER')
  d.tables[0] = { ...d.tables[0], tbl_nm: 'USER' }
  assert.match(genDdl(d, { prjNm: 'p', at: 'now' }), /^-- ⚠ 예약어 이름 USER/m)
})

test('자동 증가(테이블별 옵션 auto_inc_yn) : 단일 정수 PK 만 — PostgreSQL BIGINT·INTEGER IDENTITY, Oracle NUMBER IDENTITY, Tibero 시퀀스', () => {
  const col = (o: Partial<DdlTbl['cols'][number]>) => ({ attr_id: 'a', sys_col_yn: 'N' as const, col_nm: 'ORD_NO', col_seq: 1, dom_id: null, dom_ver_no: null, phy_tp_nm: 'NUMBER', data_len: 12, data_scale: null, null_yn: 'N' as const, bsc_val_txt: null, pk_yn: 'Y' as const, pk_seq: 1, ...o })
  const t = (cols: DdlTbl['cols'], ai: 'Y' | 'N' = 'Y'): DdlTbl => ({ ent_id: 'e', tbl_nm: 'TB_ORD', tbl_desc: null, auto_inc_yn: ai, cols })
  // 대상 판정
  assert.equal(autoIncCol(t([col({})]))?.col_nm, 'ORD_NO')
  assert.equal(autoIncCol(t([col({}), col({ col_nm: 'SEQ', pk_seq: 2 })])), null) // 복합 PK
  assert.equal(autoIncCol(t([col({ phy_tp_nm: 'VARCHAR2' })])), null) // 문자형
  assert.equal(autoIncCol(t([col({ data_scale: 2 })])), null) // 소수점
  assert.equal(autoIncCol(t([col({ attr_id: 'f' })]), new Map([['f', 'rel1']])), null) // 관계 상속 PK
  const d = (dbms: '0014' | '0001' | '0013', cols: DdlTbl['cols'], ai: 'Y' | 'N' = 'Y'): DdlIn => ({ dbms, ltr: 'UPPER', tables: [t(cols, ai)], fks: [], src: new Map(), fkOf: new Map() })
  const h = { prjNm: 'P', at: '2026-10-18' }
  assert.match(genDdl(d('0014', [col({ phy_tp_nm: 'NUMERIC', data_len: 20 })]), h), /ord_no\s+BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL/) // PostgreSQL = 소문자
  assert.match(genDdl(d('0014', [col({ phy_tp_nm: 'NUMERIC', data_len: 9 })]), h), /ord_no\s+INTEGER GENERATED BY DEFAULT AS IDENTITY/)
  assert.match(genDdl(d('0001', [col({})]), h), /ORD_NO\s+NUMBER\(12\) GENERATED BY DEFAULT AS IDENTITY NOT NULL/)
  const tb = genDdl(d('0013', [col({})]), h)
  assert.match(tb, /CREATE SEQUENCE SQ_TB_ORD START WITH 1 INCREMENT BY 1 NOCACHE;/)
  assert.doesNotMatch(tb, /AS IDENTITY/)
  // 테이블 옵션 N 이면 그대로, Y 여도 대상 아니면(복합 PK) 무시
  assert.doesNotMatch(genDdl(d('0001', [col({})], 'N'), h), /IDENTITY|SEQUENCE/)
  assert.doesNotMatch(genDdl(d('0001', [col({}), col({ col_nm: 'SEQ', pk_seq: 2 })]), h), /AS IDENTITY/)
})

test('선택 테이블만(only) : 선택한 테이블의 CREATE·PK 인덱스·PK 만, 전체 선택이면 전체와 같음', () => {
  const d = build('0014', 'LOWER')
  const r = genDdl(d, { prjNm: 'p', at: 'now' }, { only: new Set(['r']) })
  assert.ok(r.includes('CREATE TABLE tb_cst_rmt (') && !r.includes('CREATE TABLE tb_cst_cust ('))
  assert.ok(r.includes('CREATE UNIQUE INDEX tb_cst_rmt_pkey') && !r.includes('tb_cst_cust_pkey'))
  assert.ok(!/FOREIGN KEY/.test(r))
  const both = genDdl(d, { prjNm: 'p', at: 'now' }, { only: new Set(['c', 'r']) })
  assert.equal(both, genDdl(d, { prjNm: 'p', at: 'now' }))
})

test('PostgreSQL DDL 은 물리 모델이 대문자여도 무조건 소문자(테이블·칼럼·PK·인덱스), 다른 DBMS 는 모델 선택 그대로', () => {
  const s = genDdl(build('0014', 'UPPER'), { prjNm: 'P', at: 'now' })
  const objs = s.split('\n').filter((l) => !l.startsWith('--')).join('\n').replace(/'(?:[^']|'')*'/g, "''")
  assert.ok(objs.includes('CREATE TABLE tb_cst_cust (') && objs.includes('cust_no') && objs.includes('CREATE UNIQUE INDEX tb_cst_cust_pkey ON tb_cst_cust (cust_no)'))
  assert.ok(!/\b(TB_CST|CUST_NO|LST_MDDTM|_PKEY)\b/.test(objs)) // 대문자 오브젝트 이름 없음
  assert.match(genDdl(build('0001', 'UPPER'), { prjNm: 'P', at: 'now' }), /CREATE TABLE TB_CST_CUST \(/)
  assert.match(genDdl(build('0001', 'LOWER'), { prjNm: 'P', at: 'now' }), /CREATE TABLE tb_cst_cust \(/)
})

test('인덱스(sql/063) : PK 문장 뒤 CREATE [UNIQUE] INDEX — PostgreSQL 소문자·Oracle 대문자, 삭제된 칼럼 참조는 생략 주석', () => {
  const withIdx = (dbms: '0014' | '0001'): DdlIn => {
    const d = build(dbms, 'UPPER')
    d.tables[1] = {
      ...d.tables[1],
      indexes: [
        { idx_nm: 'X_TB_CST_RMT_01', unq_yn: 'N', col_nms: ['SNDR_CUST_NO', 'RCVR_CUST_NO'] },
        { idx_nm: 'X_TB_CST_RMT_02', unq_yn: 'Y', col_nms: ['RCVR_CUST_NO'] },
        { idx_nm: 'X_TB_CST_RMT_03', unq_yn: 'N', col_nms: ['(삭제된 칼럼)'], invalid: true },
      ],
    }
    return d
  }
  const pg = genDdl(withIdx('0014'), { prjNm: 'p', at: 'now' })
  assert.match(pg, /^ALTER TABLE tb_cst_rmt ADD CONSTRAINT tb_cst_rmt_pkey PRIMARY KEY USING INDEX tb_cst_rmt_pkey;\nCREATE INDEX x_tb_cst_rmt_01 ON tb_cst_rmt \(sndr_cust_no, rcvr_cust_no\);\nCREATE UNIQUE INDEX x_tb_cst_rmt_02 ON tb_cst_rmt \(rcvr_cust_no\);$/m)
  assert.match(pg, /^-- ⚠ 인덱스 X_TB_CST_RMT_03 : 삭제된 칼럼 참조로 생략$/m)
  assert.ok(!/INDEX x_tb_cst_rmt_03/.test(pg))
  const ora = genDdl(withIdx('0001'), { prjNm: 'p', at: 'now' })
  assert.match(ora, /^CREATE INDEX X_TB_CST_RMT_01 ON TB_CST_RMT \(SNDR_CUST_NO, RCVR_CUST_NO\);\nCREATE UNIQUE INDEX X_TB_CST_RMT_02 ON TB_CST_RMT \(RCVR_CUST_NO\);$/m)
  assert.ok(ora.indexOf('ADD CONSTRAINT PK_TB_CST_RMT') < ora.indexOf('CREATE INDEX X_TB_CST_RMT_01'))
})

test('인덱스 이름 X_<테이블>_NN : DBMS 식별자 한도 넘으면 테이블 부분을 자름', () => {
  assert.equal(idxName('0001', 'TB_CST_RMT', 1), 'X_TB_CST_RMT_01')
  const long = 'TB_' + 'A'.repeat(40)
  assert.equal(idxName('0001', long, 12).length, 30)
  assert.ok(idxName('0001', long, 12).endsWith('_12'))
  assert.equal(idxName('0014', long, 1), `X_${long}_01`) // PostgreSQL 63자 안
})

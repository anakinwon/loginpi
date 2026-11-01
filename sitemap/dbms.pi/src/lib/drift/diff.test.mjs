// 모델↔DB 정합 대조 검사 — 실행 : node --test src/lib/drift/diff.test.mjs (sitemap/dbms.pi 에서, Node 22.18+ 타입 제거)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffModel, parseColumns, parseIndexes, parseIdxStats, parseTables, ddlTargets, normType, summarize } from './diff.ts'

const model = {
  tables: [{ tblId: 't1', tblNm: 'CUST' }, { tblId: 't2', tblNm: 'ORD' }],
  columns: [
    { tblId: 't1', colNm: 'CUST_ID', phyTpNm: 'UUID', dataLen: null, nullYn: 'N' },
    { tblId: 't1', colNm: 'CUST_NM', phyTpNm: 'VARCHAR', dataLen: 100, nullYn: 'Y' },
    { tblId: 't1', colNm: 'BIRTH_DT', phyTpNm: 'DATE', dataLen: null, nullYn: 'Y' },
  ],
  indexes: [
    { tblId: 't1', idxNm: 'X_CUST_01', colNms: ['CUST_NM'] },
    { tblId: 't1', idxNm: 'X_CUST_02', colNms: 'BIRTH_DT' },
    { tblId: 't1', idxNm: 'X_CUST_03', colNms: ['CUST_ID', 'CUST_NM'] },
  ],
}

const tables = parseTables({ cols: ['table_name'], rows: [['cust'], ['tmp_x']] })
const columns = parseColumns({
  cols: ['table_name', 'column_name', 'data_type', 'character_maximum_length', 'is_nullable'],
  rows: [
    ['cust', 'cust_id', 'uuid', null, 'NO'],
    ['cust', 'cust_nm', 'character varying', 50, 'NO'],
    ['cust', 'memo', 'text', null, 'YES'],
  ],
})
const indexes = parseIndexes({
  cols: ['table_name', 'index_name', 'indexdef'],
  rows: [
    ['cust', 'pk_cust', 'CREATE UNIQUE INDEX pk_cust ON public.cust USING btree (cust_id)'],
    ['cust', 'x_cust_01', 'CREATE INDEX x_cust_01 ON public.cust USING btree (cust_nm)'],
    ['cust', 'ix_renamed', 'CREATE INDEX ix_renamed ON public.cust USING btree (cust_id, cust_nm)'],
    ['cust', 'x_cust_99', 'CREATE INDEX x_cust_99 ON public.cust USING btree (memo)'],
  ],
})
const stats = parseIdxStats({ cols: ['indexrelname', 'idx_scan', 'size_bytes'], rows: [['x_cust_01', 0, 8192], ['ix_renamed', '12', '16384']] })
const ddl = [
  { reqId: 'r1', stsCd: 'DONE', connId: 'c1', stmts: [{ seq: 1, stmtTxt: 'CREATE TABLE IF NOT EXISTS public."ord" (id int)' }, { seq: 2, stmtTxt: 'CREATE INDEX x_cust_01 ON cust (cust_nm)' }] },
  { reqId: 'r2', stsCd: 'DONE', connId: 'c2', stmts: [{ seq: 1, stmtTxt: 'CREATE TABLE zzz (id int)' }] },
  { reqId: 'r3', stsCd: 'FAIL', connId: 'c1', stmts: [{ seq: 1, stmtTxt: 'CREATE TABLE yyy (id int)' }] },
]

test('테이블·칼럼·인덱스·DDL·사용 효과 대조', () => {
  const r = diffModel({ model, ddl, connId: 'c1', tables, columns, indexes, stats })
  assert.deepEqual(r.missingTables, ['ORD'])
  assert.deepEqual(r.extraTables, ['TMP_X'])
  assert.deepEqual(
    r.colMismatches.map((c) => `${c.col}:${c.kind}`).sort(),
    ['BIRTH_DT:MISSING', 'CUST_NM:NULL', 'CUST_NM:TYPE', 'MEMO:EXTRA'],
  )
  assert.equal(r.colMismatches.find((c) => c.kind === 'TYPE').db, 'VARCHAR(50)')
  assert.deepEqual(r.missingIndexes, [{ tbl: 'CUST', idx: 'X_CUST_02' }])
  assert.deepEqual(r.extraIndexes, [{ tbl: 'CUST', idx: 'X_CUST_99' }]) // PK 제외
  assert.deepEqual(r.ddlMissing, [{ reqId: 'r1', kind: 'TABLE', name: 'ORD' }]) // 다른 접속·실패 요청 제외
  assert.deepEqual(r.idxUsage.map((u) => `${u.idx}>${u.dbIdx}:${u.status}`), ['X_CUST_01>X_CUST_01:UNUSED', 'X_CUST_03>IX_RENAMED:USED'])
  assert.equal(summarize(r).unusedIndexes, 1)
})

test('타입 정규화·DDL 대상 추출', () => {
  assert.deepEqual(normType('character varying(20)'), { base: 'VARCHAR', len: 20 })
  assert.deepEqual(normType('timestamp with time zone'), { base: 'TIMESTAMPTZ', len: null })
  assert.deepEqual(ddlTargets('create unique index concurrently if not exists "X_A_01" on a (b)'), { kind: 'INDEX', name: 'X_A_01' })
  assert.equal(ddlTargets('ALTER TABLE a ADD COLUMN b int'), null)
})

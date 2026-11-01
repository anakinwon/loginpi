// 모델↔DB GAP분석 대조 검사 — 실행 : node --test src/lib/drift/diff.test.mjs (sitemap/dbms.pi 에서, Node 22.18+ 타입 제거)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diffModel,
  parseColumns,
  parseIndexes,
  parseIdxStats,
  parseTables,
  parseStatsReset,
  ddlTargets,
  normType,
  summarize,
  truncatedOf,
  pageAll,
  dropUncheckedCols,
  projectPrefix,
  groupByPrefix,
} from './diff.ts'

const model = {
  tables: [
    { tblId: 't1', tblNm: 'CUST' },
    { tblId: 't2', tblNm: 'ORD' },
  ],
  columns: [
    {
      tblId: 't1',
      colNm: 'CUST_ID',
      phyTpNm: 'UUID',
      dataLen: null,
      nullYn: 'N',
    },
    {
      tblId: 't1',
      colNm: 'CUST_NM',
      phyTpNm: 'VARCHAR',
      dataLen: 100,
      nullYn: 'Y',
    },
    {
      tblId: 't1',
      colNm: 'BIRTH_DT',
      phyTpNm: 'DATE',
      dataLen: null,
      nullYn: 'Y',
    },
  ],
  indexes: [
    { tblId: 't1', idxNm: 'X_CUST_01', colNms: ['CUST_NM'] },
    { tblId: 't1', idxNm: 'X_CUST_02', colNms: 'BIRTH_DT' },
    { tblId: 't1', idxNm: 'X_CUST_03', colNms: ['CUST_ID', 'CUST_NM'] },
  ],
}

const tables = parseTables({
  cols: ['table_name'],
  rows: [['cust'], ['tmp_x']],
})
const columns = parseColumns({
  cols: [
    'table_name',
    'column_name',
    'data_type',
    'character_maximum_length',
    'is_nullable',
  ],
  rows: [
    ['cust', 'cust_id', 'uuid', null, 'NO'],
    ['cust', 'cust_nm', 'character varying', 50, 'NO'],
    ['cust', 'memo', 'text', null, 'YES'],
  ],
})
const indexes = parseIndexes({
  cols: ['table_name', 'index_name', 'indexdef'],
  rows: [
    [
      'cust',
      'pk_cust',
      'CREATE UNIQUE INDEX pk_cust ON public.cust USING btree (cust_id)',
    ],
    [
      'cust',
      'x_cust_01',
      'CREATE INDEX x_cust_01 ON public.cust USING btree (cust_nm)',
    ],
    [
      'cust',
      'ix_renamed',
      'CREATE INDEX ix_renamed ON public.cust USING btree (cust_id, cust_nm)',
    ],
    [
      'cust',
      'x_cust_99',
      'CREATE INDEX x_cust_99 ON public.cust USING btree (memo)',
    ],
  ],
})
const stats = parseIdxStats({
  cols: ['indexrelname', 'idx_scan', 'size_bytes'],
  rows: [
    ['x_cust_01', 0, 8192],
    ['ix_renamed', '12', '16384'],
  ],
})
const ddl = [
  {
    reqId: 'r1',
    stsCd: 'DONE',
    connId: 'c1',
    stmts: [
      { seq: 1, stmtTxt: 'CREATE TABLE IF NOT EXISTS public."ord" (id int)' },
      { seq: 2, stmtTxt: 'CREATE INDEX x_cust_01 ON cust (cust_nm)' },
    ],
  },
  {
    reqId: 'r2',
    stsCd: 'DONE',
    connId: 'c2',
    stmts: [{ seq: 1, stmtTxt: 'CREATE TABLE zzz (id int)' }],
  },
  {
    reqId: 'r3',
    stsCd: 'FAIL',
    connId: 'c1',
    stmts: [{ seq: 1, stmtTxt: 'CREATE TABLE yyy (id int)' }],
  },
]

test('테이블·칼럼·인덱스·DDL·사용 효과 대조', () => {
  const r = diffModel({
    model,
    ddl,
    connId: 'c1',
    tables,
    columns,
    indexes,
    stats,
  })
  assert.deepEqual(r.missingTables, ['ORD'])
  assert.deepEqual(r.extraTables, ['TMP_X'])
  assert.deepEqual(r.colMismatches.map((c) => `${c.col}:${c.kind}`).sort(), [
    'BIRTH_DT:MISSING',
    'CUST_NM:NULL',
    'CUST_NM:TYPE',
    'MEMO:EXTRA',
  ])
  assert.equal(r.colMismatches.find((c) => c.kind === 'TYPE').db, 'VARCHAR(50)')
  assert.deepEqual(r.missingIndexes, [{ tbl: 'CUST', idx: 'X_CUST_02' }])
  assert.deepEqual(r.extraIndexes, [{ tbl: 'CUST', idx: 'X_CUST_99' }]) // PK 제외
  assert.deepEqual(r.ddlMissing, [{ reqId: 'r1', kind: 'TABLE', name: 'ORD' }]) // 다른 접속·실패 요청 제외
  assert.deepEqual(
    r.idxUsage.map((u) => `${u.idx}>${u.dbIdx}:${u.status}`),
    ['X_CUST_01>X_CUST_01:NO_DATA', 'X_CUST_03>IX_RENAMED:USED'],
  ) // 8 KB = 빈 인덱스
  assert.equal(summarize(r).unusedIndexes, 0)
})

test('타입 정규화·DDL 대상 추출', () => {
  assert.deepEqual(normType('character varying(20)'), {
    base: 'VARCHAR',
    len: 20,
  })
  assert.deepEqual(normType('timestamp with time zone'), {
    base: 'TIMESTAMPTZ',
    len: null,
  })
  assert.deepEqual(
    ddlTargets(
      'create unique index concurrently if not exists "X_A_01" on a (b)',
    ),
    { kind: 'INDEX', name: 'X_A_01', tbl: 'A' },
  )
  assert.deepEqual(ddlTargets('CREATE INDEX x_a_01 ON public."a" (b)'), {
    kind: 'INDEX',
    name: 'X_A_01',
    tbl: 'A',
  })
  assert.equal(ddlTargets('ALTER TABLE a ADD COLUMN b int'), null)
})

// ── GAP분석 4절 오탐 제거 ──
const T = {
  tables: [{ tblId: 'a', tblNm: 'ECM_CST_CUST' }],
  columns: [],
  indexes: [],
}
const pkIdx = (n) => ({
  tbl: 'ECM_CST_CUST',
  idx: n,
  cols: ['CUST_ID'],
  primary: true,
  unique: true,
})
const tblOnly = [{ name: 'ECM_CST_CUST', kind: 'R', estRows: 0 }]
const req = (reqId, reqDtm, idx) => ({
  reqId,
  stsCd: 'DONE',
  connId: 'c1',
  reqDtm,
  stmts: [
    { seq: 1, stmtTxt: 'DROP TABLE IF EXISTS ECM_CST_CUST CASCADE;' },
    { seq: 2, stmtTxt: 'CREATE TABLE ECM_CST_CUST (CUST_ID UUID NOT NULL);' },
    {
      seq: 3,
      stmtTxt: `CREATE UNIQUE INDEX ${idx} ON ECM_CST_CUST (CUST_ID);`,
    },
  ],
})
const run1 = (ddl, idxs) =>
  diffModel({
    model: T,
    ddl,
    connId: 'c1',
    tables: tblOnly,
    columns: [],
    indexes: idxs,
    stats: [],
  })

test('1절 — 같은 테이블 재생성 3회 : 누락 0 · 대체 2', () => {
  // 응답 순서가 섞여 와도 시각 기준 최신순으로 판정
  const d = [
    req('r2', '2026-10-10', 'ECM_CST_CUST_PKEY'),
    req('r3', '2026-10-30', 'PK_ECM_CST_CUST'),
    req('r1', '2026-10-01', 'ECM_CST_CUST_PKEY'),
  ]
  const r = run1(d, [pkIdx('PK_ECM_CST_CUST')])
  assert.deepEqual(r.ddlMissing, [])
  assert.deepEqual(
    r.superseded.map((x) => `${x.reqId}>${x.by}`),
    ['r2>r3', 'r1>r3'],
  )
  assert.deepEqual(r.superseded[0].names, ['ECM_CST_CUST', 'ECM_CST_CUST_PKEY'])
  assert.equal(summarize(r).superseded, 2)
})

test('1절 — 최신 요청이 _PKEY 이고 DB 에 PK_ 있음 : RENAMED', () => {
  const r = run1(
    [req('r1', '2026-10-01', 'ECM_CST_CUST_PKEY')],
    [pkIdx('PK_ECM_CST_CUST')],
  )
  assert.deepEqual(r.ddlMissing, [])
  assert.deepEqual(r.renamed, [
    { reqId: 'r1', name: 'ECM_CST_CUST_PKEY', dbName: 'PK_ECM_CST_CUST' },
  ])
})

test('1절 — 최신 요청 인덱스가 DB 에 없음 : 진짜 누락 1', () => {
  const r = run1(
    [
      req('r2', '2026-10-30', 'PK_ECM_CST_CUST'),
      req('r1', '2026-10-01', 'ECM_CST_CUST_PKEY'),
    ],
    [],
  )
  assert.deepEqual(r.ddlMissing, [
    { reqId: 'r2', kind: 'INDEX', name: 'PK_ECM_CST_CUST' },
  ])
  assert.equal(r.superseded.length, 1)
})

test('2절 — relkind 필터(뷰 제외) · 칼럼에서 뷰 보충 안 함 · 접두사 그룹', () => {
  const tb = parseTables({
    cols: ['schemaname', 'relname', 'relkind', 'est_rows'],
    rows: [
      ['public', 'ecm_cst_cust', 'r', 3],
      ['public', 'ecm_ord', 'p', 0],
      ['public', 'v_x', 'v', null],
      ['public', 'mv', 'm', 1],
      ['public', 'mdl_prj', 'r', 9],
    ],
  })
  assert.deepEqual(
    tb.map((t) => t.name),
    ['ECM_CST_CUST', 'ECM_ORD', 'MDL_PRJ'],
  )
  assert.equal(tb[0].estRows, 3)
  const cols = parseColumns({
    cols: ['relname', 'attname', 'data_tp', 'attnotnull'],
    rows: [['v_x', 'a', 'text', false]],
  })
  const r = diffModel({
    model: T,
    ddl: [],
    connId: 'c1',
    tables: tb,
    columns: cols,
    indexes: [],
    stats: [],
  })
  assert.deepEqual(r.extraTables, ['ECM_ORD', 'MDL_PRJ'])
  const pfx = projectPrefix(T)
  assert.equal(pfx, 'ECM')
  assert.deepEqual(
    groupByPrefix(['MDL_A', 'MDL_B', 'ECM_ORD', 'STD_X'], pfx).map(
      (g) => `${g.pfx}:${g.own}:${g.tables.length}`,
    ),
    ['ECM:true:1', 'MDL:false:2', 'STD:false:1'],
  )
})

test('3절 — 시스템 칼럼 분리 · data_tp 타입 비교', () => {
  const m = {
    tables: [{ tblId: 'a', tblNm: 'ECM_CST_CUST' }],
    columns: [
      {
        tblId: 'a',
        colNm: 'CUST_ID',
        phyTpNm: 'UUID',
        dataLen: null,
        nullYn: 'N',
      },
      {
        tblId: 'a',
        colNm: 'CUST_NM',
        phyTpNm: 'VARCHAR',
        dataLen: 100,
        nullYn: 'Y',
      },
    ],
    indexes: [],
  }
  const sys = ['lst_mddtm', 'lst_mdfr_id', 'lst_rgdtm', 'lst_rgtr_id'].map(
    (c, i) => ['public', 'ecm_cst_cust', 3 + i, c, 'text', true],
  )
  const cols = parseColumns({
    cols: [
      'schemaname',
      'relname',
      'attnum',
      'attname',
      'data_tp',
      'attnotnull',
    ],
    rows: [
      ['public', 'ecm_cst_cust', 1, 'cust_id', 'uuid', true],
      ['public', 'ecm_cst_cust', 2, 'cust_nm', 'character varying(100)', false],
      ...sys,
    ],
  })
  const r = diffModel({
    model: m,
    ddl: [],
    connId: 'c1',
    tables: tblOnly,
    columns: cols,
    indexes: [],
    stats: [],
  })
  assert.deepEqual(r.colMismatches, [])
  assert.equal(r.sysCols.length, 4)
  assert.equal(summarize(r).colMismatches, 0)
  // 타입이 실제로 다르면 잡는다(data_tp 별칭)
  const cols2 = cols.map((c) =>
    c.col === 'CUST_NM' ? { ...c, type: 'CHARACTER VARYING(50)' } : c,
  )
  const r2 = diffModel({
    model: m,
    ddl: [],
    connId: 'c1',
    tables: tblOnly,
    columns: cols2,
    indexes: [],
    stats: [],
  })
  assert.deepEqual(
    r2.colMismatches.map((c) => `${c.col}:${c.kind}:${c.db}`),
    ['CUST_NM:TYPE:VARCHAR(50)'],
  )
})

test('4절 — 인덱스 판정 : 데이터 없음 · 관찰 중 · 미사용 후보 · 유일성 보장', () => {
  const now = Date.parse('2026-11-01T00:00:00Z')
  const m = {
    tables: [
      { tblId: 'a', tblNm: 'A' },
      { tblId: 'b', tblNm: 'B' },
      { tblId: 'c', tblNm: 'C' },
    ],
    columns: [],
    indexes: [
      { tblId: 'a', idxNm: 'X_A_01', colNms: ['K'] },
      { tblId: 'b', idxNm: 'X_B_01', colNms: ['K'] },
      { tblId: 'c', idxNm: 'X_C_01', colNms: ['K'] },
      { tblId: 'c', idxNm: 'X_C_02', colNms: ['J'] },
    ],
  }
  const tb = [
    { name: 'A', kind: 'R', estRows: 0 },
    { name: 'B', kind: 'R', estRows: 1000 },
    { name: 'C', kind: 'R', estRows: 1000 },
  ]
  const ix = parseIndexes({
    cols: ['relname', 'indexrelname', 'indisunique', 'indisprimary', 'idx_def'],
    rows: [
      [
        'a',
        'x_a_01',
        false,
        false,
        'CREATE INDEX x_a_01 ON public.a USING btree (k)',
      ],
      ['b', 'x_b_01', false, false, '(k)'],
      ['c', 'x_c_01', false, false, '(k)'],
      ['c', 'x_c_02', true, false, '(j)'],
    ],
  })
  const st = parseIdxStats({
    cols: ['indexrelname', 'idx_scan', 'idx_sz'],
    rows: [
      ['x_a_01', 0, 8192],
      ['x_b_01', 0, 65536],
      ['x_c_01', 0, 65536],
      ['x_c_02', 0, 65536],
    ],
  })
  const d = [
    {
      reqId: 'r1',
      stsCd: 'DONE',
      connId: 'c1',
      reqDtm: '2026-10-29T00:00:00Z',
      stmts: [
        {
          seq: 1,
          stmtTxt: 'CREATE INDEX X_B_01 ON B (K)',
          endDtm: '2026-10-29T00:00:00Z',
        },
      ],
    },
  ]
  const statsReset = parseStatsReset({
    cols: ['datname', 'stats_reset'],
    rows: [['db', '2026-09-01T00:00:00Z']],
  })
  const r = diffModel({
    model: m,
    ddl: d,
    connId: 'c1',
    tables: tb,
    columns: [],
    indexes: ix,
    stats: st,
    statsReset,
    now,
  })
  assert.deepEqual(
    r.idxUsage.map((u) => `${u.idx}:${u.status}`),
    [
      'X_A_01:NO_DATA',
      'X_B_01:OBSERVING',
      'X_C_01:UNUSED_CAND',
      'X_C_02:CONSTRAINT',
    ],
  )
  assert.equal(r.idxUsage[1].since, '2026-10-29T00:00:00.000Z')
  assert.equal(r.idxUsage[2].since, '2026-09-01T00:00:00.000Z')
  assert.equal(summarize(r).unusedIndexes, 1)
})

test('500행 절단 경고', () => {
  const full = {
    cols: ['relname'],
    rows: Array.from({ length: 500 }, (_, i) => [`t${i}`]),
  }
  const part = { cols: ['relname'], rows: [['t']] }
  assert.deepEqual(
    truncatedOf({
      catalog_tables: full,
      catalog_columns: part,
      catalog_indexes: full,
      idx_stats: null,
    }),
    ['catalog_tables', 'catalog_indexes'],
  )
})

test('offset 순회 : 꽉 찬 페이지면 다음 페이지, 상한 페이지에도 꽉 차면 cut', async () => {
  const src = Array.from({ length: 1203 }, (_, i) => [`t${i}`])
  const offs = []
  const fetch = async (o) => {
    offs.push(o)
    return { cols: ['relname'], rows: src.slice(o, o + 500) }
  }
  const a = await pageAll(fetch)
  assert.deepEqual(offs, [0, 500, 1000])
  assert.equal(a.r.rows.length, 1203)
  assert.equal(a.cut, false)
  const b = await pageAll(fetch, 500, 2)
  assert.equal(b.r.rows.length, 1000)
  assert.equal(b.cut, true)
})

test('칼럼 절단 : 누락·추가는 확인 불가로 빼고 유형·NULL 은 유지', () => {
  const r = {
    colMismatches: [
      { tbl: 'A', col: 'X', kind: 'MISSING' },
      { tbl: 'A', col: 'Y', kind: 'EXTRA' },
      { tbl: 'A', col: 'Z', kind: 'TYPE' },
    ],
  }
  assert.equal(dropUncheckedCols(r), 2)
  assert.deepEqual(
    r.colMismatches.map((m) => m.kind),
    ['TYPE'],
  )
})

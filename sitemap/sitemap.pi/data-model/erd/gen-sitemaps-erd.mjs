// sitemap.pi 1차 데이터 모델 ERD 생성기 — DDL(000·001·02) + ERD 인벤토리 → ERD Editor 문서(.erd, PostgreSQL)
// 실행: node gen-sitemaps-erd.mjs [--out <file.erd>] [--inventory <json>] [--sql <a.sql,b.sql,...>] [--dump-sql <file>] [--no-strict] [--no-rename]
// 000·001 은 정본 v2.4 재점검·마스터 확정 sys_user 7컬럼 개명을 메모리에서 적용해 읽는다(원본 파일 무수정, --no-rename 으로 끔)
// 기본 경로는 이 파일 위치 기준 상대경로. 공식 MCP 서버(@dineug/erd-editor-mcp)를 npx 로 headless 실행한다(Node >= 22.12).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../..') // erd → data-model → sitemap.pi → sitemap → 저장소 루트

const CFG = {
  mcpPkg: '@dineug/erd-editor-mcp@0.2.0',
  out: path.join(HERE, 'sitemaps-data-model.erd'),
  inventory: path.join(REPO, 'docs/da/_workspace/20261010_sitemap-data-model/05_erd_inventory.json'),
  sql: [
    path.join(REPO, 'packages/pi-db/sql/000_baseline.sql'),
    path.join(REPO, 'sitemap/sitemap.pi/sql/001_sitemap_phase1.sql'),
    path.join(REPO, 'docs/da/_workspace/20261010_sitemap-data-model/02_modeler_ddl.sql'),
  ],
  dbName: 'sitemap.pi',
  canonical: 'sitemap/sitemap.pi/data-model/sitemaps-data-model.md',
  modelVer: '1.1 (재점검 반영)',
  modelDt: '2026-10-10',
}

// 배치·색상 상수 (px / CSS hex)
const L = { gapX: 60, gapY: 40, areaGapX: 140, areaGapY: 200, rowMaxW: 4000, left: 40, labelW: 640 } // labelW = 왼쪽 영역 메모 열 폭
const AREA = [
  // 정본 §3 주제영역 순서. color = 테이블 머리색, tint = 영역 메모 배경, cols = 영역 안 테이블 열 수
  { name: '사용자', color: '#3b82f6', tint: '#dbeafe', cols: 1 },
  { name: '사이트 디렉터리', color: '#10b981', tint: '#d1fae5', cols: 2 },
  { name: '통계', color: '#8b5cf6', tint: '#ede9fe', cols: 1 },
  { name: '결제(공용)', color: '#ef4444', tint: '#fee2e2', cols: 1 },
  { name: '요금·주문', color: '#f59e0b', tint: '#fef3c7', cols: 3 },
  { name: '시스템 설정', color: '#64748b', tint: '#e2e8f0', cols: 2 },
]
const UNCLASSIFIED = { name: '미분류(인벤토리 밖 신규)', color: '#a3a3a3', tint: '#f5f5f5', cols: 2 }
const NOTE_COLOR = '#fef9c3'
const DOC_COLOR = '#e5e7eb'

// 테이블 단계 표기 — CREATE TABLE 이 있는 파일·BEGIN 블록 순번 기준
const PHASE = [
  { file: /^000_/, label: '공통 baseline (@pi/db 000)' },
  { file: /^001_/, label: 'Phase 1 (001)' },
  { file: /^02_/, block: 1, label: 'Phase 1 (02 Part A 초안)' },
  { file: /^02_/, block: 2, label: 'Phase 2 (02 Part B 초안)' },
]

// DDL 에 테이블이 없는 엔터티 — 주제영역 안 자리표시 메모
const PLACEHOLDER = {
  '결제(공용)': [
    [
      '[자리표시] pi_pymnt — Pi 결제 (공용, @pi/db)',
      'Phase 2 — 010_pi_pymnt 적용 후 fee_ord.pymnt_id FK 추가 (키 타입 TBD)',
      '현재 fee_ord.pymnt_id = TEXT, FK 없음 (DDL 에서 제약 주석 처리)',
      '정본 §3 관계 : pi_pymnt |o--o| fee_ord (결제 1건 = 주문 1건)',
    ].join('\n'),
  ],
}

// 표기 범례·모델 메모 (인벤토리 notes 요약)
const NOTES = [
  '[표기·모델 메모]',
  '· 관계선 : 실선 = 식별 관계(stat_site_dly.site_id → site_mst, PK 일부) · 점선 = 비식별 관계(대리키 UUID PK)',
  '· 부모 쪽 기호 : 링(○) = FK NULL 허용(선택) · 대시(|) = 필수 / 자식 쪽 = 0..N. 모든 FK ON DELETE 미지정(NO ACTION)',
  '· 대체키(AK) 참조 : fee_plan_bnd.bnd_plan_cd · item_plan_cd, fee_ord.fee_plan_cd → fee_plan.fee_plan_cd (UNIQUE 자연키, PK 아님)',
  '· 역할명 관계 : sys_user → site_mst(ownr_usr_id · vrf_usr_id), sys_user → usr_snc(tgt_usr_id · prcs_usr_id) / 자기참조 : fee_ord.upr_ord_id → fee_ord',
  '· 논리 참조(FK 없음) : sys_cfg_chg_hist(cfg_tbl_nm, cfg_tgt_id) → sys_cfg · promo_fee_cfg · fee_plan · fee_plan_bnd 다형 참조',
  '· 감사 컬럼 chgr_id · regr_id · modr_id 는 sys_user FK 없음(TEXT — sys_user.usr_id 또는 ADMIN · SYSTEM)',
  '· 카디널리티 세부 : site_img 사이트당 활성 0..4 · usr_snc 동시 ACTIVE ≤ 1 · fee_ord.site_id 멤버십이면 NULL(트리거) — 정본 §4-2',
  '· 부분 UNIQUE 인덱스(활성 행 한정)는 인덱스로만 표기, WHERE 조건은 ERD 미표현 / 식 인덱스 ux_promo_fee_cfg_sngl 제외',
  '· CHECK 제약 · 트리거 · 함수 · 시드 INSERT 는 ERD 미표현 — 원천 DDL 참조',
].join('\n')

// ---------------------------------------------------------------- 인자
function parseArgs(argv) {
  const a = { ...CFG, strict: true, dumpSql: null }
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]
    const v = () => argv[++i]
    if (k === '--out') a.out = path.resolve(v())
    else if (k === '--inventory') a.inventory = path.resolve(v())
    else if (k === '--sql') a.sql = v().split(',').map((p) => path.resolve(p))
    else if (k === '--dump-sql') a.dumpSql = path.resolve(v())
    else if (k === '--no-strict') a.strict = false
    else if (k === '--no-rename') RENAME = false
    else if (k === '--help' || k === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 3).join('\n')); process.exit(0) }
    else throw new Error(`알 수 없는 인자: ${k}`)
  }
  return a
}

// ---------------------------------------------------------------- SQL 전처리
// 문장 분리 — 작은따옴표·큰따옴표·주석·달러인용($tag$...$tag$) 인식. raw(주석 포함)와 clean(주석 제거) 둘 다 반환
function splitStatements(sql) {
  const out = []
  let raw = '', clean = '', i = 0
  const push = () => {
    if (clean.trim()) out.push({ raw: raw.trim(), clean: clean.trim() })
    raw = clean = ''
  }
  while (i < sql.length) {
    const c = sql[i], n = sql[i + 1]
    if (c === '-' && n === '-') {
      const e = sql.indexOf('\n', i)
      const end = e < 0 ? sql.length : e
      raw += sql.slice(i, end); i = end; continue
    }
    if (c === '/' && n === '*') {
      const e = sql.indexOf('*/', i + 2)
      const end = e < 0 ? sql.length : e + 2
      raw += sql.slice(i, end); clean += ' '; i = end; continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue } break }
        j++
      }
      const s = sql.slice(i, j + 1); raw += s; clean += s; i = j + 1; continue
    }
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
      if (m) {
        const e = sql.indexOf(m[0], i + m[0].length)
        const end = e < 0 ? sql.length : e + m[0].length
        const s = sql.slice(i, end); raw += s; clean += ' $BODY$ '; i = end; continue
      }
    }
    if (c === ';') { raw += c; push(); i++; continue }
    raw += c; clean += c; i++
  }
  push()
  return out
}

// 최상위 콤마 분리 (괄호 깊이·따옴표 인식)
function splitTop(s) {
  const parts = []
  let depth = 0, cur = '', q = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { cur += c; if (c === q) { if (s[i + 1] === q) { cur += s[++i]; continue } q = null } continue }
    if (c === "'" || c === '"') { q = c; cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const ident = (s) => s.replace(/"/g, '').toLowerCase()

// sys_user 7컬럼 개명(정본 v2.4 §1-3·마스터 확정 2026-10-10) — 구현 단계에서 000·001 본문이 바뀌기 전까지 메모리 사본으로 읽는다.
// 치환 규칙은 docs/da/_workspace/20261010_sitemap-data-model/02_modeler_pglite_check.mjs 신규 DB 경로와 같다
const SYS_USER_RENAME = [
  ['id', 'usr_id'], ['role', 'role_cd'], ['pi_username', 'pi_usr_nm'], ['pi_wallet_address', 'pi_wlt_adr_txt'],
  ['display_name', 'dsp_nm'], ['last_login_dtm', 'lst_lgn_dtm'], ['rejoin_dtm', 'rjn_dtm'],
]
function renameSql(file, text) {
  const base = path.basename(file)
  if (base === '000_baseline.sql') {
    let t = text
      .replace(/^  id {16}UUID /m, '  usr_id            UUID ')
      .replace('PRIMARY KEY (id)', 'PRIMARY KEY (usr_id)')
      .replace(/^  role {14}TEXT /m, '  role_cd           VARCHAR(20) ')
      .replace('sys_user_role_check CHECK (role IN', 'sys_user_role_cd_check CHECK (role_cd IN')
      .replace(/ux_sys_user_pi_username_actv/g, 'ux_sys_user_pi_usr_nm_actv')
    for (const [o, n] of SYS_USER_RENAME.slice(2)) t = t.replace(new RegExp('\\b' + o + '\\b', 'g'), n)
    if (t === text) throw new Error('000 개명 치환 실패 — 000_baseline.sql 형식 변경 확인')
    return t
  }
  if (base === '001_sitemap_phase1.sql') return text.replaceAll('REFERENCES sys_user (id)', 'REFERENCES sys_user (usr_id)')
  return text
}
let RENAME = true

// DDL 파일들 → { tables: Map(name → {items, inline}), alters: [stmt], indexes: [stmt], skipped: {kind: n} }
function collectDdl(files) {
  const tables = new Map()
  const alters = [], indexes = [], skipped = {}
  const skip = (k) => (skipped[k] = (skipped[k] || 0) + 1)
  for (const f of files) {
    let block = 0 // 파일 안 BEGIN 순번 (02 의 Part A=1·Part B=2 구분용)
    for (const st of splitStatements(RENAME ? renameSql(f, fs.readFileSync(f, 'utf8')) : fs.readFileSync(f, 'utf8'))) {
      const c = norm(st.clean)
      let m
      if (/^BEGIN$/i.test(c)) { block++; continue }
      if (/^COMMIT$/i.test(c)) continue
      if ((m = /^CREATE TABLE (?:IF NOT EXISTS )?([\w."]+) \((.*)\)$/is.exec(c))) {
        const name = ident(m[1])
        const items = splitTop(m[2]).filter((it) => !/^(CONSTRAINT [\w"]+ )?CHECK\b/i.test(it))
        // 컬럼 옆 인라인 주석 = 논리명 폴백 (인벤토리에 없는 컬럼용)
        const inline = {}
        for (const line of st.raw.split('\n')) {
          const lm = /^\s*([a-z_][a-z0-9_]*)\s+[A-Za-z].*?--\s*(.+)$/.exec(line)
          if (lm && !/^(constraint|primary|unique|foreign|check)$/i.test(lm[1])) inline[lm[1]] = lm[2].trim()
        }
        tables.set(name, { items, inline, file: path.basename(f), block })
      } else if ((m = /^ALTER TABLE (?:ONLY )?([\w."]+) ADD COLUMN (?:IF NOT EXISTS )?(.+)$/is.exec(c))) {
        // ADD COLUMN 은 erd-editor 파서가 버리므로 CREATE TABLE 컬럼 목록에 병합 (공통6 del_yn 앞에)
        const t = tables.get(ident(m[1]))
        if (!t) { skip('ADD COLUMN(대상 테이블 없음)'); continue }
        const def = m[2].trim()
        const col = ident(def.split(/\s+/)[0])
        if (t.items.some((it) => ident(it.split(/\s+/)[0]) === col)) continue
        const at = t.items.findIndex((it) => /^del_yn\s/i.test(it))
        t.items.splice(at < 0 ? t.items.length : at, 0, def)
        const lm = new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?${col}\\b.*?--\\s*(.+)$`, 'im').exec(st.raw)
        if (lm) t.inline[col] = lm[1].trim()
      } else if (/^ALTER TABLE .* ADD +CONSTRAINT [\w"]+ (FOREIGN KEY|PRIMARY KEY|UNIQUE)\b/i.test(c)) {
        alters.push(c.replace(/ +/g, ' '))
      } else if ((m = /^CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?([\w"]+) ON (?:ONLY )?([\w."]+)(?: USING \w+)? \((.*?)\)(?: WHERE .*)?$/is.exec(c))) {
        // 단순 컬럼 인덱스만 (식·opclass 인덱스 제외). 부분 인덱스의 WHERE 는 ERD 로 표현 불가 → 제거
        const cols = splitTop(m[4])
        if (!cols.every((x) => /^[a-z_][a-z0-9_]*( (ASC|DESC))?$/i.test(x))) { skip('CREATE INDEX(식 인덱스)'); continue }
        indexes.push(`CREATE ${m[1] || ''}INDEX ${m[2]} ON ${ident(m[3])} (${cols.join(', ')})`)
      } else {
        const k = c.split(/\s+/).slice(0, 2).join(' ').toUpperCase()
        skip(k)
      }
    }
  }
  return { tables, alters, indexes, skipped }
}

function buildDdl({ tables, alters, indexes }) {
  const parts = []
  for (const [name, t] of tables) parts.push(`CREATE TABLE ${name} (\n  ${t.items.join(',\n  ')}\n);`)
  for (const a of alters) parts.push(`${a};`)
  for (const ix of indexes) parts.push(`${ix};`)
  return parts.join('\n\n') + '\n'
}

// ---------------------------------------------------------------- MCP stdio 클라이언트
function startMcp(cwd) {
  const p = spawn(`npx -y ${CFG.mcpPkg}`, { shell: true, cwd, stdio: ['pipe', 'pipe', 'pipe'] })
  let buf = '', id = 0, errTxt = ''
  const pend = new Map()
  p.stdout.setEncoding('utf8')
  p.stdout.on('data', (d) => {
    buf += d
    let k
    while ((k = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, k); buf = buf.slice(k + 1)
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      const r = pend.get(msg.id)
      if (r) { pend.delete(msg.id); r(msg) }
    }
  })
  p.stderr.on('data', (d) => (errTxt += d))
  const rpc = (method, params) => new Promise((res, rej) => {
    const i = ++id
    const timer = setTimeout(() => rej(new Error(`MCP 응답 시간초과: ${method}\n${errTxt}`)), 180000)
    pend.set(i, (m) => { clearTimeout(timer); res(m) })
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n')
  })
  const call = async (name, args) => {
    const m = await rpc('tools/call', { name, arguments: args })
    if (m.error) throw new Error(`${name}: ${JSON.stringify(m.error)}`)
    const txt = (m.result.content || []).map((x) => x.text || '').join('')
    if (m.result.isError) throw new Error(`${name}: ${txt}`)
    try { return JSON.parse(txt) } catch { return txt }
  }
  const init = async () => {
    await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'gen-sitemaps-erd', version: '1' } })
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  }
  const stop = () => { try { p.stdin.end(); p.kill() } catch {} }
  return { init, call, stop }
}


// ---------------------------------------------------------------- 인벤토리 대조
const normType = (t) => String(t || '').toUpperCase().replace(/\s+/g, '').replace(/^INTEGER$/, 'INT')
const normDef = (d) => (d == null ? '' : String(d).trim())

// 문서(readDoc 결과) ↔ 인벤토리 비교 → 차이 목록
function diffInventory(inv, tables, rels) {
  const issues = []
  const byName = new Map(tables.map((t) => [t.name, t]))
  for (const it of inv.tables) {
    const t = byName.get(it.name)
    if (!t) { issues.push(`테이블 누락: ${it.name}`); continue }
    const cols = new Map(t.columns.map((c) => [c.name, c]))
    for (const ic of it.columns) {
      const c = cols.get(ic.name)
      if (!c) { issues.push(`컬럼 누락: ${it.name}.${ic.name}`); continue }
      if (normType(c.dataType) !== normType(ic.type)) issues.push(`타입 불일치: ${it.name}.${ic.name} ${c.dataType} ≠ ${ic.type}`)
      if (c.notNull !== !ic.nullable) issues.push(`NULL 불일치: ${it.name}.${ic.name}`)
      if (c.primaryKey !== ic.pk) issues.push(`PK 불일치: ${it.name}.${ic.name}`)
      if (c.unique !== ic.unique) issues.push(`UNIQUE 불일치: ${it.name}.${ic.name}`)
      if (normDef(c.default) !== normDef(ic.default)) issues.push(`기본값 불일치: ${it.name}.${ic.name} '${c.default}' ≠ '${ic.default ?? ''}'`)
    }
    for (const c of t.columns) if (!it.columns.some((ic) => ic.name === c.name)) issues.push(`인벤토리 밖 컬럼: ${it.name}.${c.name}`)
    const order = t.columns.map((c) => c.name).filter((n) => it.columns.some((ic) => ic.name === n))
    const want = it.columns.map((c) => c.name).filter((n) => cols.has(n))
    if (order.join() !== want.join()) issues.push(`컬럼 순서 불일치: ${it.name}`)
  }
  for (const t of tables) if (!inv.tables.some((it) => it.name === t.name)) issues.push(`인벤토리 밖 테이블: ${t.name}`)
  const key = (ct, cc, pt, pc) => `${ct}(${cc.join(',')})→${pt}(${pc.join(',')})`
  const got = new Map(rels.map((r) => [key(r.child, r.childCols, r.parent, r.parentCols), r]))
  for (const ir of inv.relationships) {
    const k = key(ir.child_table, ir.child_columns, ir.parent_table, ir.parent_columns)
    const r = got.get(k)
    if (!r) { issues.push(`FK 누락: ${k}`); continue }
    got.delete(k)
    if (r.identification !== ir.identifying) issues.push(`식별/비식별 불일치: ${k}`)
    if (r.optional !== ir.optional) issues.push(`선택성(링/대시) 불일치: ${k}`)
  }
  for (const k of got.keys()) issues.push(`인벤토리 밖 FK: ${k}`)
  return issues
}

// 저장된 .erd(JSON) 읽기 → { json, tables:[{id,name,comment,color,columns}], rels, memos }
function readDoc(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'))
  const c = j.collections
  const T = c.tableEntities, C = c.tableColumnEntities
  // 컬럼 options 비트(erd-editor ColumnOption): autoIncrement 1 · primaryKey 2 · unique 4 · notNull 8
  const tables = j.doc.tableIds.map((id) => {
    const t = T[id]
    return {
      id, name: t.name, comment: t.comment, color: t.ui?.color || '',
      columns: t.columnIds.map((cid) => {
        const x = C[cid]
        return {
          id: cid, name: x.name, comment: x.comment, dataType: x.dataType, default: x.default,
          primaryKey: !!(x.options & 2), unique: !!(x.options & 4), notNull: !!(x.options & 8),
        }
      }),
    }
  })
  const rels = j.doc.relationshipIds.map((id) => {
    const r = c.relationshipEntities[id]
    return {
      id, parent: T[r.start.tableId].name, child: T[r.end.tableId].name,
      parentCols: r.start.columnIds.map((x) => C[x].name), childCols: r.end.columnIds.map((x) => C[x].name),
      // startRelationshipType 비트 : ring 1(부모 0..1 = FK NULL 허용) · dash 2(부모 필수)
      identification: r.identification, optional: r.startRelationshipType === 1, type: r.relationshipType,
    }
  })
  return { json: j, tables, rels, memos: j.doc.memoIds.length }
}

// ---------------------------------------------------------------- 배치 계산
function phaseOf(t) {
  const r = PHASE.find((p) => p.file.test(t.file) && (p.block == null || p.block === t.block))
  return r ? r.label : t.file
}

const memoH = (text) => Math.max(100, text.split('\n').length * 20 + 30) // 편집기 최소 높이 100

// 주제영역 배치 — 영역 메모(헤더·자리표시)는 행 왼쪽 여백 열에 세로로 쌓고, 테이블은 그 오른쪽에 영역별 열로 둔다.
// 메모가 테이블 사이(관계선 경로)에 오지 않으므로 행을 넘나드는 관계선·자기참조 고리가 메모에 가려지지 않는다.
// sizes: name → {width,height}
function layout(groups, sizes, startY) {
  const out = { tables: [], memos: [] }
  const x0 = L.left + L.labelW + L.areaGapX
  const rows = [[]], pending = [] // 테이블 없는 영역(자리표시만)은 다음 영역과 같은 행에 둔다
  let x = x0
  for (const g of groups) {
    const colsN = Math.max(1, Math.min(g.area.cols, g.tables.length || 1))
    g.cols = Array.from({ length: colsN }, () => ({ items: [], h: 0, w: 0 }))
    for (const name of g.tables) {
      const s = sizes.get(name)
      const col = g.cols.reduce((p, q) => (q.h < p.h ? q : p)) // 가장 낮은 열에 쌓기
      col.items.push(name); col.h += s.height + L.gapY; col.w = Math.max(col.w, s.width)
    }
    const bodyW = g.tables.length ? g.cols.reduce((s, c) => s + c.w, 0) + L.gapX * (colsN - 1) : 0
    if (bodyW && x > x0 && x + bodyW > L.rowMaxW) { rows.push([]); x = x0 }
    if (!bodyW) { pending.push(g); continue }
    g.x = x
    x += bodyW + L.areaGapX
    rows.at(-1).push(...pending.splice(0), g)
  }
  rows.at(-1).push(...pending)
  let y = startY
  for (const row of rows) {
    let my = y, tablesH = 0
    for (const g of row) {
      for (const m of [{ value: g.head, color: g.area.tint, height: memoH(g.head) }, ...g.extraMemos]) {
        out.memos.push({ ...m, x: L.left, y: my, width: L.labelW }); my += m.height + L.gapY
      }
      let cx = g.x
      for (const c of g.cols) {
        let cy = y
        for (const name of c.items) { out.tables.push({ name, x: cx, y: cy }); cy += sizes.get(name).height + L.gapY }
        cx += c.w + L.gapX
        tablesH = Math.max(tablesH, c.h)
      }
    }
    y += Math.max(my - y, tablesH) + L.areaGapY
  }
  return out
}

// ---------------------------------------------------------------- 메인
async function main() {
  const a = parseArgs(process.argv)
  const inv = JSON.parse(fs.readFileSync(a.inventory, 'utf8'))
  const ddlModel = collectDdl(a.sql)
  const ddl = buildDdl(ddlModel)
  if (a.dumpSql) fs.writeFileSync(a.dumpSql, ddl)
  console.log(`[전처리] 테이블 ${ddlModel.tables.size} · ALTER 제약 ${ddlModel.alters.length} · 인덱스 ${ddlModel.indexes.length}`)
  console.log(`[전처리] 제외 문장: ${JSON.stringify(ddlModel.skipped)}`)

  // VS Code 가 대상 파일을 열고 있으면 MCP 가 라이브 편집으로 바뀌므로, 임시 파일에 만든 뒤 복사한다
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'erd-gen-'))
  const tmp = path.join(work, 'model.erd')
  const mcp = startMcp(os.tmpdir()) // cwd 를 work 로 두면 종료 지연 시 폴더 삭제가 막힌다
  try {
    await mcp.init()
    await mcp.call('erd_open_document', { path: tmp, create: true })
    await mcp.call('erd_import_sql', { path: tmp, value: ddl })

    // 1) DDL 가져오기 직후 ↔ 인벤토리 (참고). 기본값은 2)에서 인벤토리 값으로 맞추고,
    //    관계선 링/대시는 가져오기 직후 파일에 덜 반영돼 있다가 이후 편집에서 재계산되므로 4) 최종 검증에서 판정한다
    const doc = readDoc(tmp)
    const pre = diffInventory(inv, doc.tables, doc.rels).filter((s) => !/^(기본값|선택성)/.test(s))
    if (pre.length) console.log(`[대조] DDL↔인벤토리 차이 ${pre.length}건\n  ${pre.join('\n  ')}`)

    // 2) 오버레이 — 설정·논리명(코멘트)·기본값·색상
    const invT = new Map(inv.tables.map((t) => [t.name, t]))
    const areaOf = (name) => AREA.find((x) => x.name === invT.get(name)?.subject_area) || UNCLASSIFIED
    const ops = [
      { tool: 'erd_set_database', args: { value: 'PostgreSQL' } },
      { tool: 'erd_set_database_name', args: { value: a.dbName } },
      { tool: 'erd_set_show', args: { show: 'columnUnique', value: true } },
    ]
    for (const t of doc.tables) {
      const it = invT.get(t.name)
      const src = ddlModel.tables.get(t.name)
      ops.push({ tool: 'erd_change_table_comment', args: { tableId: t.id, value: it?.logical_name || t.name } })
      ops.push({ tool: 'erd_change_table_color', args: { tableId: t.id, color: areaOf(t.name).color } })
      for (const c of t.columns) {
        const ic = it?.columns.find((x) => x.name === c.name)
        // 논리명 = 인벤토리, 없으면 DDL 인라인 주석의 첫 구절
        const logical = ic?.logical_name || (src?.inline[c.name] || '').split(/ [(→—]/)[0].trim()
        if (logical && c.comment !== logical) ops.push({ tool: 'erd_change_column_comment', args: { tableId: t.id, columnId: c.id, value: logical } })
        if (ic && normDef(c.default) !== normDef(ic.default)) ops.push({ tool: 'erd_change_column_default', args: { tableId: t.id, columnId: c.id, value: ic.default ?? '' } })
      }
    }
    for (let i = 0; i < ops.length; i += 100) await mcp.call('erd_batch', { path: tmp, operations: ops.slice(i, i + 100) })

    // 3) 주제영역 배치 — 크기는 코멘트 반영 후 erd_list 로 얻는다(자동 정렬은 UI 전용이라 격자 계산)
    const list = await mcp.call('erd_list', { path: tmp, limit: 1000 })
    const sizes = new Map(list.tables.map((t) => [t.name, { width: t.width, height: t.height }]))
    const idOf = new Map(list.tables.map((t) => [t.name, t.id]))
    const invIdx = (n) => { const i = inv.tables.findIndex((t) => t.name === n); return i < 0 ? 1e9 : i }
    const groups = [...AREA, UNCLASSIFIED].map((area) => {
      const names = doc.tables.map((t) => t.name).filter((n) => areaOf(n) === area).sort((p, q) => invIdx(p) - invIdx(q))
      const lines = names.map((n) => `· ${n}  ${invT.get(n)?.logical_name || ''}  — ${phaseOf(ddlModel.tables.get(n))}`)
      const extra = (PLACEHOLDER[area.name] || []).map((v) => ({ value: v, color: area.tint, height: memoH(v) }))
      return { area, tables: names, extraMemos: extra, head: [`■ 주제영역 : ${area.name} (테이블 ${names.length})`, ...lines].join('\n') }
    }).filter((g) => g.tables.length || g.extraMemos.length)

    const colN = doc.tables.reduce((s, t) => s + t.columns.length, 0)
    const docInfo = [
      '[문서 정보]',
      'sitemap.pi 1차 데이터 모델 (sitemaps-data-model)',
      `버전 ${a.modelVer} · ${a.modelDt} · 1.0 DA 최종 승인(04_leader_final-approval_r1) → 1.1 재점검 반영본 DA 재승인 진행(#13)`,
      `정본 : ${a.canonical}`,
      `DBMS : PostgreSQL · 테이블 ${doc.tables.length} · 컬럼 ${colN} · FK 관계 ${doc.rels.length}`,
      `원천 DDL : ${a.sql.map((f) => path.basename(f)).join(' → ')}`,
      RENAME ? '  (000·001 = sys_user 7컬럼 개명 메모리 사본 — 원본 파일 무수정, 정본 §10-2)' : '  (000·001 원본 그대로 — --no-rename)',
      '  (02_modeler_ddl.sql 은 초안 — 운영 적용 금지, 마스터 승인 후 sql/ 로 확정)',
      '생성기 : data-model/erd/gen-sitemaps-erd.mjs — DDL 변경 시 재실행으로 갱신',
    ].join('\n')
    const top = [
      { value: docInfo, color: DOC_COLOR, x: L.left, y: 20, width: 1000, height: memoH(docInfo) },
      { value: NOTES, color: NOTE_COLOR, x: L.left + 1060, y: 20, width: 1600, height: memoH(NOTES) },
    ]
    const lay = layout(groups, sizes, 20 + Math.max(...top.map((m) => m.height)) + L.areaGapY)

    const ops2 = [{ tool: 'erd_move_tables', args: { positions: lay.tables.map((p) => ({ tableId: idOf.get(p.name), x: p.x, y: p.y })) } }]
    for (const [i, m] of [...top, ...lay.memos].entries()) {
      const as = `m${i}`
      ops2.push({ tool: 'erd_add_memo', as, args: {} })
      ops2.push({ tool: 'erd_change_memo_value', args: { memoId: `$${as}`, value: m.value } })
      ops2.push({ tool: 'erd_change_memo_color', args: { memoId: `$${as}`, color: m.color } })
      ops2.push({ tool: 'erd_resize_memo', args: { memoId: `$${as}`, width: m.width, height: m.height } })
      ops2.push({ tool: 'erd_move_memo', args: { memoId: `$${as}`, x: m.x, y: m.y } })
    }
    if (ops2.length > 100) throw new Error(`배치 연산 ${ops2.length}개 — 100 초과(메모 배치 분할 필요)`)
    await mcp.call('erd_batch', { path: tmp, operations: ops2 })
    await mcp.call('erd_save', { path: tmp })
  } finally {
    mcp.stop()
  }

  // 4) 최종 검증 — JSON 파싱·개수·인벤토리 전수 대조(기본값 포함)·논리명 누락
  const fin = readDoc(tmp)
  const issues = diffInventory(inv, fin.tables, fin.rels)
  const noComment = fin.tables.flatMap((t) => [!t.comment && t.name, ...t.columns.filter((c) => !c.comment).map((c) => `${t.name}.${c.name}`)]).filter(Boolean)
  if (noComment.length) issues.push(`논리명(코멘트) 없음: ${noComment.join(', ')}`)
  const colN = fin.tables.reduce((s, t) => s + t.columns.length, 0)
  console.log(`[검증] version ${fin.json.version} · database ${fin.json.settings.database} (16=PostgreSQL) · 테이블 ${fin.tables.length} · 컬럼 ${colN} · FK ${fin.rels.length} · 식별 ${fin.rels.filter((r) => r.identification).length} · 메모 ${fin.memos}`)
  console.log(`[검증] 인벤토리 기준 테이블 ${inv.tables.length} · 컬럼 ${inv.tables.reduce((s, t) => s + t.columns.length, 0)} · FK ${inv.relationships.length}`)
  if (issues.length) {
    console.log(`[검증] 차이 ${issues.length}건\n  ${issues.join('\n  ')}`)
    if (a.strict) { console.error(`중단 — 출력 파일을 쓰지 않음(임시본: ${tmp}). --no-strict 로 강제 출력 가능`); process.exit(2) }
  } else console.log('[검증] 인벤토리와 차이 0건')
  fs.mkdirSync(path.dirname(a.out), { recursive: true })
  fs.copyFileSync(tmp, a.out)
  try { fs.rmSync(work, { recursive: true, force: true }) } catch {} // 임시 폴더 정리 실패는 무시
  console.log(`[완료] ${a.out}`)
}

main().catch((e) => { console.error(e.stack || e); process.exit(1) })

// pitel Oracle 물리 DDL 생성기(PRD dbms.pi 11.6 ORA-R01~R03) : model/physical/*.json → ModelPi DDL 생성기(src/lib/modelpi/ddl.ts genDdl, Oracle 프로파일 0001)로
//  표 본문·시스템 칼럼·PK·주석을 만들고, pitel 전용(조각 RANGE·LOCAL 인덱스·부분 인덱스 대체·CLOB)을 덧붙여 영역별 파일로 쓴다
// 실행 : node oracle/ddl-oracle.mjs  → oracle/ddl/<NN>_<영역>_tables.sql·_constraints.sql·ddl_report.md (Node 22.18+ 형 제거 실행으로 .ts 를 바로 import)
// PostgreSQL 판(ddl/*.sql)과 같은 순서 원칙(D14) : 테이블(PK·인덱스 없음) → 적재 → PK·인덱스. DROP 문은 빼고 재실행은 s1.mjs setup(사용자 재생성)이 맡는다
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { genDdl } from '../../src/lib/modelpi/ddl.ts'
import { idxName, pkName } from '../../src/lib/modelpi/phy.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT = path.join(HERE, 'ddl')
const DBMS = '0001' // ORACLE
// 타입 대응 : schema.pi std_tp_map(2026-11-15 조회) — 논리타입 0003 character varying→VARCHAR2, 0001 character→CHAR, 0015 numeric→NUMBER, 0020 timestamp→TIMESTAMP, 0008 text→CLOB
const TP = { VARCHAR: 'VARCHAR2', CHAR: 'CHAR', NUMERIC: 'NUMBER', TIMESTAMP: 'TIMESTAMP' }
// VARCHAR2 상한 4,000바이트(MAX_STRING_SIZE=STANDARD). 한글 3바이트라 n > 1333 글자는 넘칠 수 있어 CLOB(datagen.mjs LOB_CHARS 와 같은 값)
const LOB_CHARS = 1333
const AREA = { PRD: '10_prd', CUS: '20_cus', ORD: '30_ord', PAY: '40_pay', INV: '50_inv', COL: '60_col', PRM: '70_prm' }

const typeOf = dataTp => {
  const m = dataTp.match(/^(\w+)(?:\((\d+)(?:,(\d+))?\))?/)
  return { base: m[1], len: m[2] ? +m[2] : null, scale: m[3] != null ? +m[3] : null }
}

// 조각 절 : PostgreSQL FROM(하한) TO(상한) + DEFAULT → Oracle VALUES LESS THAN(상한) + MAXVALUE. 상한 형식 = 조각 키 타입(PostgreSQL ddl 과 같은 문자열)
function partClause(t) {
  const p = t.partition
  const key = t.cols.find(c => c.colNm === p.key)
  const ty = typeOf(key.dataTp)
  const bound = d => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    if (ty.base === 'TIMESTAMP') return `TIMESTAMP '${y}-${mo}-01 00:00:00'`
    if (ty.base === 'CHAR' && ty.len === 6) return `'${y}${mo}'`
    if (ty.base === 'CHAR' && ty.len === 8) return `'${y}${mo}01'`
    throw new Error(`${t.tblNm} 조각 키 타입 미지원 : ${key.dataTp}`)
  }
  const parts = []
  if (p.unit === 'YEAR') for (let y = +p.from; y <= +p.to; y++) parts.push(`  PARTITION P${y} VALUES LESS THAN (${bound(new Date(Date.UTC(y + 1, 0, 1)))})`)
  else if (p.unit === 'MONTH') {
    const [fy, fm] = p.from.split('-').map(Number), [ty_, tm] = p.to.split('-').map(Number)
    for (let y = fy, m = fm; y < ty_ || (y === ty_ && m <= tm); m === 12 ? (y++, (m = 1)) : m++) parts.push(`  PARTITION P${y}${String(m).padStart(2, '0')} VALUES LESS THAN (${bound(new Date(Date.UTC(y, m, 1)))})`)
  } else throw new Error(`${t.tblNm} 조각 단위 미지원 : ${p.unit}`)
  if (p.dflt) parts.push('  PARTITION PDEF VALUES LESS THAN (MAXVALUE)')
  return { sql: `PARTITION BY RANGE (${p.key}) (\n${parts.join(',\n')}\n)`, n: parts.length }
}

// 보조 인덱스 : 부분 인덱스(WHERE)는 Oracle 에 없음 → ① 'c IS NOT NULL' + 인덱스 칼럼 = [c] 는 일반 인덱스(Oracle B-tree 는 키가 모두 NULL 인 행을 담지 않아 같은 결과)
//  ② 나머지는 함수 기반 인덱스(CASE WHEN 조건 THEN 칼럼 END) — 조건이 거짓인 행은 키가 모두 NULL 이라 빠져 크기·내용이 부분 인덱스와 같다(질의도 같은 식을 써야 탄다)
function indexStmt(t, x, n, local, rep) {
  const nm = idxName(DBMS, t.tblNm, n)
  if (nm !== x.nm) rep.cut.push(`${x.nm} → ${nm}`)
  let cols = x.cols.join(', ')
  if (x.where) {
    const m = x.where.trim().match(/^(\w+)\s+IS\s+NOT\s+NULL$/i)
    if (m && x.cols.length === 1 && x.cols[0].toUpperCase() === m[1].toUpperCase()) rep.partEq++
    else {
      // 일시 문자열 비교는 Oracle 에서 NLS 형식 암묵 변환(ORA-01847, 함수 기반 인덱스는 결정적 식만) → TIMESTAMP 리터럴
      const cond = x.where.trim().replace(/'(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})'/g, "TIMESTAMP '$1'")
      if (cond !== x.where.trim()) rep.tsLit.push(`${nm} : ${x.where.trim()} → ${cond}`)
      cols = x.cols.map(c => `CASE WHEN ${cond} THEN ${c} END`).join(', ')
      rep.partFn.push(`${nm} : ${x.where.trim()}`)
    }
  }
  return `CREATE ${x.unq ? 'UNIQUE ' : ''}INDEX ${nm} ON ${t.tblNm} (${cols})${local ? ' LOCAL' : ''};`
}

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const rep = { tables: 0, parts: 0, partTbl: 0, pk: 0, idx: 0, partEq: 0, partFn: [], tsLit: [], lob: [], cut: [], dflt: [] }
  const at = new Date().toISOString().slice(0, 10)
  for (const f of fs.readdirSync(path.join(ROOT, 'model/physical')).sort((a, b) => AREA[a.slice(0, 3)].localeCompare(AREA[b.slice(0, 3)]))) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'model/physical', f), 'utf8'))
    const tbls = [], cons = []
    for (const t of j.tables) {
      const pkCols = t.pk?.cols ?? []
      const ddlTbl = {
        ent_id: t.entId,
        tbl_nm: t.tblNm,
        tbl_desc: t.entNm,
        cols: t.cols.map((c, i) => {
          const ty = typeOf(c.dataTp)
          const lob = ty.base === 'VARCHAR' && ty.len > LOB_CHARS
          if (lob) rep.lob.push(`${t.tblNm}.${c.colNm} ${c.dataTp} → CLOB`)
          if (c.dflt != null) rep.dflt.push(`${t.tblNm}.${c.colNm} DEFAULT ${c.dflt}`)
          return {
            attr_id: `${t.entId}:${c.colNm}`, sys_col_yn: 'N', col_nm: c.colNm, col_seq: i + 1, dom_id: null, dom_ver_no: null,
            phy_tp_nm: lob ? 'CLOB' : TP[ty.base], data_len: lob ? null : ty.len, data_scale: lob ? null : ty.scale,
            null_yn: c.nullYn ? 'Y' : 'N', bsc_val_txt: c.dflt != null ? String(c.dflt) : null,
            pk_yn: pkCols.includes(c.colNm) ? 'Y' : 'N', pk_seq: pkCols.includes(c.colNm) ? pkCols.indexOf(c.colNm) + 1 : null, col_desc: c.attrNm,
          }
        }),
      }
      if (!ddlTbl.cols.every(c => c.phy_tp_nm)) throw new Error(`${t.tblNm} 타입 대응 없음`)
      const ddl = genDdl({ dbms: DBMS, ltr: 'UPPER', tables: [ddlTbl], fks: [], src: new Map(), fkOf: new Map() }, { prjNm: 'Pi통신 과금', at })
      const part = t.partition ? partClause(t) : null
      // genDdl 문장 분류 : 머리 주석·DROP 제외, CREATE TABLE·COMMENT → 테이블 단계, PK 인덱스·제약 → 제약 단계
      const stmts = ddl.split(/;\n/).map(s => s.trim()).filter(s => s && !s.split('\n').every(l => l.startsWith('--')))
      const body = [`-- ${t.entId} ${t.entNm} · 예상 ${(+t.estRows || 0).toLocaleString()}행${part ? ` · ${t.partition.unit === 'YEAR' ? '연' : '월'} RANGE ${t.partition.key} 조각 ${part.n}개` : ''}`]
      for (let s of stmts) {
        s = s.split('\n').filter(l => !l.startsWith('--')).join('\n').trim()
        if (/^DROP TABLE/.test(s)) continue
        if (/^CREATE TABLE/.test(s)) body.push(part ? s.replace(/\)$/, `)\n${part.sql};`) : `${s};`)
        else if (/^COMMENT/.test(s)) body.push(`${s};`)
        else if (/^CREATE UNIQUE INDEX PK_/.test(s)) cons.push(`${s}${part ? ' LOCAL' : ''};`)
        else if (/^ALTER TABLE .* PRIMARY KEY/.test(s)) cons.push(`${s};`)
        else throw new Error(`분류 못 한 문장 : ${s.slice(0, 80)}`)
      }
      if (pkName(DBMS, t.tblNm) !== `PK_${t.tblNm}`) rep.cut.push(`PK_${t.tblNm} → ${pkName(DBMS, t.tblNm)}`)
      ;(t.idx || []).forEach(x => {
        const n = +x.nm.match(/_(\d+)$/)[1]
        cons.push(indexStmt(t, x, n, !!part, rep))
        rep.idx++
      })
      tbls.push(body.join('\n'))
      rep.tables++
      rep.pk += pkCols.length ? 1 : 0
      if (part) (rep.parts += part.n), rep.partTbl++
    }
    const a = AREA[j.area]
    const head = (kind, what) => `-- ${a}_${kind}.sql : ${j.area}(${j.areaNm}) ${what} — Oracle 판, ModelPi genDdl(Oracle 0001) + pitel 조각·인덱스 규칙(oracle/ddl-oracle.mjs 생성 ${at}, 직접 수정 금지)\n-- 실행 : node oracle/s1.mjs ${kind === 'tables' ? 'tables' : 'constraints'} --target oracle (세션 NLS_LENGTH_SEMANTICS = CHAR)\n\n`
    fs.writeFileSync(path.join(OUT, `${a}_tables.sql`), head('tables', '테이블·주석(PK·인덱스 없음)') + tbls.join('\n\n') + '\n')
    fs.writeFileSync(path.join(OUT, `${a}_constraints.sql`), head('constraints', 'PK·인덱스(적재 뒤)') + cons.join('\n') + '\n')
  }
  const md = [
    `# Oracle DDL 생성 보고 (${at})`,
    '',
    '생성 : `node oracle/ddl-oracle.mjs` · 원천 : `model/physical/*.json` · 엔진 : schema.pi ModelPi `genDdl`(Oracle 0001)',
    '',
    '| 항목 | 값 |',
    '|---|---:|',
    `| 테이블 | ${rep.tables} |`,
    `| 조각 테이블 · 조각 | ${rep.partTbl} · ${rep.parts} |`,
    `| PK | ${rep.pk} |`,
    `| 보조 인덱스 | ${rep.idx} |`,
    `| 부분 인덱스 → 일반 인덱스(같은 결과) | ${rep.partEq} |`,
    `| 부분 인덱스 → 함수 기반 인덱스 | ${rep.partFn.length} |`,
    `| CLOB 으로 바꾼 칼럼 | ${rep.lob.length} |`,
    `| 30자 한도로 줄인 이름 | ${rep.cut.length} |`,
    '',
    '## 30자 한도로 줄인 이름',
    ...rep.cut.map(x => `- ${x}`),
    '',
    '## CLOB 칼럼',
    ...rep.lob.map(x => `- ${x}`),
    '',
    '## 함수 기반 인덱스로 바꾼 부분 인덱스',
    ...rep.partFn.map(x => `- ${x}`),
    '',
    '## 일시 문자열 → TIMESTAMP 리터럴',
    ...rep.tsLit.map(x => `- ${x}`),
    '',
    '## 기본값',
    ...rep.dflt.map(x => `- ${x}`),
    '',
  ]
  fs.writeFileSync(path.join(OUT, 'ddl_report.md'), md.join('\n'))
  console.log(JSON.stringify({ ...rep, partFn: rep.partFn.length, lob: rep.lob.length, cut: rep.cut, dflt: rep.dflt.length }))
}

main()

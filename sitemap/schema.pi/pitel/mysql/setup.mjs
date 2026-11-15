// MySQL 판 준비(PRD dbms.pi 11.7 대상 ③) : 버퍼 풀·redo 설정 → pitel DB 재생성(utf8mb4) → 키 생성용 숫자표 pitel_seq(0~99,999) → 테이블 214개·파티션 2,306개
// DDL 은 model/physical/*.json 에서 직접 만든다(ModelPi 에 MySQL 프로파일 없음). 테이블 이름은 소문자(Linux MySQL 은 이름 대소문자 구분, datagen 이 소문자로 넣음)
// 시스템 칼럼 4개는 맨 끝, PK·인덱스는 적재 뒤 단계라 만들지 않는다
// 실행 : node mysql/setup.mjs --yes (기존 pitel DB 를 지우고 다시 만든다). DDL 만 : --ddl-only → mysql/ddl/tables.sql
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { my, rows } from './my.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const C = {
  bufferPoolMb: 3072, // Oracle SGA 3GB · MS-SQL 시험 메모리 상한과 같은 규모
  redoMb: 16384, // PostgreSQL max_wal_size 16GB · Oracle redo 4GB × 4 와 맞춤
  rowMax: 65535, // InnoDB 한 행 최대(TEXT 제외)
}
const AREA = { PRD: '10', CUS: '20', ORD: '30', PAY: '40', INV: '50', COL: '60', PRM: '70' }
const SYS = [
  'lst_mddtm DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)',
  "lst_mdfr_id VARCHAR(50) NOT NULL DEFAULT 'ADMIN'",
  'lst_rgdtm DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)',
  "lst_rgtr_id VARCHAR(50) NOT NULL DEFAULT 'ADMIN'",
]
const typeOf = dataTp => {
  const m = dataTp.match(/^(\w+)(?:\((\d+)(?:,(\d+))?\))?/)
  return { base: m[1], len: m[2] ? +m[2] : null, scale: m[3] != null ? +m[3] : null }
}
// utf8mb4 : VARCHAR(n)·CHAR(n) 의 n 은 글자 수(PostgreSQL·Oracle 과 같은 의미)
const myType = (ty, text) => {
  if (ty.base === 'VARCHAR') return text ? 'TEXT' : `VARCHAR(${ty.len})`
  if (ty.base === 'CHAR') return `CHAR(${ty.len})`
  if (ty.base === 'NUMERIC') return ty.scale != null ? `DECIMAL(${ty.len},${ty.scale})` : `DECIMAL(${ty.len})`
  if (ty.base === 'TIMESTAMP') return 'DATETIME(6)'
  throw new Error(`타입 대응 없음 : ${ty.base}`)
}
// 한 행 최대 바이트(utf8mb4 4바이트) : 넘으면 긴 VARCHAR 부터 TEXT 로
const maxBytes = ty => (ty.base === 'VARCHAR' ? ty.len * 4 + 2 : ty.base === 'CHAR' ? ty.len * 4 : ty.base === 'NUMERIC' ? Math.ceil(ty.len / 2) + 1 : 8)

function partition(t) {
  const p = t.partition
  const ty = typeOf(t.cols.find(c => c.colNm === p.key).dataTp)
  const lit = d => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    if (ty.base === 'TIMESTAMP') return `'${y}-${mo}-01 00:00:00'`
    if (ty.base === 'CHAR' && ty.len === 6) return `'${y}${mo}'`
    if (ty.base === 'CHAR' && ty.len === 8) return `'${y}${mo}01'`
    throw new Error(`${t.tblNm} 파티션 키 타입 미지원`)
  }
  const parts = []
  if (p.unit === 'YEAR') for (let y = +p.from; y <= +p.to; y++) parts.push(`  PARTITION p${y} VALUES LESS THAN (${lit(new Date(Date.UTC(y + 1, 0, 1)))})`)
  else {
    const [fy, fm] = p.from.split('-').map(Number), [ty_, tm] = p.to.split('-').map(Number)
    for (let y = fy, m = fm; y < ty_ || (y === ty_ && m <= tm); m === 12 ? (y++, (m = 1)) : m++) parts.push(`  PARTITION p${y}${String(m).padStart(2, '0')} VALUES LESS THAN (${lit(new Date(Date.UTC(y, m, 1)))})`)
  }
  if (p.dflt) parts.push('  PARTITION pdef VALUES LESS THAN (MAXVALUE)')
  return { n: parts.length, sql: `\nPARTITION BY RANGE COLUMNS (${p.key.toLowerCase()}) (\n${parts.join(',\n')}\n)` }
}

function genDdl() {
  const out = []
  let tables = 0, parts = 0
  const text = []
  for (const f of fs.readdirSync(path.join(ROOT, 'model/physical')).sort((a, b) => AREA[a.slice(0, 3)].localeCompare(AREA[b.slice(0, 3)]))) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'model/physical', f), 'utf8'))
    for (const t of j.tables) {
      const tys = t.cols.map(c => typeOf(c.dataTp))
      const toText = new Set()
      let sum = tys.reduce((s, ty) => s + maxBytes(ty), 0) + 2 * 8 + 2 * 202
      for (const i of tys.map((ty, i) => i).filter(i => tys[i].base === 'VARCHAR').sort((a, b) => tys[b].len - tys[a].len)) {
        if (sum <= C.rowMax) break
        toText.add(i)
        sum -= maxBytes(tys[i]) - 12
        text.push(`${t.tblNm}.${t.cols[i].colNm} ${t.cols[i].dataTp}`)
      }
      const cols = t.cols.map((c, i) => `  ${c.colNm.toLowerCase().padEnd(30)} ${myType(tys[i], toText.has(i))}${c.nullYn ? '' : ' NOT NULL'}`)
      const pt = t.partition ? partition(t) : null
      out.push(`-- ${t.entId} ${t.entNm}${pt ? ` · 파티션 ${pt.n}개` : ''}`)
      out.push(`CREATE TABLE ${t.tblNm.toLowerCase()} (\n${[...cols, ...SYS.map(s => '  ' + s)].join(',\n')}\n) ENGINE=InnoDB${pt ? pt.sql : ''};`)
      tables++
      parts += pt ? pt.n : 1
    }
  }
  return { sql: out.join('\n') + '\n', tables, parts, text }
}

async function main() {
  const d = genDdl()
  fs.mkdirSync(path.join(HERE, 'ddl'), { recursive: true })
  fs.writeFileSync(path.join(HERE, 'ddl/tables.sql'), `-- MySQL 판 테이블 ${d.tables}개 · 파티션 ${d.parts}개(파티션 없는 테이블은 1칸) · 행 크기 한도로 TEXT 로 바꾼 칼럼 ${d.text.length}개 : mysql/setup.mjs 생성, 직접 수정 금지\n` + d.sql)
  console.log(`DDL : 테이블 ${d.tables} · 파티션(1칸 포함) ${d.parts} · TEXT 로 바꾼 칼럼 ${d.text.length}${d.text.length ? ` (${d.text.join(', ')})` : ''}`)
  if (process.argv.includes('--ddl-only')) return
  if (!process.argv.includes('--yes')) throw new Error('기존 pitel DB 를 지우고 다시 만든다 : --yes 필요')
  await my(`SET PERSIST innodb_buffer_pool_size = ${C.bufferPoolMb * 1048576}; SET PERSIST innodb_redo_log_capacity = ${C.redoMb * 1048576};
DROP DATABASE IF EXISTS pitel; CREATE DATABASE pitel CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, { db: '' })
  // 키 생성용 숫자표(준비 단계) : 0~99,999
  await my(`CREATE TABLE pitel_seq (n INT NOT NULL PRIMARY KEY) ENGINE=InnoDB;
SET SESSION cte_max_recursion_depth = 100000;
INSERT INTO pitel_seq WITH RECURSIVE s(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM s WHERE n < 99999) SELECT n FROM s;`)
  const t = Date.now()
  await my(d.sql)
  const chk = rows(await my(`SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'pitel' AND TABLE_NAME LIKE 'ptl\\_%'; SELECT COUNT(*) FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = 'pitel' AND TABLE_NAME LIKE 'ptl\\_%'; SELECT COUNT(*) FROM pitel_seq; SELECT @@innodb_buffer_pool_size / 1048576, @@innodb_redo_log_capacity / 1048576;`))
  console.log(`DB 재생성 · 테이블 ${chk[0]} · 파티션 ${chk[1]} · 숫자표 ${chk[2]}행 · 버퍼 풀·redo(MB) ${chk[3]} · DDL ${((Date.now() - t) / 1000).toFixed(1)}초`)
}
main().catch(e => {
  console.error(e.message)
  process.exit(1)
})

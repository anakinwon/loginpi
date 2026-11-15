// MS-SQL 판 준비(PRD dbms.pi 11.7 대상 ②) : 서버 메모리 설정 → pitel DB 재생성(UTF-8 정렬·SIMPLE 복구) → 테이블 214개·파티션 2,306개 생성
// DDL 은 model/physical/*.json 에서 직접 만든다(ModelPi 에 MS-SQL 프로파일 없음). 시스템 칼럼 4개는 PostgreSQL·Oracle 판처럼 맨 끝, PK·인덱스는 적재 뒤 단계라 만들지 않는다
// 실행 : node mssql/setup.mjs --yes   (기존 pitel DB 를 지우고 다시 만든다). DDL 만 : node mssql/setup.mjs --ddl-only → mssql/ddl/tables.sql
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ms, rows } from './ms.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const C = {
  maxMemMb: 4317, // Oracle 실증의 SGA 3,072MB + PGA 1,317MB 합과 맞춤(2026-11-15)
  collation: 'Korean_100_CI_AS_SC_UTF8',
  dataGb: 8,
  logGb: 16, // PostgreSQL max_wal_size 16GB · Oracle redo 4GB × 4 와 맞춤
  growGb: 4, // Oracle AUTOEXTEND NEXT 4G 와 맞춤
  vmax: 8000, // varchar(n) 바이트 상한 : UTF-8 한글 3바이트라 n × 3 이 넘으면 varchar(max)
}
const AREA = { PRD: '10', CUS: '20', ORD: '30', PAY: '40', INV: '50', COL: '60', PRM: '70' }
const SYS = [
  'LST_MDDTM datetime2(6) NOT NULL DEFAULT SYSDATETIME()',
  "LST_MDFR_ID varchar(150) NOT NULL DEFAULT 'ADMIN'",
  'LST_RGDTM datetime2(6) NOT NULL DEFAULT SYSDATETIME()',
  "LST_RGTR_ID varchar(150) NOT NULL DEFAULT 'ADMIN'",
]
const typeOf = dataTp => {
  const m = dataTp.match(/^(\w+)(?:\((\d+)(?:,(\d+))?\))?/)
  return { base: m[1], len: m[2] ? +m[2] : null, scale: m[3] != null ? +m[3] : null }
}
const msType = ty => {
  if (ty.base === 'VARCHAR') return ty.len * 3 > C.vmax ? 'varchar(max)' : `varchar(${ty.len * 3})`
  // CHAR(n) = n 글자(PostgreSQL·Oracle 과 같은 의미) : UTF-8 char(n) 은 바이트라 한글이 넘쳐 nchar(n)(2026-11-15 마스터 선택)
  if (ty.base === 'CHAR') return `nchar(${ty.len})`
  if (ty.base === 'NUMERIC') return ty.scale != null ? `decimal(${ty.len},${ty.scale})` : `decimal(${ty.len})`
  if (ty.base === 'TIMESTAMP') return 'datetime2(6)'
  throw new Error(`타입 대응 없음 : ${ty.base}`)
}

// 파티션 : Oracle 판과 같은 개수. 경계값은 한 줄에 하나(sqlcmd 가 약 4,000자 넘는 줄을 잘라 형 변환 오류) RANGE RIGHT 경계 = 각 파티션 상한(VALUES LESS THAN) → 마지막 칸이 MAXVALUE 역할
function partition(t) {
  const p = t.partition
  const ty = typeOf(t.cols.find(c => c.colNm === p.key).dataTp)
  const lit = d => {
    const y = d.getUTCFullYear(), mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    if (ty.base === 'TIMESTAMP') return `'${y}-${mo}-01T00:00:00'`
    if (ty.base === 'CHAR' && ty.len === 6) return `'${y}${mo}'`
    if (ty.base === 'CHAR' && ty.len === 8) return `'${y}${mo}01'`
    throw new Error(`${t.tblNm} 파티션 키 타입 미지원`)
  }
  const b = []
  if (p.unit === 'YEAR') for (let y = +p.from; y <= +p.to; y++) b.push(lit(new Date(Date.UTC(y + 1, 0, 1))))
  else {
    const [fy, fm] = p.from.split('-').map(Number), [ty_, tm] = p.to.split('-').map(Number)
    for (let y = fy, m = fm; y < ty_ || (y === ty_ && m <= tm); m === 12 ? (y++, (m = 1)) : m++) b.push(lit(new Date(Date.UTC(y, m, 1))))
  }
  // dflt 없으면 마지막 상한을 빼서 칸 수를 Oracle 과 같게(마지막 칸이 상한 없는 칸)
  const bounds = p.dflt ? b : b.slice(0, -1)
  const keyTp = msType(ty)
  return {
    n: bounds.length + 1,
    pre: `CREATE PARTITION FUNCTION PF_${t.tblNm} (${keyTp}) AS RANGE RIGHT FOR VALUES (\n  ${bounds.join(',\n  ')}\n);\nCREATE PARTITION SCHEME PS_${t.tblNm} AS PARTITION PF_${t.tblNm} ALL TO ([PRIMARY]);`,
    on: ` ON PS_${t.tblNm} (${p.key})`,
  }
}

function genDdl() {
  const out = []
  let tables = 0, parts = 0, max = 0
  for (const f of fs.readdirSync(path.join(ROOT, 'model/physical')).sort((a, b) => AREA[a.slice(0, 3)].localeCompare(AREA[b.slice(0, 3)]))) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'model/physical', f), 'utf8'))
    for (const t of j.tables) {
      const pt = t.partition ? partition(t) : null
      const cols = t.cols.map(c => {
        const ty = msType(typeOf(c.dataTp))
        if (ty === 'varchar(max)') max++
        return `  ${c.colNm.padEnd(30)} ${ty}${c.nullYn ? '' : ' NOT NULL'}`
      })
      out.push(`-- ${t.entId} ${t.entNm}${pt ? ` · 파티션 ${pt.n}개` : ''}`)
      if (pt) out.push(pt.pre)
      out.push(`CREATE TABLE ${t.tblNm} (\n${[...cols, ...SYS.map(s => '  ' + s)].join(',\n')}\n)${pt ? pt.on : ''};`)
      tables++
      parts += pt ? pt.n : 1
    }
  }
  return { sql: out.join('\n') + '\n', tables, parts, max }
}

async function main() {
  const d = genDdl()
  fs.mkdirSync(path.join(HERE, 'ddl'), { recursive: true })
  fs.writeFileSync(path.join(HERE, 'ddl/tables.sql'), `-- MS-SQL 판 테이블 ${d.tables}개 · 파티션 ${d.parts}개(조각 없는 테이블은 1칸) · varchar(max) ${d.max}칼럼 : mssql/setup.mjs 생성, 직접 수정 금지\n` + d.sql)
  console.log(`DDL : 테이블 ${d.tables} · 파티션(1칸 포함) ${d.parts} · varchar(max) 칼럼 ${d.max}`)
  if (process.argv.includes('--ddl-only')) return
  if (!process.argv.includes('--yes')) throw new Error('기존 pitel DB 를 지우고 다시 만든다 : --yes 필요')
  await ms(`EXEC sp_configure 'show advanced options', 1; RECONFIGURE; EXEC sp_configure 'max server memory (MB)', ${C.maxMemMb}; RECONFIGURE;`, { db: 'master' })
  await ms(`IF DB_ID('pitel') IS NOT NULL BEGIN ALTER DATABASE pitel SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE pitel; END
CREATE DATABASE pitel ON (NAME = pitel_data, FILENAME = '/var/opt/mssql/data/pitel.mdf', SIZE = ${C.dataGb}GB, FILEGROWTH = ${C.growGb}GB)
LOG ON (NAME = pitel_log, FILENAME = '/var/opt/mssql/data/pitel_log.ldf', SIZE = ${C.logGb}GB, FILEGROWTH = ${C.growGb}GB)
COLLATE ${C.collation};
ALTER DATABASE pitel SET RECOVERY SIMPLE;`, { db: 'master' })
  const t = Date.now()
  await ms(d.sql)
  const chk = rows(await ms(`SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'PTL[_]%'; SELECT COUNT(*) FROM sys.partitions p JOIN sys.tables t ON t.object_id = p.object_id WHERE t.name LIKE 'PTL[_]%' AND p.index_id IN (0, 1);`))
  console.log(`DB 재생성 · 테이블 ${chk[0]} · 파티션 ${chk[1]} · DDL ${((Date.now() - t) / 1000).toFixed(1)}초`)
}
main().catch(e => {
  console.error(e.message)
  process.exit(1)
})

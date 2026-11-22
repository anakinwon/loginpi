// 시나리오 S1 실행기(PRD dbms.pi 11.6) : Oracle 물리모델 → 기존 생성기로 초기 데이터 구축, 같은 배율 PostgreSQL 과 단계별 시간·결과를 같은 방식으로 재고 대조
// 실행 : node oracle/s1.mjs <단계> --target pg|oracle [--scale 0.01] [--jobs 6]
//        단계 = setup · tables · gen · load · constraints · stats · verify · all(앞 7단계 순서대로)
//        node oracle/s1.mjs fncheck   생성 함수 21개를 키 10,000개로 PG ↔ Oracle 대조(ORA-R04)
//        node oracle/s1.mjs compare   두 DB 테이블별 건수·행 체크섬·칼럼 체크섬 대조(ORA-R06)
//        node oracle/s1.mjs report    단계별 시간·결과 비교표(markdown) 출력 → oracle/S1_LOG.md 에 옮김
// 기록 : oracle/out/s1_<target>.json(단계별 시작·끝·초) · s1_<target>_verify.json · s1_fncheck.json · s1_compare.json (oracle/out 은 gitignore)
// PostgreSQL 대상 = pitel-pg 의 DB pitel_dev 스키마 ptl_s001(운영 pitel DB 는 건드리지 않음), Oracle 대상 = oracle21c PDB ORCLPDB 사용자 PITEL
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ORA, ora, oraPwd, rows } from './ora.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUTD = path.join(HERE, 'out')
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k)
  return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]
}
const C = {
  pgCt: 'pitel-pg',
  pgDb: 'pitel_dev',
  pgSchema: 'ptl_s001',
  scale: +arg('scale', 0.01),
  jobs: +arg('jobs', 6),
  conConc: 3, // PK·인덱스 동시 영역 수(rebuild.mjs CON_CONC 와 같은 값)
  conOrder: ['40_pay', '60_col', '50_inv', '30_ord', '20_cus', '70_prm', '10_prd'], // 큰 영역 먼저(rebuild.mjs CON 과 같은 순서)
  areas: ['10_prd', '20_cus', '30_ord', '40_pay', '50_inv', '60_col', '70_prm'],
  cmpConc: 4,
  lobChars: 1333,
}
const STEPS = ['setup', 'tables', 'gen', 'load', 'constraints', 'stats', 'verify']
fs.mkdirSync(OUTD, { recursive: true })

// ---------- 실행 도우미 ----------
function sh(cmd, args, input) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args)
    let out = ''
    let err = ''
    p.stdout.setEncoding('utf8') // 한글이 data 조각 경계에서 갈리지 않게
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('error', rej)
    p.on('close', code => (code === 0 ? res(out) : rej(new Error((err || out).trim().slice(-1500)))))
    if (input != null) p.stdin.end(input)
  })
}
const psql = (sql, db = C.pgDb) => sh('docker', ['exec', '-i', C.pgCt, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At'], sql)
async function pool(items, n, fn) {
  const q = [...items]
  const out = []
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    while (q.length) {
      const it = q.shift()
      out.push(await fn(it))
    }
  }))
  return out
}
const model = () => {
  const tables = []
  for (const f of fs.readdirSync(path.join(ROOT, 'model/physical')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'model/physical', f), 'utf8'))
    for (const t of j.tables) tables.push({ ...t, area: j.area })
  }
  return tables
}
const planN = () => {
  // 목표 행 : datagen plan 과 같은 계산(같은 배율이면 두 DB 같음)
  const out = spawnSyncNode(['datagen/datagen.mjs', 'plan', '--scale', String(C.scale)])
  if (!out.ok) throw new Error('datagen plan 실패')
  return new Map(JSON.parse(fs.readFileSync(path.join(ROOT, 'datagen/out/plan.json'), 'utf8')).map(p => [p.tbl.toUpperCase(), p.n]))
}
function spawnSyncNode(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' })
  return { ok: r.status === 0, out: r.stdout + r.stderr }
}
const runNode = (args, logFile) =>
  new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { cwd: ROOT })
    const log = fs.createWriteStream(logFile)
    let last = ''
    const on = d => {
      log.write(d)
      last = (last + d).slice(-4000)
      for (const l of String(d).split('\n')) if (/^(진행|끝|실패|조각)/.test(l)) console.log('   ' + l)
    }
    p.stdout.on('data', on)
    p.stderr.on('data', on)
    p.on('close', code => {
      log.end()
      code === 0 ? res(last) : rej(new Error(last.slice(-1500)))
    })
  })

// ---------- 기록 ----------
const tlFile = t => path.join(OUTD, `s1_${t}.json`)
const readTl = t => (fs.existsSync(tlFile(t)) ? JSON.parse(fs.readFileSync(tlFile(t), 'utf8')) : { target: t, scale: C.scale, steps: {} })
function saveStep(t, id, rec) {
  const tl = readTl(t)
  tl.scale = C.scale
  tl.steps[id] = rec
  fs.writeFileSync(tlFile(t), JSON.stringify(tl, null, 2))
}
async function timed(t, id, fn) {
  const start = new Date()
  console.log(`▶ ${t} ${id} 시작 ${start.toISOString()}`)
  try {
    const note = await fn()
    const end = new Date()
    const sec = (end - start) / 1000
    saveStep(t, id, { start: start.toISOString(), end: end.toISOString(), sec, ok: true, note: note ?? null })
    console.log(`■ ${t} ${id} 끝 ${sec.toFixed(1)}초${note ? ' · ' + (typeof note === 'string' ? note : JSON.stringify(note)) : ''}`)
  } catch (e) {
    const end = new Date()
    saveStep(t, id, { start: start.toISOString(), end: end.toISOString(), sec: (end - start) / 1000, ok: false, err: e.message.slice(0, 2000) })
    throw e
  }
}

// ---------- 단계 : PostgreSQL ----------
const PG = {
  async setup() {
    const ex = (await psql(`SELECT count(*) FROM pg_namespace WHERE nspname = '${C.pgSchema}';`)).trim()
    if (ex === '1') {
      // 조각 2,306개를 한 번에 지우면 잠금 수 초과(REBUILD.md 10절) → 최상위 테이블별로 지운 뒤 스키마
      const tbls = rows(await psql(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${C.pgSchema}' AND c.relkind IN ('r','p') AND NOT c.relispartition;`))
      for (const t of tbls) await psql(`DROP TABLE IF EXISTS ${C.pgSchema}.${t} CASCADE;`)
      await psql(`DROP SCHEMA ${C.pgSchema} CASCADE;`)
    }
    await psql(`CREATE SCHEMA ${C.pgSchema};`)
    clearState('pitel_dev', C.pgSchema)
    return ex === '1' ? '기존 스키마 지우고 다시 만듦' : '새로 만듦'
  },
  async tables() {
    for (const a of C.areas) await psql(`SET search_path = ${C.pgSchema};\n` + fs.readFileSync(path.join(ROOT, 'ddl', `${a}_tables.sql`), 'utf8'))
  },
  async gen() {
    await psql(fs.readFileSync(path.join(ROOT, 'datagen/00_gen_functions.sql'), 'utf8'))
  },
  async load() {
    return (await runNode(['datagen/datagen.mjs', 'run', '--db', 'dev', '--schema', C.pgSchema, '--scale', String(C.scale), '--jobs', String(C.jobs)], path.join(OUTD, 's1_pg_load.log'))).match(/끝 · .*/)?.[0]
  },
  async constraints() {
    await pool(C.conOrder, C.conConc, a => psql(`SET search_path = ${C.pgSchema};\nSET maintenance_work_mem = '1GB';\n` + fs.readFileSync(path.join(ROOT, 'ddl', `${a}_constraints.sql`), 'utf8')))
  },
  async stats() {
    await psql('ANALYZE;')
  },
  async verify() {
    const tbls = rows(await psql(`SELECT upper(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${C.pgSchema}' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY 1;`))
    const cnt = Object.fromEntries(await pool(tbls, C.cmpConc, async t => [t, +(await psql(`SELECT count(*) FROM ${C.pgSchema}.${t.toLowerCase()};`)).trim()]))
    const [parts, pk, idx, bytes, dflt] = await Promise.all([
      psql(`SELECT count(*) FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${C.pgSchema}' AND c.relkind = 'r';`),
      psql(`SELECT count(*) FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = '${C.pgSchema}' AND k.contype = 'p' AND k.conparentid = 0;`),
      psql(`SELECT count(*) FROM pg_indexes WHERE schemaname = '${C.pgSchema}' AND indexname LIKE 'x\\_%';`),
      psql(`SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${C.pgSchema}' AND c.relkind = 'r';`),
      // DEFAULT 조각 행 수(정확 건수) : 38개 조각 합계. 이름이 영역마다 _pdef·_pdflt·_def 로 달라 경계식(DEFAULT)으로 찾는다
      psql(`SELECT string_agg(format('SELECT count(*) FROM %I.%I', n.nspname, c.relname), ' UNION ALL ') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = '${C.pgSchema}' AND pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT';`).then(async q => {
        const r = rows(await psql(q.trim() + ';'))
        return `${r.reduce((s, x) => s + +x, 0)}/${r.length}`
      }),
    ])
    return finishVerify('pg', cnt, { parts: +parts.trim(), pk: +pk.trim(), idx: +idx.trim(), bytes: +bytes.trim(), defaultRows: dflt.trim() })
  },
}

// ---------- 단계 : Oracle ----------
const OR = {
  async setup() {
    if (!/^oracle21c$|^pitel-ora/.test(ORA.container)) throw new Error(`로컬 실증 컨테이너만 허용 : ${ORA.container}`)
    const pwd = oraPwd(true)
    const ex = rows(await ora(`SELECT COUNT(*) FROM dba_users WHERE username = '${ORA.user}';`, { sysdba: true }))[0]?.trim()
    // OMF(db_create_file_dest) 미설정 이미지 → 데이터 파일 경로는 PDB USERS 파일과 같은 폴더
    const dir = rows(await ora("SELECT SUBSTR(file_name, 1, INSTR(file_name, '/', -1)) FROM dba_data_files WHERE tablespace_name = 'USERS';", { sysdba: true }))[0]
    if (!/^\/[\w/]+\/$/.test(dir || '')) throw new Error(`데이터 파일 폴더 확인 실패 : ${dir}`)
    await ora(
      `BEGIN
  FOR r IN (SELECT 1 FROM dba_users WHERE username = '${ORA.user}') LOOP EXECUTE IMMEDIATE 'DROP USER ${ORA.user} CASCADE'; END LOOP;
  FOR r IN (SELECT 1 FROM dba_tablespaces WHERE tablespace_name = '${ORA.tbs}') LOOP EXECUTE IMMEDIATE 'DROP TABLESPACE ${ORA.tbs} INCLUDING CONTENTS AND DATAFILES'; END LOOP;
END;
/
-- 2026-11-22 마스터 : NOLOGGING 기본값 = APPEND(direct-path) 로 데이터 redo 생략, ARCHIVELOG 에서도 새 테이블·LOB 이 상속
CREATE BIGFILE TABLESPACE ${ORA.tbs} DATAFILE '${dir}pitel_data01.dbf' SIZE 1G AUTOEXTEND ON NEXT 4G MAXSIZE UNLIMITED NOLOGGING;
CREATE USER ${ORA.user} IDENTIFIED BY "${pwd}" DEFAULT TABLESPACE ${ORA.tbs} QUOTA UNLIMITED ON ${ORA.tbs};
GRANT CREATE SESSION, CREATE TABLE, CREATE PROCEDURE, CREATE TYPE, CREATE SEQUENCE, CREATE VIEW TO ${ORA.user};
GRANT EXECUTE ON SYS.DBMS_CRYPTO TO ${ORA.user};`,
      { sysdba: true },
    )
    clearState('ora', 'PITEL')
    return ex === '1' ? '기존 사용자·테이블스페이스 지우고 다시 만듦' : '새로 만듦'
  },
  async tables() {
    for (const a of C.areas) await ora(fs.readFileSync(path.join(HERE, 'ddl', `${a}_tables.sql`), 'utf8'))
  },
  async gen() {
    // INTERPRETED + PLSQL_OPTIMIZE_LEVEL 3(하위 프로그램 자동 인라인). NATIVE 는 이 컨테이너에서 ORA-00600 [pesldl03_MMap: errno 1 Operation not permitted](실행 가능 메모리 매핑 차단, 2026-11-15 S1 기록)
    const out = await ora(`ALTER SESSION SET PLSQL_CODE_TYPE = INTERPRETED;\nALTER SESSION SET PLSQL_OPTIMIZE_LEVEL = 3;\n${fs.readFileSync(path.join(HERE, 'gen_pkg.sql'), 'utf8')}\nSELECT name || ' ' || type || ' ' || line || ' ' || text FROM user_errors ORDER BY name, type, sequence;`)
    const errs = rows(out).filter(l => !/^(Type|Package|Package body) created\.?$/i.test(l))
    if (errs.length) throw new Error('GEN 컴파일 오류\n' + errs.join('\n'))
    return 'INTERPRETED·최적화 3 컴파일, 오류 0'
  },
  async load() {
    return (await runNode(['datagen/datagen.mjs', 'run', '--target', 'oracle', '--schema', 'PITEL', '--scale', String(C.scale), '--jobs', String(C.jobs)], path.join(OUTD, 's1_oracle_load.log'))).match(/끝 · .*/)?.[0]
  },
  async constraints() {
    await pool(C.conOrder, C.conConc, a => ora(fs.readFileSync(path.join(HERE, 'ddl', `${a}_constraints.sql`), 'utf8')))
  },
  async stats() {
    await ora(`BEGIN DBMS_STATS.GATHER_SCHEMA_STATS(ownname => '${ORA.user}'); END;\n/`)
  },
  async verify() {
    const tbls = rows(await ora('SELECT table_name FROM user_tables ORDER BY 1;'))
    const cnt = Object.fromEntries(await pool(tbls, C.cmpConc, async t => [t, +rows(await ora(`SELECT COUNT(*) FROM ${t};`))[0]]))
    const r = rows(
      await ora(`SELECT (SELECT COUNT(*) FROM user_tab_partitions) || '|' ||
  (SELECT COUNT(*) FROM user_constraints WHERE constraint_type = 'P') || '|' ||
  (SELECT COUNT(*) FROM user_indexes WHERE index_name LIKE 'X\\_%' ESCAPE '\\') || '|' ||
  (SELECT SUM(bytes) FROM user_segments) FROM dual;`),
    )[0].split('|')
    // DEFAULT(MAXVALUE) 조각 행 수 : 38개 조각 합계
    const pdef = rows(await ora('SELECT table_name FROM user_tab_partitions WHERE partition_name = \'PDEF\' ORDER BY 1;'))
    let defaultRows = 0
    for (const t of pdef) defaultRows += +rows(await ora(`SELECT COUNT(*) FROM ${t} PARTITION (PDEF);`))[0]
    return finishVerify('oracle', cnt, { parts: +r[0], pk: +r[1], idx: +r[2], bytes: +r[3], defaultRows: `${defaultRows}/${pdef.length}` })
  },
}

function clearState(db, schema) {
  const f = path.join(ROOT, 'datagen/state', `${db}_${schema}_${C.scale}.json`)
  for (const x of [f, f.replace(/\.json$/, '_fails.json')]) if (fs.existsSync(x)) fs.rmSync(x)
}

function finishVerify(t, cnt, meta) {
  const n = planN()
  const bad = [...n].filter(([k, v]) => cnt[k] !== v).map(([k, v]) => `${k} 목표 ${v} 실제 ${cnt[k] ?? '없음'}`)
  const rowsSum = Object.values(cnt).reduce((s, x) => s + x, 0)
  const res = { tables: Object.keys(cnt).length, rows: rowsSum, target: [...n.values()].reduce((s, x) => s + x, 0), mismatch: bad, ...meta }
  fs.writeFileSync(path.join(OUTD, `s1_${t}_verify.json`), JSON.stringify({ ...res, counts: cnt }, null, 2))
  if (bad.length) throw new Error(`건수 불일치 ${bad.length}건 : ${bad.slice(0, 5).join(', ')}`)
  return { tables: res.tables, rows: rowsSum, parts: meta.parts, pk: meta.pk, idx: meta.idx, gb: +(meta.bytes / 1e9).toFixed(2), defaultRows: meta.defaultRows }
}

// ---------- 함수 대조(ORA-R04) ----------
const FN = [
  // [이름, PostgreSQL 식, Oracle 식] — k = 키
  ['h53', 'hashint8extended(k, 7) & 9007199254740991', 'gen.h53(k, 7)'],
  ['uniform', 'gen.uniform(k, 12, 40)', 'gen.uniform(k, 12, 40)'],
  ['skew', 'gen.skew(k, 11, 20, 2.0)', 'gen.skew(k, 11, 20, 2.0)'],
  ['skew_big', 'gen.skew(k, 10345, 470065, 3)', 'gen.skew(k, 10345, 470065, 3)'],
  ['wpick', 'gen.wpick(k, 15, ARRAY[50,20,15,10,5]::float8[])', "gen.wpick(k, 15, '50|20|15|10|5')"],
  ['wcode', "gen.wcode(k, 355, ARRAY['01','02','03','04','05','06'], ARRAY[0.980000,0.004000,0.004000,0.004000,0.004000,0.004000]::float8[])", "gen.wcode(k, 355, '01|02|03|04|05|06', '0.980000|0.004000|0.004000|0.004000|0.004000|0.004000')"],
  ['recent_dtm', "to_char(gen.recent_dtm(k, 470065), 'YYYY-MM-DD HH24:MI:SS.US')", "TO_CHAR(gen.recent_dtm(k, 470065), 'YYYY-MM-DD HH24:MI:SS.FF6')"],
  ['after_dtm', "to_char(gen.after_dtm(gen.recent_dtm(k, 23503), k, 360, 30), 'YYYY-MM-DD HH24:MI:SS.US')", "TO_CHAR(gen.after_dtm(gen.recent_dtm(k, 23503), k, 360, 30), 'YYYY-MM-DD HH24:MI:SS.FF6')"],
  ['month_edge', "to_char(gen.month_edge(gen.recent_dtm(k, 23503), k, 361, 0.5), 'YYYY-MM-DD HH24:MI:SS.US')", "TO_CHAR(gen.month_edge(gen.recent_dtm(k, 23503), k, 361, 0.5), 'YYYY-MM-DD HH24:MI:SS.FF6')"],
  ['ymd', 'gen.ymd(gen.recent_dtm(k, 1000))', 'gen.ymd(gen.recent_dtm(k, 1000))'],
  ['fmt', "gen.fmt('C', k, 7)", "gen.fmt('C', k, 7)"],
  ['orphan', 'gen.orphan(k % 1000 + 1, 1000, k, 10001)', 'gen.orphan(MOD(k, 1000) + 1, 1000, k, 10001)'],
  ['person_nm', 'gen.person_nm(k)', 'gen.person_nm(k)'],
  ['corp_nm', 'gen.corp_nm(k)', 'gen.corp_nm(k)'],
  ['phone', 'gen.phone(k)', 'gen.phone(k)'],
  ['amt', 'gen.amt((k % 50000 + 1)::numeric, k, 401)', 'gen.amt(MOD(k, 50000) + 1, k, 401)'],
  ['dirty', "gen.dirty('01', k, 357, 0.3)", "gen.dirty('01', k, 357, 0.3)"],
  // STANDARD_HASH·DBMS_CRYPTO.HASH 는 NULL 입력에 ORA-01405 → NULL 은 먼저 거름
  ['memo_1000', "md5(left(gen.memo(k, 900, 0.5), 1000))", "CASE WHEN gen.memo(k, 900, 0.5, 1000) IS NOT NULL THEN LOWER(RAWTOHEX(STANDARD_HASH(gen.memo(k, 900, 0.5, 1000), 'MD5'))) END"],
  ['memo_lob', "md5(left(gen.memo(k, 901, 0.5), 4000))", 'CASE WHEN gen.memo_lob(k, 901, 0.5, 4000) IS NOT NULL THEN LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(gen.memo_lob(k, 901, 0.5, 4000), 2))) END'],
  ['f2n_round', "trim_scale(round((gen.u(k, 500) * 100)::numeric, 2))::text", "RTRIM(RTRIM(TO_CHAR(ROUND(gen.f2n(gen.u(k, 500) * 100), 2), 'FM9990.99'), '0'), '.')"],
  ['dtm_to_k', "gen.dtm_to_k(timestamp '2010-01-01' + (k % 6000) * interval '1 day', 470065)", "gen.dtm_to_k(TIMESTAMP '2010-01-01 00:00:00' + NUMTODSINTERVAL(MOD(k, 6000), 'DAY'), 470065)"],
]
async function fncheck() {
  // 키 = 1..5000 + 5000개 큰 키(104729 배수, 약 5억까지)
  const pgSql = `SET extra_float_digits = 0;\nSELECT k::text || '|' || ${FN.map(f => `coalesce((${f[1]})::text, '∅')`).join(" || '|' || ")} FROM (SELECT generate_series(1, 5000)::bigint AS k UNION ALL SELECT g::bigint * 104729 FROM generate_series(1, 5000) g) s ORDER BY k;`
  const oraSql = `SELECT TO_CHAR(k) || '|' || ${FN.map(f => `NVL(TO_CHAR(${f[2]}), '∅')`).join(" || '|' || ")} FROM (SELECT column_value AS k FROM TABLE(gen.series(1, 5000)) UNION ALL SELECT column_value * 104729 FROM TABLE(gen.series(1, 5000))) ORDER BY k;`
  const t0 = Date.now()
  const [p, o] = await Promise.all([psql(pgSql), ora(oraSql)])
  const sec = (Date.now() - t0) / 1000
  const P = rows(p).filter(l => /^\d+\|/.test(l))
  const O = rows(o)
  if (P.length !== 10000 || O.length !== 10000) throw new Error(`행 수 이상 PG ${P.length} Oracle ${O.length}`)
  const res = FN.map(f => ({ fn: f[0], same: 0, diff: 0, sample: [] }))
  for (let i = 0; i < P.length; i++) {
    const a = P[i].split('|'), b = O[i].split('|')
    if (a[0] !== b[0]) throw new Error(`키 순서 다름 ${a[0]} ${b[0]}`)
    FN.forEach((f, j) => {
      const x = a[j + 1], y = b[j + 1]
      const eq = x === y || (/^-?[\d.]+$/.test(x) && /^-?[\d.]+$/.test(y) && Number(x) === Number(y))
      if (eq) res[j].same++
      else {
        res[j].diff++
        if (res[j].sample.length < 5) res[j].sample.push({ k: a[0], pg: x, ora: y })
      }
    })
  }
  fs.writeFileSync(path.join(OUTD, 's1_fncheck.json'), JSON.stringify({ at: new Date().toISOString(), keys: P.length, sec, res }, null, 2))
  for (const r of res) console.log(`${r.fn.padEnd(12)} 일치 ${r.same} 다름 ${r.diff}${r.diff ? ' 예 ' + JSON.stringify(r.sample[0]) : ''}`)
  return res
}

// ---------- 데이터 대조(ORA-R06) ----------
// 칼럼 해시(md5 32자리, NULL = 'N') → 행 해시 = md5(칼럼 해시를 '|' 로 이음) → 앞 15자리(60비트)를 정수로 바꿔 합산 = 순서와 무관한 테이블 체크섬. 칼럼별 합도 함께
function hashExprs(t, dialect) {
  return t.cols.map(c => {
    const m = c.dataTp.match(/^(\w+)(?:\((\d+))?/)
    const base = m[1], len = m[2] ? +m[2] : 0
    const col = dialect === 'pg' ? c.colNm.toLowerCase() : c.colNm
    if (dialect === 'pg') {
      const txt = base === 'NUMERIC' ? `trim_scale(${col})::text` : base === 'TIMESTAMP' ? `to_char(${col}, 'YYYY-MM-DD HH24:MI:SS.US')` : `${col}::text`
      return `coalesce(md5(${txt}), 'N')`
    }
    const lob = base === 'VARCHAR' && len > C.lobChars
    const txt = base === 'NUMERIC' ? `RTRIM(TO_CHAR(${col}, 'FM999999999999999999999990.9999999999'), '.')` : base === 'TIMESTAMP' ? `TO_CHAR(${col}, 'YYYY-MM-DD HH24:MI:SS.FF6')` : base === 'CHAR' ? `RTRIM(${col})` : col
    const h = lob ? `LOWER(RAWTOHEX(DBMS_CRYPTO.HASH(${col}, 2)))` : `LOWER(RAWTOHEX(STANDARD_HASH(${txt}, 'MD5')))`
    return `CASE WHEN ${col} IS NULL THEN 'N' ELSE ${h} END`
  })
}
function cmpSql(t, dialect) {
  const hs = hashExprs(t, dialect)
  const hn = hs.map((_, i) => `h${i + 1}`)
  if (dialect === 'pg') {
    const num = e => `('x' || substr(${e}, 1, 15))::bit(60)::bigint`
    return `SELECT count(*) || '|' || coalesce(sum(${num(`md5(${hn.join(" || '|' || ")})`)}), 0) || '|' || ${hn.map(h => `coalesce(sum(CASE WHEN ${h} = 'N' THEN 0 ELSE ${num(h)} END), 0)`).join(" || '|' || ")} FROM (SELECT ${hs.map((e, i) => `${e} AS ${hn[i]}`).join(', ')} FROM ${C.pgSchema}.${t.tblNm.toLowerCase()}) s;`
  }
  // sqlplus 는 한 줄 2,499자 상한(SP2-0027) → 식마다 줄을 나눈다(넓은 테이블 132개가 이 상한에 걸려 1차 대조가 틀린 '다름' 을 냈다)
  const num = e => `TO_NUMBER(UPPER(SUBSTR(${e}, 1, 15)), 'XXXXXXXXXXXXXXX')`
  return `SELECT COUNT(*) || '|' ||\n NVL(SUM(${num(`RAWTOHEX(STANDARD_HASH(${hn.join(" || '|' || ")}, 'MD5'))`)}), 0) || '|' ||\n ${hn.map(h => `NVL(SUM(CASE WHEN ${h} = 'N' THEN 0 ELSE ${num(h)} END), 0)`).join(" || '|' ||\n ")}\nFROM (SELECT\n ${hs.map((e, i) => `${e} AS ${hn[i]}`).join(',\n ')}\nFROM ${t.tblNm});`
}
async function compare() {
  const tbls = model()
  const t0 = Date.now()
  const res = await pool(tbls, C.cmpConc, async t => {
    const [p, o] = await Promise.all([psql(cmpSql(t, 'pg')), ora(cmpSql(t, 'oracle'))])
    const a = p.trim().split('|'), b = rows(o)[0].split('|')
    const diffCols = t.cols.filter((c, i) => a[i + 2] !== b[i + 2]).map(c => c.colNm)
    return { tbl: t.tblNm, area: t.area, rows: +a[0], oraRows: +b[0], rowSum: a[1] === b[1], diffCols }
  })
  const sec = (Date.now() - t0) / 1000
  const bad = res.filter(r => r.rows !== r.oraRows || !r.rowSum)
  const colDiff = res.flatMap(r => r.diffCols.map(c => `${r.tbl}.${c}`))
  const sum = { at: new Date().toISOString(), sec, tables: res.length, rows: res.reduce((s, r) => s + r.rows, 0), sameTables: res.length - bad.length, diffTables: bad.map(r => r.tbl), diffCols: colDiff }
  fs.writeFileSync(path.join(OUTD, 's1_compare.json'), JSON.stringify({ ...sum, detail: res }, null, 2))
  console.log(`대조 ${sum.tables}테이블 · ${sum.rows.toLocaleString()}행 · 같음 ${sum.sameTables} · 다름 ${bad.length} · 다른 칼럼 ${colDiff.length} · ${sec.toFixed(0)}초`)
  if (colDiff.length) console.log('다른 칼럼 : ' + colDiff.slice(0, 30).join(', '))
  return sum
}

// ---------- 비교표(기록 → markdown) ----------
function report() {
  const tl = { pg: readTl('pg'), oracle: readTl('oracle') }
  const vf = t => (fs.existsSync(path.join(OUTD, `s1_${t}_verify.json`)) ? JSON.parse(fs.readFileSync(path.join(OUTD, `s1_${t}_verify.json`), 'utf8')) : {})
  const v = { pg: vf('pg'), oracle: vf('oracle') }
  const nm = { setup: '준비(스키마·사용자)', tables: '테이블·조각 생성', gen: '생성 함수 설치', load: '데이터 생성·적재', constraints: 'PK·인덱스', stats: '통계 수집', verify: '건수 검증' }
  const s = x => (x == null ? '-' : x < 60 ? `${x.toFixed(1)}초` : `${Math.floor(x / 60)}분 ${(x % 60).toFixed(0)}초`)
  const ratio = (a, b) => (a && b ? `${(b / a).toFixed(2)}배` : '-')
  const L = ['| 단계 | PostgreSQL 17 | Oracle 21c | Oracle ÷ PostgreSQL |', '|---|---:|---:|---:|']
  let ta = 0, tb = 0
  for (const id of STEPS) {
    const a = tl.pg.steps[id]?.sec, b = tl.oracle.steps[id]?.sec
    ta += a || 0
    tb += b || 0
    L.push(`| ${nm[id]} | ${s(a)} | ${s(b)} | ${ratio(a, b)} |`)
  }
  L.push(`| 합계 | ${s(ta)} | ${s(tb)} | ${ratio(ta, tb)} |`, '', '| 결과 | PostgreSQL 17 | Oracle 21c |', '|---|---:|---:|')
  for (const [k, lb] of [['tables', '테이블'], ['rows', '행'], ['parts', '조각'], ['pk', 'PK'], ['idx', '보조 인덱스'], ['defaultRows', 'DEFAULT 조각 행/개수']]) L.push(`| ${lb} | ${v.pg[k]?.toLocaleString?.() ?? '-'} | ${v.oracle[k]?.toLocaleString?.() ?? '-'} |`)
  L.push(`| 크기(테이블+인덱스+LOB) | ${v.pg.bytes ? (v.pg.bytes / 1e9).toFixed(2) + ' GB' : '-'} | ${v.oracle.bytes ? (v.oracle.bytes / 1e9).toFixed(2) + ' GB' : '-'} |`)
  console.log(L.join('\n'))
}

// ---------- 진입 ----------
async function main() {
  const cmd = process.argv[2]
  if (cmd === 'fncheck') return fncheck()
  if (cmd === 'compare') return compare()
  if (cmd === 'report') return report()
  const t = arg('target', null)
  if (!['pg', 'oracle'].includes(t)) throw new Error('--target pg|oracle 필요')
  const S = t === 'pg' ? PG : OR
  const list = cmd === 'all' ? STEPS : [cmd]
  for (const id of list) {
    if (!S[id]) throw new Error(`단계 없음 : ${id}`)
    await timed(t, id, () => S[id]())
  }
}
main().catch(e => {
  console.error('실패 : ' + e.message)
  process.exit(1)
})

// 적재 데이터 검증 — 물리 모델 FK 전수의 고아 비율(S11 목표 0.05%) + 편향 지표(S1·S3·S4) 를 SQL 로 만들어 실행
// FK 1건 = 쿼리 1개(동시 C.conc, 건별 statement_timeout) — 건별 로그 database/verify.log, 진행 database/verify_state.json(원자적 쓰기, init_data.html 이 표시)
// 실행 : node datagen/verify.mjs [--schema chk_gen] [--db dev] [--timeout-min 30] [--conc 3] [--fresh]  (재실행 = 완료 건 건너뜀, --fresh = 처음부터)
//        node datagen/verify.mjs --db prod --schema public --explain FK_A,FK_B   계획만 출력(EXPLAIN, ANALYZE 아님)
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { fmt, dur } from '../database/render-html.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] }
const C = {
  // 동시 쿼리 — 컨테이너 8코어·7GB·/dev/shm 1GB, 쿼리마다 병렬 해시가 공유 메모리를 씀(3건 동시에 shm 부족 10건 사례 → 재시도는 1)
  // 실행기 경유 재실행은 인자를 못 넘기므로 환경변수 VERIFY_CONC 도 받음(VERIFY_CONC=1 node database/run-init.mjs start)
  conc: Math.max(1, +arg('conc', process.env.VERIFY_CONC || 3)),
  timeoutMin: +arg('timeout-min', 30), // FK 1건 상한 — 넘으면 '시간초과' 기록 후 다음 건
  badRatio: 0.01, // 고아 1% 초과 FK 목록 기준
  top: 10,
}
// 컨테이너 — 기본 pitel-pg, 다른 컨테이너(환경변수 PITEL_CONTAINER, rebuild.mjs 가 넘김)는 진행 기록·로그를 따로(datagen/state = gitignore)
const CT = process.env.PITEL_CONTAINER || 'pitel-pg'
const F = CT === 'pitel-pg' ? { state: path.join(ROOT, 'database/verify_state.json'), log: path.join(ROOT, 'database/verify.log') } : { state: path.join(ROOT, `datagen/state/verify_${CT}.json`), log: path.join(ROOT, `database/verify_${CT}.log`) }
const schema = arg('schema', 'chk_gen')
const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
const db = new URL(env.match(new RegExp(`^${arg('db', 'dev') === 'prod' ? 'PITEL_DB_URL' : 'PITEL_DEV_DB_URL'}=(.+)$`, 'm'))[1].trim()).pathname.slice(1)

// psql 1회 = 쿼리 1건(비동기 — 동시 실행용). -q 로 SET 출력 없음
const psql = sql =>
  new Promise((res, rej) => {
    const p = spawn('docker', ['exec', '-i', CT, 'psql', '-U', 'postgres', '-d', db, '-At', '-F', '|', '-q', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('close', code => (code === 0 ? res(out.trim()) : rej(new Error(err.trim().slice(0, 300) || `psql 종료 코드 ${code}`))))
    p.stdin.end(`SET search_path=${schema};\nSET statement_timeout='${C.timeoutMin}min';\n${sql}`)
  })

const tables = fs.readdirSync(path.join(ROOT, 'model/physical')).flatMap(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'model/physical', f), 'utf8')).tables)
const byNm = new Map(tables.map(t => [t.tblNm, t]))
const lc = s => s.toLowerCase()
const key = a => [...a].sort().join()

// FK 고아 비율 — FK 칼럼이 모두 NOT NULL 인 행 기준
// 구 방식 count(*) FILTER (WHERE NOT EXISTS …) 는 행마다 부질의(조인 변환 안 됨) → 11억 행에서 5시간+. 아래는 플래너가 해시·병합·인덱스 조인을 고를 수 있는 형태
// refCols = 부모 PK 전체(파티션 키 포함 → 인덱스 탐색 때 파티션 가지치기) : LEFT JOIN 1회 스캔
// refCols = PK 앞부분(파티션 키 빠짐, 38건) : 유일성 보장이 없어 LEFT JOIN 은 행 중복 → 건수 + NOT EXISTS 반조인 2회 스캔
const fkJobs = tables
  .flatMap(t => (t.fks || []).filter(f => byNm.has(f.refTbl)).map(f => ({ t, f })))
  .sort((a, b) => (b.t.estRows || 0) - (a.t.estRows || 0)) // 큰 자식 먼저 — 끝에 큰 건 하나만 남는 꼬리 방지
  .map(({ t, f }) => {
    const on = f.cols.map((c, i) => `p.${lc(f.refCols[i])} = c.${lc(c)}`).join(' AND ')
    const nn = f.cols.map(c => `c.${lc(c)} IS NOT NULL`).join(' AND ')
    const child = lc(t.tblNm)
    const parent = lc(f.refTbl)
    const full = key(byNm.get(f.refTbl).pk.cols) === key(f.refCols)
    const sql = full
      ? `SELECT count(*), count(*) FILTER (WHERE p.${lc(f.refCols[0])} IS NULL) FROM ${child} c LEFT JOIN ${parent} p ON ${on} WHERE ${nn}`
      : `SELECT (SELECT count(*) FROM ${child} c WHERE ${nn}), (SELECT count(*) FROM ${child} c WHERE ${nn} AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE ${on}))`
    return { id: f.nm, kind: 'FK', tbl: child, ref: parent, partKeyJoin: full, sql }
  })

// 편향 지표 — 원래 한 문장 UNION ALL 3개를 건별로(각자 시간 상한)
const metricJobs = [
  ['S4 최근3년(가입계약)', `SELECT round(avg((sbsc_ctrt_dtm >= '2023-11-01')::int), 3) FROM ptl_ord_sbsc_ctrt_m`],
  ['S1 상위1% 청구계정 회선 점유', `SELECT round((SELECT count(*) FROM ptl_ord_sbsc_ctrt_m WHERE bill_acnt_no IN (SELECT bill_acnt_no FROM ptl_cus_bill_acnt_m ORDER BY bill_acnt_no LIMIT (SELECT count(*)/100 FROM ptl_cus_bill_acnt_m)))::numeric / count(*), 3) FROM ptl_ord_sbsc_ctrt_m`],
  ['S9 TOAST 메모 행(원시사용)', `SELECT count(*) FILTER (WHERE length(raw_rcrd_cn) > 1000) FROM ptl_pay_raw_use_l`],
].map(([id, sql]) => ({ id, kind: 'METRIC', sql }))
const jobs = [...fkJobs, ...metricJobs]

// --explain : 계획만(실행 안 함)
const ex = arg('explain', null)
if (ex) {
  for (const id of ex.split(',')) {
    const j = jobs.find(x => x.id === id)
    console.log(`== ${id} ${j ? (j.partKeyJoin ? '(PK 전체 조인)' : '(PK 앞부분 — 파티션 키 없음)') : '없음'}\n${j ? await psql(`EXPLAIN ${j.sql};`) : ''}\n`)
  }
  process.exit(0)
}

// ---------- 진행 기록 ----------
const stKey = `${db}.${schema}`
const prev = fs.existsSync(F.state) ? JSON.parse(fs.readFileSync(F.state, 'utf8')) : null
const S = prev && prev.key === stKey && !process.argv.includes('--fresh') ? prev : { key: stKey, results: {} }
Object.assign(S, { pid: process.pid, startedAt: Date.now(), endAt: null, total: jobs.length, conc: C.conc, timeoutMin: C.timeoutMin })
const R = S.results
const save = () => {
  S.updatedAt = Date.now()
  S.done = Object.values(R).filter(r => r.st === '완료').length
  try {
    fs.writeFileSync(F.state + '.tmp', JSON.stringify(S))
    fs.renameSync(F.state + '.tmp', F.state)
  } catch (e) {
    console.error(`기록 보류 : ${e.code}`) // 다른 프로세스가 잡고 있으면 다음 이벤트에 다시
  }
}
const log = m => fs.appendFileSync(F.log, `[${fmt(Date.now())}] ${m}\n`)

async function run(j) {
  const r = (R[j.id] = { st: '진행', kind: j.kind, tbl: j.tbl, s: Date.now() })
  log(`시작 ${j.id}${j.tbl ? ` ${j.tbl}→${j.ref}` : ''}`)
  save()
  try {
    const v = (await psql(j.sql + ';')).split('|')
    if (j.kind === 'FK') Object.assign(r, { total: +v[0], orph: +v[1] })
    else r.val = v[0]
    r.st = '완료'
  } catch (e) {
    r.st = /statement timeout/.test(e.message) ? '시간초과' : '실패'
    r.err = e.message.slice(0, 300)
  }
  r.e = Date.now()
  r.ms = r.e - r.s
  log(`종료 ${j.id} ${r.st} ${dur(r.ms)}${j.kind === 'FK' && r.st === '완료' ? ` 자식 ${r.total.toLocaleString()} 고아 ${r.orph.toLocaleString()}` : ''}${r.val != null ? ` 값 ${r.val}` : ''}${r.err ? ` 오류 ${r.err.replace(/\s+/g, ' ')}` : ''}`)
  save()
}

const queue = jobs.filter(j => R[j.id]?.st !== '완료')
log(`검증 시작 PID ${process.pid} · ${stKey} · 전체 ${jobs.length}건(FK ${fkJobs.length} · 지표 ${metricJobs.length}) · 남은 ${queue.length}건 · 동시 ${C.conc} · 건별 상한 ${C.timeoutMin}분`)
save()
await Promise.all(Array.from({ length: C.conc }, async () => { while (queue.length) await run(queue.shift()) }))
S.endAt = Date.now()
save()

// ---------- 요약(기존 출력 유지 + 미완료 건수) ----------
const fk = fkJobs.map(j => [j.id, R[j.id]]).filter(([, r]) => r?.st === '완료')
const tot = fk.reduce((s, [, r]) => s + r.total, 0)
const orph = fk.reduce((s, [, r]) => s + r.orph, 0)
const bad = fk.filter(([, r]) => r.total > 0 && r.orph / r.total > C.badRatio).sort((a, b) => b[1].orph / b[1].total - a[1].orph / a[1].total)
const miss = jobs.filter(j => R[j.id]?.st !== '완료')
console.log(`FK ${fk.length}개 · 자식 행 ${tot.toLocaleString()} · 고아 ${orph.toLocaleString()} (${tot ? ((orph / tot) * 100).toFixed(3) : '-'}%, 목표 약 0.05%)`)
console.log(`고아 1% 초과 FK ${bad.length}개${bad.length ? ' : ' + bad.slice(0, C.top).map(([id, r]) => `${id} ${((r.orph / r.total) * 100).toFixed(1)}%`).join(', ') : ''}`)
for (const j of metricJobs) console.log(`${j.id} = ${R[j.id]?.val ?? R[j.id]?.st}`)
if (miss.length) console.log(`미완료 ${miss.length}건 : ${miss.map(j => `${j.id}(${R[j.id]?.st})`).join(', ')} — 재실행 시 이 건만 다시`)
log(`검증 종료 ${dur(S.endAt - S.startedAt)} · 완료 ${S.done}/${jobs.length} · 미완료 ${miss.length}`)
process.exitCode = miss.length ? 1 : 0 // 미완료가 있으면 실행기 VERIFY = 실패 → start 재실행이 남은 건만 이어서

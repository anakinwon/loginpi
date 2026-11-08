// Pi통신 테스트 데이터 100%(scale 1) 적재 실행기 — 사전점검 → 생성기 1프로세스(--jobs 7) 적재 감시 → 영역별 PK·인덱스(동시 3) → ANALYZE → verify → autovacuum 원복
// 진행 기록 = database/init_data.json(원자적 쓰기) + init_data.html(이벤트마다 재생성, 30초 자동 새로고침). 로그 = database/run-init.log·datagen.log
// 실행 : node database/run-init.mjs start      분리 프로세스로 착수(재시작 겸용 — 완료 조각은 생성기 state 로 건너뜀, 비정상 종료 조각은 건수 대조로 정리)
//        node database/run-init.mjs stop       정지 절차(① 진행 INSERT 기록 → ② node 종료 → ③ 백엔드 종료)
//        node database/run-init.mjs restart    실행기만 교체(생성기 유지 — taskkill /T 없음, 새 실행기는 살아 있는 생성기를 감지해 감시만)
//        node database/run-init.mjs html|preview  기록으로 HTML(또는 init_data.preview.html)만 다시 생성 / --selftest 자체 시험
// HTML 모양 = database/render-html.mjs(갱신마다 다시 읽음 — 실행기 재시작 불필요)
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fmt, dur, simulate, computeEta, tableView, setCtx, renderHtml as renderHtml0 } from './render-html.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const F = {
  json: path.join(HERE, 'init_data.json'),
  html: path.join(HERE, 'init_data.html'),
  preview: path.join(HERE, 'init_data.preview.html'),
  render: path.join(HERE, 'render-html.mjs'),
  log: path.join(HERE, 'run-init.log'),
  glog: path.join(HERE, 'datagen.log'),
  deferred: path.join(HERE, 'deferred_indexes.sql'),
  gen: path.join(ROOT, 'datagen/datagen.mjs'),
  verify: path.join(ROOT, 'datagen/verify.mjs'),
  plan: path.join(ROOT, 'datagen/out/plan.json'),
  funcs: path.join(ROOT, 'datagen/00_gen_functions.sql'),
  stateDir: path.join(ROOT, 'datagen/state'),
  ddl: path.join(ROOT, 'ddl'),
  vhdx: process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Docker/wsl/disk/docker_data.vhdx') : null,
}

// 상수 — 근거는 각 줄 주석. [가정] = 실측 없음(완료 단계 실측으로 대체)
const C = {
  scale: 1,
  jobs: 7, // 생성기 동시 백엔드(8코어 - 감시·OS 1) — 설계 담당 지시
  conSessions: 3, // 제약 단계 동시 세션
  modelOrder: ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM'],
  conOrder: ['PAY', 'COL', 'INV', 'ORD', 'CUS', 'PRM', 'PRD'], // 큰 영역 먼저
  bigAreas: ['PAY', 'COL', 'INV', 'ORD'], // 디스크 게이트 시 보조 인덱스 지연 대상
  rate1pct: 12170698 / 240 / 6, // 1% 시험 실측(pitel_dev.chk_gen 12,170,698행 약 4분, 동시 6) → 백엔드 1개 행/초
  rateMinChunk: 100000, // 실측 처리율에 넣을 최소 조각 행
  chunkOvhS: 1, // 조각마다 docker exec·psql 기동
  chunkMin: 1000000, // datagen.mjs C.chunkMin 과 같은 값(이보다 작은 테이블 = 조각 1개)
  years: [2010, 2026], // datagen.mjs C.years
  conRowsPerS: 30000, // [가정] 제약 세션당 행/초 — 설계 담당 예상(전체 약 13h·적재 5~9h) 역산
  analyzeS: 1800, // [가정]
  verifyS: 3600, // [가정]
  diskStopGB: 40, // 1차 중단선 — 새 조각 중지(생성기 node 만 종료, 진행 조각은 끝까지 → 재시작 때 건수 대조로 완료 처리)
  diskKillGB: 20, // 2차 중단선 — 진행 조각까지 정지(① 기록 → ② 생성기 트리 종료 → ③ 백엔드 종료)
  diskGateGB: 50, // 제약 후 예상 여유가 이보다 작으면 큰 4영역 보조 인덱스 지연
  walReserveGB: 16,
  failStop: 5, // 실패 조각 이 건수 초과 = 중단
  tickMs: 60000, // 디스크 감시·HTML 갱신
  tailMs: 5000, // 생성기 로그 읽기
  sys: { max_wal_size: '8GB', checkpoint_timeout: '30min', checkpoint_completion_target: '0.9', autovacuum: 'off', maintenance_work_mem: '1GB' },
}
const AREA_NM = { PRD: '상품', CUS: '고객', ORD: '가입', PAY: '청구', INV: '수납', COL: '미납', PRM: '파트너' }
const CTX = { C, AREA_NM, alive: pid => alive(pid) }
setCtx(CTX) // 정적 렌더 모듈(selftest·html 명령)용
const CON_FILE = { PRD: '10_prd', CUS: '20_cus', ORD: '30_ord', PAY: '40_pay', INV: '50_inv', COL: '60_col', PRM: '70_prm' }
const INS = `query ILIKE 'INSERT INTO ptl_%'`

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = m => console.log(`[${fmt(Date.now())}] ${m}`)
const alive = pid => {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const atomicWrite = (f, s) => {
  try {
    fs.writeFileSync(f + '.tmp', s)
    fs.renameSync(f + '.tmp', f)
  } catch (e) {
    log(`쓰기 보류 ${path.basename(f)} : ${e.code}`) // 브라우저가 잡고 있으면 다음 이벤트에 다시
  }
}

// DB 이름만 .env.local URL 경로에서(값 출력 금지)
function dbName(key) {
  const url = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
  if (!url) throw new Error(`${key} 없음`)
  return new URL(url).pathname.slice(1)
}

// psql : strict = 오류 시 중단·reject / loose = 오류 계속, stderr 를 stdout 에 합쳐 순서 유지
function psql(db, sql, loose = false) {
  return new Promise((res, rej) => {
    const args = loose
      ? ['exec', '-i', 'pitel-pg', 'sh', '-c', `psql -U postgres -d ${db} -v ON_ERROR_STOP=0 -q -At 2>&1`]
      : ['exec', '-i', 'pitel-pg', 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At']
    const p = spawn('docker', args, { windowsHide: true })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('close', code => (code === 0 || loose ? res(out.trim()) : rej(new Error(err.trim().slice(0, 600)))))
    p.stdin.end(sql)
  })
}
// 스키마 삭제 — 테이블 2,500여 개를 한 트랜잭션에 지우면 잠금 테이블 넘침(out of shared memory) → 부모 테이블마다 따로(\gexec = 문장별 자동 커밋)
const dropSchema = (db, sc) =>
  psql(db, `SELECT format('DROP TABLE IF EXISTS %I.%I CASCADE', '${sc}', relname) FROM pg_class WHERE relnamespace = to_regnamespace('${sc}') AND relkind IN ('r','p') AND NOT relispartition \\gexec\nDROP SCHEMA IF EXISTS ${sc} CASCADE;`)
const DB = () => dbName('PITEL_DB_URL')
const DEV = () => dbName('PITEL_DEV_DB_URL')
const stFile = () => path.join(F.stateDir, `${DB()}_public_${C.scale}.json`)
const readSt = () => new Set(fs.existsSync(stFile()) ? JSON.parse(fs.readFileSync(stFile(), 'utf8')) : [])
const writeSt = set => atomicWrite(stFile(), JSON.stringify([...set]))

// ---------- 기록 ----------
function loadS() {
  return fs.existsSync(F.json) ? JSON.parse(fs.readFileSync(F.json, 'utf8')) : { tables: {}, steps: {}, warns: [], order: [] }
}
// HTML 렌더러 — 파일 수정 시각을 쿼리로 붙여 동적 import(수정됐을 때만 새 모듈, 캐시 증가 = 수정 횟수). 읽기 실패면 이전 렌더러 유지
let lastRender = renderHtml0
async function renderer() {
  try {
    lastRender = (await import(pathToFileURL(F.render).href + '?v=' + fs.statSync(F.render).mtimeMs)).renderHtml
  } catch (e) {
    log('렌더러 읽기 실패(이전 렌더러 유지) ' + e.message.slice(0, 200))
  }
  return lastRender
}
function save(S) {
  S.savedAt = Date.now()
  atomicWrite(F.json, JSON.stringify(S))
  renderer()
    .then(r => atomicWrite(F.html, r(S, Date.now(), CTX)))
    .catch(e => log('HTML 갱신 실패 ' + e.message.slice(0, 200)))
}
function warn(S, m) {
  S.warns.push({ at: Date.now(), m, run: S.runs })
  log('경고 ' + m)
}
const chunkOf = (S, id) => S.tables[id.slice(0, id.lastIndexOf(':'))]?.chunks[id]
const allChunks = S => Object.values(S.tables).flatMap(t => Object.entries(t.chunks).map(([id, c]) => ({ id, ...c, tbl: t.tbl })))
const loadDone = S => S.order.length > 0 && allChunks(S).every(c => c.st === '완료')


// ---------- 디스크 ----------
async function disk(S) {
  const s = fs.statfsSync('C:/')
  const d = { at: Date.now(), freeGB: (s.bavail * s.bsize) / 1e9 }
  try {
    d.dbGB = +(await psql(DB(), `SELECT pg_database_size(current_database());`)) / 1e9
  } catch {}
  try {
    d.vhdxGB = F.vhdx ? fs.statSync(F.vhdx).size / 1e9 : null
  } catch {}
  S.disk = d
  return d
}

// ---------- 정지 절차 : ① INSERT 기록 → ② node 종료 → ③ 백엔드 종료 (역순이면 docker exec 자식이 완주해 state 미기록 중복) ----------
// soft = 1차(②에서 /T 없이 생성기 node 만 — docker exec 자식이 진행 INSERT 를 끝까지, ③ 생략)
async function stopProcedure(S, reason, { runnerToo = false, soft = false } = {}) {
  const act = `datname = current_database() AND pid <> pg_backend_pid() AND state = 'active' AND backend_type = 'client backend'`
  const rec = await psql(DB(), `SELECT pid || ' ' || left(query, 70) FROM pg_stat_activity WHERE ${act};`).catch(e => 'pg_stat_activity 조회 실패 ' + e.message)
  S.stopRec = { at: Date.now(), reason, active: rec.split('\n').filter(Boolean) }
  warn(S, `중단 : ${reason} — 진행 중 질의 ${S.stopRec.active.length}건 기록`)
  if (soft) S.softStopped = true // 적재 루프가 재기동하지 않게 kill 보다 먼저(동기 구간)
  else S.hardStopped = true
  for (const pid of [runnerToo ? S.pid : null, S.genPid]) if (pid && pid !== process.pid && alive(pid)) try { execFileSync('taskkill', ['/PID', String(pid), ...(soft ? [] : ['/T']), '/F'], { stdio: 'ignore' }) } catch {}
  if (soft) {
    S.phase = '중단'
    return save(S)
  }
  await psql(DB(), `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE ${act};`).catch(e => warn(S, '백엔드 종료 실패 ' + e.message))
  S.phase = '중단'
  save(S)
}

// ---------- 0단계 사전점검 ----------
async function precheck(S) {
  S.phase = '사전점검'
  S.precheck = { items: [] }
  const add = (nm, ok, note) => {
    S.precheck.items.push({ nm, ok, note: String(note) })
    log(`사전점검 ${ok ? '통과' : '실패'} ${nm} — ${note}`)
    save(S)
    if (!ok) throw new Error('사전점검 실패 : ' + nm)
  }
  const db = DB()
  const dev = DEV()
  const running = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', 'pitel-pg']).toString().trim()
  add('컨테이너 pitel-pg 가동', running === 'true', running)
  const slots = +(await psql(db, `SELECT count(*) FROM pg_replication_slots;`))
  add('(a) 복제 슬롯 없음(wal_level=logical WAL 무한 보존 방지)', slots === 0, `슬롯 ${slots}개`)
  const st = fs.readdirSync(F.stateDir).filter(f => f.startsWith(`${db}_public_${C.scale}`))
  add('(d) 생성기 state 부재', st.length === 0, st.join(', ') || '없음')
  const [tblCnt, bytes] = (await psql(db, `SELECT count(*) FILTER (WHERE NOT relispartition), coalesce(sum(pg_relation_size(oid)), 0) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p');`)).split('|').map(Number)
  add('(d) 본 DB 테이블 214·0행', tblCnt === 214 && bytes === 0, `테이블 ${tblCnt} · 데이터 ${bytes}바이트`)

  // (c) 1% 실측 데이터:인덱스 비율 r 기록 후 pitel_dev.chk_gen 삭제(시험 잔재)
  const has = +(await psql(dev, `SELECT count(*) FROM pg_namespace WHERE nspname = 'chk_gen';`))
  if (has) {
    const [tb, ib] = (await psql(dev, `SELECT sum(pg_table_size(oid)), sum(pg_indexes_size(oid)) FROM pg_class WHERE relnamespace = 'chk_gen'::regnamespace AND relkind = 'r';`)).split('|').map(Number)
    S.ratio = { tableGB: tb / 1e9, indexGB: ib / 1e9, r: ib / tb, rows: 12170698 }
    await dropSchema(dev, 'chk_gen')
    for (const f of fs.readdirSync(F.stateDir).filter(f => f.startsWith(`${dev}_chk_gen_`))) fs.unlinkSync(path.join(F.stateDir, f)) // 지운 스키마의 state — 남기면 다음 시험이 전부 건너뜀
  }
  add('(c) 1% 비율 r 기록·chk_gen 삭제', !!S.ratio, S.ratio ? `데이터 ${S.ratio.tableGB.toFixed(2)}GB · 인덱스 ${S.ratio.indexGB.toFixed(2)}GB · r=${S.ratio.r.toFixed(3)}${has ? ' · 스키마 삭제' : ' (이미 삭제)'}` : 'chk_gen 없음·기록 없음')

  const d = await disk(S)
  const predGB = (S.ratio.tableGB + S.ratio.indexGB) * (1101170707 / S.ratio.rows)
  add('디스크 C: 여유(선형 예상 + WAL + 중단선)', d.freeGB >= predGB + C.walReserveGB + C.diskStopGB, `여유 ${d.freeGB.toFixed(1)}GB · 예상 ${predGB.toFixed(0)}GB(인덱스 포함) · vhdx ${d.vhdxGB?.toFixed(1)}GB`)

  // (b) 설정 — 현재값 기록 후 변경·reload
  const names = Object.keys(C.sys)
  const cur = async () => Object.fromEntries((await psql(db, names.map(n => `SELECT '${n}', current_setting('${n}');`).join('\n'))).split('\n').map(l => l.split('|')))
  S.sysOrig ||= await cur()
  // 컨테이너 기동 인자(-c)로 정한 값은 ALTER SYSTEM 보다 우선 — 바꾸려면 컨테이너 재생성이 필요하므로 건너뛰고 기록만(max_wal_size 16GB = WAL 예비 16GB 안)
  const cmdLine = new Set((await psql(db, `SELECT name FROM pg_settings WHERE source = 'command line';`)).split('\n'))
  for (const [n, v] of Object.entries(C.sys)) if (!cmdLine.has(n)) await psql(db, `ALTER SYSTEM SET ${n} = '${v}';`)
  await psql(db, `SELECT pg_reload_conf();`)
  await sleep(1500)
  const now = await cur()
  const ok = n => cmdLine.has(n) || now[n] === C.sys[n] || (n === 'checkpoint_completion_target' && +now[n] === 0.9)
  add('(b) 설정 변경·reload', names.every(ok), names.map(n => `${n} ${S.sysOrig[n]}→${now[n]}${cmdLine.has(n) && now[n] !== C.sys[n] ? '(기동 인자 고정 — 미변경)' : ''}`).join(' · '))

  // (e) 절전 해제 — 현재값(AC 초) 기록
  const pw = {}
  for (const [k, q] of [['standby', 'STANDBYIDLE'], ['hibernate', 'HIBERNATEIDLE']]) {
    const hex = execFileSync('powercfg', ['/q', 'SCHEME_CURRENT', 'SUB_SLEEP', q]).toString('latin1').match(/0x[0-9a-f]{8}/gi) || []
    pw[k] = hex.length >= 2 ? parseInt(hex[hex.length - 2], 16) : null // 끝에서 둘째 = AC, 끝 = DC
    execFileSync('powercfg', ['/change', `${k}-timeout-ac`, '0'])
  }
  S.powerOrig ||= pw
  add('(e) 절전·최대절전 해제(AC)', true, `원래 standby ${S.powerOrig.standby}초 · hibernate ${S.powerOrig.hibernate}초 → 0`)

  // (f) 배율 1 키 폭 — plan --scale 1 후 테이블마다 최대 키 5행을 pitel_dev 시험 스키마에 넣어 칼럼 길이 넘침 확인
  execFileSync(process.execPath, [F.gen, 'plan', '--scale', '1'], { cwd: ROOT })
  const plans = JSON.parse(fs.readFileSync(F.plan, 'utf8'))
  execFileSync(process.execPath, [F.gen, 'run', '--db', 'dev', '--schema', 'chk_w', '--scale', '1', '--ddl', '--only', '__none__'], { cwd: ROOT })
  let sql = 'SET search_path = chk_w, gen;\n'
  for (const p of plans) sql += `\\echo @@${p.tbl}\n` + p.sql.replace('__KFROM__', String(Math.max(1, p.n - 4))).replace('__KTO__', String(p.n)) + ';\n'
  const out = await psql(dev, sql, true)
  const bad = []
  let cur_ = ''
  for (const l of out.split('\n')) {
    if (l.startsWith('@@')) cur_ = l.slice(2)
    else if (/ERROR/.test(l)) bad.push(`${cur_} : ${l.replace(/^.*ERROR:\s*/, '').slice(0, 120)}`)
  }
  await dropSchema(dev, 'chk_w')
  for (const f of fs.readdirSync(F.stateDir).filter(f => f.startsWith(`${dev}_chk_w_`))) fs.unlinkSync(path.join(F.stateDir, f))
  add('(f) 배율 1 최대 키 폭(214 테이블 × 상위 5행)', bad.length === 0, bad.length ? bad.slice(0, 5).join(' / ') : `넘침 0 · 목표 ${plans.reduce((s, p) => s + p.n, 0).toLocaleString()}행`)

  // gen 함수(본 DB) 설치 후 조각 크기 계산 — 생성기와 같은 공식(gen.dtm_to_k)
  await psql(db, fs.readFileSync(F.funcs, 'utf8'))
  const big = plans.filter(p => p.n >= C.chunkMin)
  const vals = big.flatMap(p => Array.from({ length: C.years[1] - C.years[0] + 1 }, (_, i) => `('${p.tbl}',${C.years[0] + i},${p.n})`))
  const sz = new Map(
    (await psql(db, `SELECT tbl || ':' || y, (CASE WHEN y = ${C.years[1]} THEN n ELSE gen.dtm_to_k(make_timestamp(y + 1, 1, 1, 0, 0, 0), n) END) - (CASE WHEN y = ${C.years[0]} THEN 0 ELSE gen.dtm_to_k(make_timestamp(y, 1, 1, 0, 0, 0), n) END) FROM (VALUES ${vals.join(',')}) v(tbl, y, n);`))
      .split('\n')
      .map(l => l.split('|'))
      .map(([id, n]) => [id, +n]),
  )
  S.tables = {}
  S.order = []
  for (const p of plans) {
    const ids = p.n < C.chunkMin ? [`${p.tbl}:all`] : Array.from({ length: C.years[1] - C.years[0] + 1 }, (_, i) => `${p.tbl}:${C.years[0] + i}`)
    S.tables[p.tbl] = { tbl: p.tbl, area: p.area, n: p.n, chunks: Object.fromEntries(ids.map(id => [id, { sz: p.n < C.chunkMin ? p.n : sz.get(id), st: '대기' }])) }
    S.order.push(...ids)
  }
  const sum = allChunks(S).reduce((s, c) => s + c.sz, 0)
  add('조각 크기 합 = 목표 행', sum === plans.reduce((s, p) => s + p.n, 0), `조각 ${S.order.length}개 · ${sum.toLocaleString()}행`)
  S.precheck.done = true
  save(S)
}

// ---------- 1단계 적재 ----------
function tail(S) {
  if (!fs.existsSync(F.glog)) return false
  const fd = fs.openSync(F.glog, 'r')
  const size = fs.fstatSync(fd).size
  if (size <= (S.logOff || 0)) return fs.closeSync(fd), false
  const buf = Buffer.alloc(size - (S.logOff || 0))
  fs.readSync(fd, buf, 0, buf.length, S.logOff || 0)
  fs.closeSync(fd)
  const cut = buf.lastIndexOf(0x0a)
  if (cut < 0) return false
  S.logOff = (S.logOff || 0) + cut + 1
  let m
  for (const l of buf.subarray(0, cut).toString('utf8').split(/\r?\n/)) {
    if ((m = l.match(/^시작 (\S+) (\S+)$/)) && chunkOf(S, m[1])) Object.assign(chunkOf(S, m[1]), { st: '진행', s: Date.parse(m[2]), e: null })
    else if ((m = l.match(/^완료 (\S+) (\S+)$/)) && chunkOf(S, m[1])) Object.assign(chunkOf(S, m[1]), { st: '완료', e: Date.parse(m[2]), err: null })
    else if ((m = l.match(/^실패 (\S+) : (.*)$/)) && chunkOf(S, m[1])) {
      Object.assign(chunkOf(S, m[1]), { st: '실패', e: Date.now(), err: m[2].slice(0, 300) })
      warn(S, `조각 실패 ${m[1]} : ${m[2].slice(0, 200)}`)
    } else if (/^끝 · /.test(l)) {
      S.genEnded = S.genPid
      log('생성기 ' + l)
    } else if (/^(조각 |진행 )/.test(l)) log('생성기 ' + l)
  }
  return true
}

// 생성기 state(진실 원천)와 맞춤
function syncFromState(S) {
  for (const id of readSt()) {
    const c = chunkOf(S, id)
    if (c && c.st !== '완료') Object.assign(c, { st: '완료', e: c.e || Date.now(), err: null })
  }
}

// 부분합 : 진행 조각 중 실제로 커밋된 조합(≤ jobs 개 → 2^7 열거)
function subsetSum(sizes, target) {
  for (let m = 0; m < 1 << sizes.length; m++) if (sizes.reduce((s, z, i) => (m & (1 << i) ? s + z : s), 0) === target) return sizes.map((_, i) => i).filter(i => m & (1 << i))
  return null
}

// 비정상 종료로 남은 '진행' 조각 정리 : 잔여 INSERT 가 끝난 뒤 건수 대조 → 커밋된 조각은 완료 처리, 맞는 조합이 없으면 그 테이블 TRUNCATE 후 처음부터
async function reconcile(S) {
  syncFromState(S)
  if (!allChunks(S).some(c => c.st === '진행')) return
  const db = DB()
  while (+(await psql(db, `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle' AND ${INS};`)) > 0) {
    log('건수 대조 대기 — 잔여 INSERT 백엔드 종료 대기')
    await sleep(10000)
  }
  syncFromState(S)
  const st = readSt()
  for (const t of Object.values(S.tables)) {
    const run = Object.entries(t.chunks).filter(([, c]) => c.st === '진행')
    if (!run.length) continue
    const done = Object.values(t.chunks).filter(c => c.st === '완료').reduce((s, c) => s + c.sz, 0)
    const cnt = +(await psql(db, `SELECT count(*) FROM ${t.tbl};`))
    const pick = subsetSum(run.map(([, c]) => c.sz), cnt - done)
    if (pick) {
      run.forEach(([id, c], i) => {
        if (pick.includes(i)) {
          Object.assign(c, { st: '완료', e: Date.now(), recon: true })
          st.add(id)
        } else Object.assign(c, { st: '대기', s: null })
      })
      log(`건수 대조 ${t.tbl} : 실제 ${cnt} · 완료 처리 ${pick.length} · 재적재 ${run.length - pick.length}`)
    } else {
      await psql(db, `TRUNCATE ${t.tbl};`)
      for (const [id, c] of Object.entries(t.chunks)) {
        Object.assign(c, { st: '대기', s: null, e: null })
        st.delete(id)
      }
      warn(S, `건수 대조 불일치 ${t.tbl}(실제 ${cnt} · 완료 조각 합 ${done}) → TRUNCATE 후 재적재`)
    }
  }
  writeSt(st)
  save(S)
}

// 실행 중인 본 DB 생성기(node datagen.mjs run --db prod) PID — 명령줄로 찾음(기록 PID 와 무관한 최종 중복 방지). 조회 실패 = 예외(기동 안 함)
function genProcs() {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { [string]$_.ProcessId + '|' + $_.CommandLine }"], { windowsHide: true }).toString()
  return out
    .split(/\r?\n/)
    .map(l => l.split('|'))
    .filter(([, cmd]) => cmd && /datagen\.mjs"?\s+run\b/.test(cmd) && /--db\s+prod\b/.test(cmd))
    .map(([pid]) => +pid)
}

function spawnGen(S) {
  const live = genProcs()
  if (live.length) throw new Error(`생성기 실행 중(PID ${live.join(',')}) — 중복 기동 차단`)
  for (const c of allChunks(S)) if (c.st === '실패') Object.assign(chunkOf(S, c.id), { st: '대기' })
  const fd = fs.openSync(F.glog, 'a')
  const p = spawn(process.execPath, [F.gen, 'run', '--db', 'prod', '--yes', '--schema', 'public', '--scale', String(C.scale), '--jobs', String(C.jobs)], { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd], windowsHide: true })
  p.unref()
  fs.closeSync(fd)
  S.genPid = p.pid
  S.genEnded = null
  S.genRuns = (S.genRuns || 0) + 1
  S.loadStart ||= Date.now()
  log(`생성기 기동 PID ${p.pid} (${S.genRuns}회차, --scale ${C.scale} --jobs ${C.jobs})`)
  save(S)
}

async function load(S) {
  S.phase = '적재'
  syncFromState(S)
  if (alive(S.genPid)) log(`생성기 PID ${S.genPid} 실행 중 — 감시 재연결`)
  for (;;) {
    tail(S)
    if (S.softStopped) {
      // 1차 중단 : 진행 INSERT 가 끝날 때까지 감시만(그 사이 20GB 미만이면 감시 tick 이 2차 정지)
      while (+(await psql(DB(), `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle' AND ${INS};`)) > 0) await sleep(10000)
      log('1차 중단 — 진행 조각 종료 확인, 실행기 종료(재시작 = start, 건수 대조로 완료 조각 반영)')
      S.phase = '중단'
      save(S)
      return false
    }
    if (!S.genPid || !alive(S.genPid)) {
      tail(S)
      syncFromState(S)
      const failed = allChunks(S).filter(c => c.st === '실패')
      if (S.genPid && S.genEnded === S.genPid) {
        if (failed.length > C.failStop) return stopProcedure(S, `실패 조각 ${failed.length}건 > ${C.failStop}`).then(() => false)
        if (!failed.length || S.failRetried) break
        S.failRetried = true
        warn(S, `실패 조각 ${failed.length}건 — 1회 자동 재시도`)
      } else if (S.genPid) {
        if ((S.abrupt = (S.abrupt || 0) + 1) > 3) return stopProcedure(S, '생성기 비정상 종료 3회 초과').then(() => false)
        warn(S, `생성기 PID ${S.genPid} 비정상 종료 — 건수 대조 후 재기동`)
      }
      if (loadDone(S)) break
      if ((await disk(S)).freeGB < C.diskStopGB) {
        warn(S, `C: 여유 ${S.disk.freeGB.toFixed(1)}GB < ${C.diskStopGB}GB — 생성기 기동 안 함`)
        S.phase = '중단'
        save(S)
        return false
      }
      // 기록 PID 가 죽었어도 명령줄로 살아 있는 생성기가 보이면 새로 띄우지 않고 그 PID 를 감시
      const live = genProcs()
      if (live.length) {
        warn(S, `살아 있는 생성기 PID ${live.join(',')} 발견 — 새로 띄우지 않고 감시 재연결`)
        S.genPid = live[0]
        S.genEnded = null
        continue
      }
      await reconcile(S)
      spawnGen(S)
    }
    save(S)
    await sleep(C.tailMs)
  }
  S.loadEnd = Math.max(...allChunks(S).map(c => c.e || 0))
  const failed = allChunks(S).filter(c => c.st === '실패')
  if (failed.length) warn(S, `재시도 후에도 실패 조각 ${failed.length}건 — 제약 단계는 진행(제약 SQL 재실행 안전), 재적재는 start 재실행`)
  save(S)
  return true
}

// ---------- 2단계 제약·ANALYZE·검증 ----------
async function step(S, id, nm, fn, rows = 0) {
  const x = (S.steps[id] ||= { id, nm, st: '대기', rows })
  if (x.st === '완료') return true
  if (S.softStopped || S.hardStopped) return false // 디스크 중단 뒤 새 단계 시작 안 함
  Object.assign(x, { st: '진행', s: Date.now(), e: null, note: null })
  log(`단계 시작 ${nm}`)
  save(S)
  try {
    x.note = (await fn())?.slice(0, 2000) || null
    Object.assign(x, { st: '완료', e: Date.now() })
    log(`단계 완료 ${nm} (${dur(x.e - x.s)})`)
  } catch (e) {
    Object.assign(x, { st: '실패', e: Date.now(), note: e.message.slice(0, 600) })
    warn(S, `단계 실패 ${nm} : ${e.message.slice(0, 200)}`)
  }
  save(S)
  return x.st === '완료'
}

async function finish(S) {
  const db = DB()
  // 디스크 게이트 : 제약 후 여유 = 지금 여유 - D·r - WAL 예비 < 50GB 이면 큰 4영역 보조 인덱스(x_*, 비유일) 지연
  if (!S.gate) {
    const d = await disk(S)
    const needGB = d.dbGB * S.ratio.r + C.walReserveGB
    S.gate = { at: Date.now(), dbGB: d.dbGB, r: S.ratio.r, freeGB: d.freeGB, needGB, afterGB: d.freeGB - needGB, defer: d.freeGB - needGB < C.diskGateGB, list: [] }
    log(`디스크 게이트 : D ${d.dbGB.toFixed(1)}GB · r ${S.ratio.r.toFixed(3)} · 예상 소요 ${needGB.toFixed(1)}GB · 제약 후 여유 ${S.gate.afterGB.toFixed(1)}GB → ${S.gate.defer ? '큰 4영역 보조 인덱스 지연' : '전부 생성'}`)
  }
  S.phase = '제약'
  save(S)
  const queue = [...C.conOrder]
  const rowsOf = a => Object.values(S.tables).filter(t => t.area === a).reduce((s, t) => s + t.n, 0)
  await Promise.all(
    Array.from({ length: C.conSessions }, async () => {
      while (queue.length) {
        const a = queue.shift()
        await step(S, 'CON_' + a, `제약 ${a}(${AREA_NM[a]}) PK·인덱스`, async () => {
          let sql = fs.readFileSync(path.join(F.ddl, CON_FILE[a] + '_constraints.sql'), 'utf8')
          if (S.gate.defer && C.bigAreas.includes(a)) {
            const re = /^CREATE INDEX IF NOT EXISTS x_\S+ ON [^;]+;$/gm
            const moved = sql.match(re) || []
            sql = sql.replace(re, '-- 지연(디스크 게이트)')
            S.gate.list.push(...moved)
            atomicWrite(F.deferred, `-- 디스크 게이트로 지연한 보조 인덱스 — 여유 확보 후 pitel 에 실행\nSET search_path = public;\n${S.gate.list.join('\n')}\n`)
          }
          await psql(db, `SET search_path = public;\n${sql}`)
          return S.gate.defer && C.bigAreas.includes(a) ? '보조 인덱스 지연 — database/deferred_indexes.sql' : null
        }, rowsOf(a))
      }
    }),
  )
  if (!(await step(S, 'ANALYZE', 'ANALYZE(본 DB 전체)', () => psql(db, 'ANALYZE;')))) return
  await step(S, 'VERIFY', '검증 verify.mjs(FK 고아 비율·편향 지표)', () =>
    new Promise((res, rej) => {
      const p = spawn(process.execPath, [F.verify, '--db', 'prod', '--schema', 'public'], { cwd: ROOT, windowsHide: true })
      let out = ''
      p.stdout.on('data', d => (out += d))
      p.stderr.on('data', d => (out += d))
      p.on('close', code => (code === 0 ? res(out.trim()) : rej(new Error(out.trim().slice(-600)))))
    }),
  )
  await step(S, 'RESTORE', 'autovacuum·절전 원복', async () => {
    await psql(db, `ALTER SYSTEM SET autovacuum = '${S.sysOrig.autovacuum}';`)
    await psql(db, `SELECT pg_reload_conf();`)
    if (S.powerOrig?.standby != null) execFileSync('powercfg', ['/change', 'standby-timeout-ac', String(Math.round(S.powerOrig.standby / 60))])
    if (S.powerOrig?.hibernate != null) execFileSync('powercfg', ['/change', 'hibernate-timeout-ac', String(Math.round(S.powerOrig.hibernate / 60))])
    return `autovacuum = ${S.sysOrig.autovacuum} · 절전 AC ${S.powerOrig?.standby}초 복원(나머지 설정 max_wal_size 등은 변경값 유지)`
  })
  S.phase = Object.values(S.steps).some(x => x.st === '실패') || allChunks(S).some(c => c.st === '실패') ? '완료(실패 포함)' : '완료'
  S.endAt = Date.now()
  save(S)
}

// ---------- 진입 ----------
// 디스크 판정 : 20GB 미만 = hard(진행 조각까지), 40GB 미만 = soft(새 조각만), 이미 같은 단계로 멈췄거나 완료면 없음
function diskAction(free, S) {
  if (free < C.diskKillGB && !S.hardStopped && !/완료/.test(S.phase)) return 'hard'
  if (free < C.diskStopGB && !S.softStopped && !S.hardStopped && !/중단|완료/.test(S.phase)) return 'soft'
  return null
}

async function main() {
  const S = loadS()
  if (S.pid && S.pid !== process.pid && alive(S.pid)) return log(`이미 실행 중 PID ${S.pid} — 종료`)
  S.pid = process.pid
  S.startedAt ||= Date.now()
  S.runs = (S.runs || 0) + 1
  if (S.phase === '중단') Object.assign(S, { phase: '재시작', softStopped: false, hardStopped: false, abrupt: 0 })
  log(`실행기 시작 PID ${process.pid} (${S.runs}회차)`)
  save(S)
  const tick = async () => {
    const d = await disk(S)
    log(`감시 C: 여유 ${d.freeGB.toFixed(1)}GB · DB ${d.dbGB?.toFixed(1)}GB · vhdx ${d.vhdxGB?.toFixed(1)}GB · 진행 조각 ${allChunks(S).filter(c => c.st === '진행').length}`)
    const act = diskAction(d.freeGB, S)
    if (act === 'hard') {
      await stopProcedure(S, `C: 여유 ${d.freeGB.toFixed(1)}GB < ${C.diskKillGB}GB — 진행 조각까지 정지`)
      process.exit(2)
    }
    if (act === 'soft') await stopProcedure(S, `C: 여유 ${d.freeGB.toFixed(1)}GB < ${C.diskStopGB}GB — 새 조각 중지, 진행 조각은 끝까지`, { soft: true })
    save(S)
  }
  const timer = setInterval(() => tick().catch(e => log('감시 오류 ' + e.message)), C.tickMs)
  try {
    if (!S.precheck?.done) await precheck(S)
    await tick()
    if (!loadDone(S) && !(await load(S))) return
    await finish(S)
    log(`종료 — ${S.phase}`)
  } catch (e) {
    warn(S, '실행기 오류 : ' + e.message.slice(0, 400))
    S.phase = '중단'
    S.stopRec = { at: Date.now(), reason: '실행기 오류 — ' + e.message.slice(0, 200), active: [] }
    save(S)
    process.exitCode = 1
  } finally {
    clearInterval(timer)
  }
}

function selftest() {
  const assert = (c, m) => {
    if (!c) throw new Error('selftest 실패 : ' + m)
  }
  assert(JSON.stringify(subsetSum([5, 7, 9], 16)) === '[1,2]', 'subsetSum 조합')
  assert(JSON.stringify(subsetSum([5, 7], 0)) === '[]', 'subsetSum 0')
  assert(subsetSum([5, 7], 3) === null, 'subsetSum 없음')
  const e = simulate(0, [], [{ id: 'a', sz: 10 }, { id: 'b', sz: 10 }, { id: 'c', sz: 10 }], 1, 2)
  assert(e.a === 11000 && e.b === 11000 && e.c === 22000, '모의 큐 2 워커')
  const S = { tables: { t1: { tbl: 't1', area: 'PAY', n: 30, chunks: { 't1:2010': { sz: 10, st: '완료', s: 0, e: 5000 }, 't1:2011': { sz: 20, st: '진행', s: 1000 } } } }, steps: {}, warns: [{ at: 0, m: '<x>' }], order: ['t1:2010', 't1:2011'] }
  const v = tableView(S.tables.t1, 6000, computeEta(S, 6000).chunkEnd)
  assert(v.st === '진행' && v.actual === 10 && v.done === 1 && v.eta > 6000, '테이블 보기')
  assert(diskAction(100, { phase: '적재' }) === null && diskAction(39, { phase: '적재' }) === 'soft' && diskAction(39, { phase: '중단', softStopped: true }) === null && diskAction(19, { phase: '중단', softStopped: true }) === 'hard' && diskAction(19, { phase: '중단', hardStopped: true }) === null && diskAction(5, { phase: '완료' }) === null, '디스크 2단 중단선')
  const h = renderHtml0(S, 6000, CTX)
  assert(h.includes('t1') && h.includes('&lt;x&gt;') && !h.includes('<x>'), 'HTML 이스케이프')
  // 실제 기록으로 미리보기 — 4건 수정(적재 행·KST·[가정]·해소 경고) 반영 확인
  const R = loadS()
  if (R.order?.length) {
    const p = renderHtml0(R, Date.now(), CTX)
    atomicWrite(F.preview, p)
    assert(p.includes('<td>적재(생성기') && p.includes('시작일시(KST)') && p.includes('[가정]') && (!R.warns.some(w => w.at < R.loadStart) || p.includes('해소된 이전 회차')), '미리보기 4건')
    // 재시작 보장(b) : 기록된 생성기가 살아 있으면 명령줄 조회가 그 PID 를 찾아야 한다(못 찾으면 중복 기동 위험)
    if (alive(R.genPid)) assert(genProcs().includes(R.genPid), `생성기 PID ${R.genPid} 명령줄 감지`)
    console.log(`미리보기 ${F.preview} · 생성기 ${R.genPid} ${alive(R.genPid) ? '실행 중·명령줄 감지됨' : '정지'}`)
  }
  console.log('selftest 통과')
}

const cmd = process.argv[2]
if (cmd === '--selftest') selftest()
else if (cmd === 'run') main()
else if (cmd === 'html') atomicWrite(F.html, renderHtml0(loadS(), Date.now(), CTX))
else if (cmd === 'preview') atomicWrite(F.preview, renderHtml0(loadS(), Date.now(), CTX))
else if (cmd === 'restart') {
  // (a) 실행기만 종료 — /T 없음 : 생성기는 분리 프로세스라 영향 없음. 새 실행기는 load() 에서 alive(genPid)·genProcs() 로 감시만 이어감
  const S = loadS()
  const before = genProcs()
  if (alive(S.pid)) execFileSync('taskkill', ['/PID', String(S.pid), '/F'], { stdio: 'ignore' })
  for (let i = 0; i < 20 && alive(S.pid); i++) execFileSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 500'])
  const after = genProcs()
  console.log(`실행기 ${S.pid} 종료 · 생성기 전 [${before}] 후 [${after}]`)
  if (before.join() !== after.join()) console.log('경고 : 생성기 목록이 바뀜 — 확인 필요')
  startRunner()
}
else if (cmd === 'stop') {
  const S = loadS()
  stopProcedure(S, '수동 정지(stop 명령)', { runnerToo: true }).then(() => console.log('정지 완료 — 재시작 : node database/run-init.mjs start'))
} else if (cmd === 'start') startRunner()
else console.log('사용 : node database/run-init.mjs start|stop|restart|html|preview|--selftest')

function startRunner() {
  const S = loadS()
  if (alive(S.pid)) console.log(`이미 실행 중 PID ${S.pid}`)
  else {
    const fd = fs.openSync(F.log, 'a')
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run'], { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd], windowsHide: true })
    p.unref()
    console.log(`실행기 PID ${p.pid} · 로그 ${F.log} · 기록 ${F.html}`)
  }
}

// pitel 샘플 DB(Pi통신 과금 · 테이블 214 · 배율 1 = 약 11억 행) 원클릭 재구축 — 컨테이너 → DB → 테이블 → 데이터 → PK·인덱스 → ANALYZE → 검증 → 요약
// 기존 도구를 그대로 부름 : datagen/datagen.mjs(테이블·적재) · ddl/*_constraints.sql(PK·인덱스) · datagen/verify.mjs(검증). 매뉴얼 = REBUILD.md
// 실행 : node rebuild.mjs plan [옵션](계획만 — 아무것도 바꾸지 않음) | node rebuild.mjs [옵션](실행·끊긴 곳부터 이어서) | --help | --selftest
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import readline from 'node:readline'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { fmt, dur } from './database/render-html.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const P = {
  env: path.join(HERE, '.env.local'),
  gen: path.join(HERE, 'datagen/datagen.mjs'),
  verify: path.join(HERE, 'datagen/verify.mjs'),
  plan: path.join(HERE, 'datagen/out/plan.json'),
  stateDir: path.join(HERE, 'datagen/state'),
  ddl: path.join(HERE, 'ddl'),
  dbDir: path.join(HERE, 'database'),
}

// 기본값 = 지난 주말(2026-11-07) pitel-pg 구성 그대로 — 근거 docker inspect pitel-pg(Cmd·Mounts·ShmSize) · CONTEXT.md D2·D13
const DEF = { name: 'pitel-pg', port: 55432, volume: 'pitel-pgdata', image: 'postgres:17', shm: '1g', scale: 1, verifyConc: 1 }
const PG = {
  shared_buffers: '2GB',
  maintenance_work_mem: '1GB',
  work_mem: '64MB',
  max_wal_size: '16GB',
  checkpoint_timeout: '30min',
  wal_level: 'logical',
  max_replication_slots: '10',
  max_wal_senders: '10',
  synchronous_commit: 'off',
  max_parallel_workers_per_gather: '4',
  max_worker_processes: '16',
  effective_cache_size: '4GB',
  random_page_cost: '1.1',
  shared_preload_libraries: 'pg_stat_statements',
  track_io_timing: 'on',
}
// 배율 1 실측(2026-11-07~08, database/run-init.log·datagen.log·verify.log) — 계획 출력의 소요·디스크 추정 근거
const M = {
  rows: 1101170707, // 배율 1 목표 행
  rows0001: 2270702, // 배율 0.001 목표 행(기준 테이블은 배율과 무관하게 고정이라 작은 배율은 선형보다 많음)
  loadS: 17015, // 적재 4시간 43분(동시 7, 2,086 조각, 실패 0)
  conS: 4514, // PK·인덱스 1시간 15분(동시 3)
  analyzeS: 784, // ANALYZE 13분
  verifyS: 4980, // 검증 실효 약 1시간 23분(동시 3 + 남은 10건 동시 1) — 처음부터 동시 1 은 실측 없음 [확인중 : 배율 1 동시 1 검증 실측]
  dbGB: 275, // 제약·ANALYZE 뒤 DB 크기 274.6GB
  walGB: 16, // max_wal_size
  marginGB: 40, // run-init 1차 중단선
}
const EXPECT = { tables: 214, parts: 2306, pk: 214, ix: 318, rowTol: 0.0001 } // reviews/08 3절 · reviews/10 1절, 파티션 수는 배율과 무관, rowTol = reltuples(ANALYZE 추정) 허용 차이 0.01%(배율 1 실측 reltuples 1,101,169,280 = 0.00013%, 2026-11-12 조회)
const CON = ['40_pay', '60_col', '50_inv', '30_ord', '20_cus', '70_prm', '10_prd'] // 큰 영역 먼저(run-init C.conOrder 와 같은 순서)
const CON_CONC = 3
const CHUNK = { min: 1000000, years: [2010, 2026] } // datagen.mjs C.chunkMin·C.years 와 같은 값(조각 id 계산용)
const STEPS = [
  ['container', '컨테이너 준비(생성·재사용·기동 대기)'],
  ['db', 'DB 생성(pitel·pitel_dev) + pg_stat_statements'],
  ['ddl', '테이블 214 생성(파티션 포함, PK·인덱스 없음)'],
  ['data', '데이터 생성·적재'],
  ['constraints', `PK·인덱스 ${EXPECT.pk + EXPECT.ix}(영역별 동시 ${CON_CONC})`],
  ['analyze', 'ANALYZE + autovacuum 원복'],
  ['verify', '검증(FK 고아 비율·편향 지표)'],
  ['summary', '결과 요약(행 수·인덱스·DEFAULT 파티션)'],
]
const STEP_IDS = STEPS.map(s => s[0])
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/ // docker 컨테이너·볼륨 이름 규칙
const LOADER_NOTE = 'schema.pi 운영 메타 적재(loader)는 이 스크립트가 하지 않음 — 마스터 직접 실행 : REBUILD.md 8절 · reviews/11_phase2_approval.md 6절'

const HELP = `사용 : node rebuild.mjs [plan] [옵션]
  plan                  계획·사전점검·예상 소요·디스크만 출력(아무것도 바꾸지 않음)
  (없음)                실행 — 끊겼으면 끊긴 단계부터 이어서
  --scale N             데이터 배율(기본 ${DEF.scale} = 약 11억 행, 시험 0.001 = 약 227만 행)
  --jobs N              생성기 동시 세션(기본 = Docker CPU - 1)
  --verify-conc N       검증 동시 쿼리(기본 ${DEF.verifyConc} — 3 은 --shm 1g 에서 공유 메모리 부족 실패 이력)
  --from 단계           그 단계부터 다시(${STEP_IDS.join(' · ')})
  --reset --yes         초기화 : 컨테이너·볼륨·진행 기록을 지우고 처음부터(둘 다 있어야 실행, --yes 없으면 대상만 출력) — 볼륨 데이터 영구 삭제·되돌릴 수 없음(배율 1 재구축 약 7시간 40분)
  --name 이름           컨테이너(기본 ${DEF.name})
  --port N              호스트 포트(기본 ${DEF.port})
  --volume 이름         데이터 볼륨(기본 ${DEF.volume})
  --image 이미지        (기본 ${DEF.image})
  --shm 크기            /dev/shm(기본 ${DEF.shm})
  --pg k=v,k=v          postgres 기동 설정 덮어쓰기·추가(기본 ${Object.keys(PG).length}개 = 지난 주말과 같음)
  --help · --selftest
로그 database/rebuild_<컨테이너>.log · 진행 기록 datagen/state/rebuild_<컨테이너>.json · 매뉴얼 REBUILD.md`

// ---------- 인자 ----------
function parseArgs(argv) {
  const o = { cmd: 'run', ...DEF, pg: { ...PG }, jobs: null, from: null, reset: false, yes: false }
  const val = (i, k) => {
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(`${k} 값 없음`)
    return argv[i + 1]
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === 'plan') o.cmd = 'plan'
    else if (a === '--help' || a === '-h') o.cmd = 'help'
    else if (a === '--selftest') o.cmd = 'selftest'
    else if (a === '--reset') o.reset = true
    else if (a === '--yes') o.yes = true
    else if (['--name', '--volume', '--image', '--shm', '--from'].includes(a)) o[a.slice(2)] = val(i++, a)
    else if (['--port', '--scale', '--jobs', '--verify-conc'].includes(a)) o[a.slice(2).replace('-c', 'C')] = +val(i++, a)
    else if (a === '--pg')
      for (const kv of val(i++, a).split(',')) {
        const m = kv.match(/^([a-z_]+)=([\w.]+)$/)
        if (!m) throw new Error(`--pg 형식 오류 : ${kv}(k=v)`)
        o.pg[m[1]] = m[2]
      }
    else throw new Error(`알 수 없는 인자 : ${a}`)
  }
  if (!NAME_RE.test(o.name) || !NAME_RE.test(o.volume)) throw new Error('--name·--volume 은 영문·숫자·_.- 만')
  if (!(o.scale > 0)) throw new Error('--scale 은 0 보다 커야 함')
  if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) throw new Error('--port 오류')
  if (o.jobs != null && !(Number.isInteger(o.jobs) && o.jobs >= 1)) throw new Error('--jobs 는 1 이상 정수')
  if (!(Number.isInteger(o.verifyConc) && o.verifyConc >= 1)) throw new Error('--verify-conc 는 1 이상 정수')
  if (o.from && !STEP_IDS.includes(o.from)) throw new Error(`--from 단계 : ${STEP_IDS.join(' · ')}`)
  return o
}

// ---------- 공용 ----------
const sleep = ms => new Promise(r => setTimeout(r, ms))
let LOG = null
const log = m => {
  const l = `[${fmt(Date.now())}] ${m}`
  console.log(l)
  if (LOG) fs.appendFileSync(LOG, l + '\n')
}
const docker = (...args) => {
  const r = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true })
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim() }
}
const pre = o => (o.name === DEF.name ? '' : o.name + '_') // datagen.mjs ST_PRE 와 같은 규칙
const stFile = o => path.join(P.stateDir, `rebuild_${o.name}.json`)
const genSt = (o, db) => path.join(P.stateDir, `${pre(o)}${db}_public_${o.scale}.json`)
const verifySt = o => (o.name === DEF.name ? path.join(P.dbDir, 'verify_state.json') : path.join(P.stateDir, `verify_${o.name}.json`)) // verify.mjs F.state 와 같은 규칙
const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d)
const save = (o, S) => {
  fs.mkdirSync(P.stateDir, { recursive: true })
  fs.writeFileSync(stFile(o) + '.tmp', JSON.stringify(S, null, 1))
  fs.renameSync(stFile(o) + '.tmp', stFile(o))
}
// 데이터 배율별 추정 — 필요 디스크(GB)·단계 소요(ms)
const needGB = s => M.dbGB * s + (s >= 0.1 ? M.walGB + M.marginGB : 5)
const estRows = s => (s === 1 ? M.rows : s === 0.001 ? M.rows0001 : Math.round(M.rows * s))
const chunkIds = p => (p.n < CHUNK.min ? [`${p.tbl}:all`] : Array.from({ length: CHUNK.years[1] - CHUNK.years[0] + 1 }, (_, i) => `${p.tbl}:${CHUNK.years[0] + i}`))
// 첫 실행 단계 — --from 이 있으면 그 단계, 없으면 완료 안 된 첫 단계(전부 완료 = 단계 수). 컨테이너 단계는 이와 별개로 늘 먼저 다시 확인(멱등)
const startIdx = (S, from) => {
  if (from) return STEP_IDS.indexOf(from)
  const i = STEP_IDS.findIndex(id => id !== 'container' && S.steps?.[id]?.st !== '완료')
  return i < 0 ? STEP_IDS.length : i
}

// DB 이름·비밀번호는 .env.local URL 에서(값 출력 금지). 없으면 기본 이름
function envInfo() {
  if (!fs.existsSync(P.env)) return { exists: false, db: 'pitel', dev: 'pitel_dev', pw: null }
  const t = fs.readFileSync(P.env, 'utf8')
  const url = k => t.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim()
  const u = url('PITEL_DB_URL') && new URL(url('PITEL_DB_URL'))
  const d = url('PITEL_DEV_DB_URL') && new URL(url('PITEL_DEV_DB_URL'))
  if (!u || !d) throw new Error('.env.local 에 PITEL_DB_URL·PITEL_DEV_DB_URL 둘 다 필요')
  return { exists: true, db: u.pathname.slice(1), dev: d.pathname.slice(1), pw: decodeURIComponent(u.password) }
}

function psql(o, db, sql) {
  return new Promise((res, rej) => {
    const p = spawn('docker', ['exec', '-i', o.name, 'psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-At'], { windowsHide: true })
    let out = ''
    let err = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (err += d))
    p.on('error', rej)
    p.on('close', code => (code === 0 ? res(out.trim()) : rej(new Error(err.trim().slice(0, 600) || `psql 종료 ${code}`))))
    p.stdin.end(sql)
  })
}

// 기존 node 도구 실행 — 전체 출력은 로그 파일(file, null = 안 씀), show 에 맞는 줄만 화면·rebuild 로그. 컨테이너는 환경변수 PITEL_CONTAINER 로 넘김
function runNode(o, args, file, show = () => true) {
  return new Promise(res => {
    const p = spawn(process.execPath, args, { cwd: HERE, env: { ...process.env, PITEL_CONTAINER: o.name }, windowsHide: true })
    const fd = file ? fs.openSync(file, 'a') : null
    let last = ''
    for (const s of [p.stdout, p.stderr])
      readline.createInterface({ input: s }).on('line', l => {
        if (fd) fs.writeSync(fd, l + '\n')
        if (l.trim()) last = l
        if (show(l)) log('  ' + l)
      })
    p.on('close', code => {
      if (fd) fs.closeSync(fd)
      res({ code, last })
    })
  })
}

// 동시 n 개로 처리
async function pool(items, n, fn) {
  const q = [...items]
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()) }))
}

// 실행 중 Windows 절전 막기(설정은 바꾸지 않음 — 이 프로세스가 끝나면 자동 해제). ES_CONTINUOUS|ES_SYSTEM_REQUIRED
function keepAwake() {
  if (process.platform !== 'win32') return
  const ps = `Add-Type -Name P -Namespace W -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'; [W.P]::SetThreadExecutionState([uint32]2147483649) | Out-Null; Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue`
  // unref — 자식이 node 종료를 기다리므로(Wait-Process) node 쪽은 자식을 기다리지 않아야 교착이 없다
  spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true, stdio: 'ignore' }).on('error', () => log('경고 : 절전 막기 실패 — Windows 설정에서 절전 "안 함"으로')).unref()
}

const portFree = port =>
  new Promise(res => {
    const s = net.createServer()
    s.once('error', () => res(false))
    s.once('listening', () => s.close(() => res(true)))
    s.listen(port, '0.0.0.0')
  })

function containerInfo(o) {
  const r = docker('inspect', '-f', '{{.State.Running}}|{{json .HostConfig.PortBindings}}|{{range .Mounts}}{{.Name}} {{end}}|{{.Config.Image}}', o.name)
  if (!r.ok) return null
  const [running, ports, mounts, image] = r.out.split('|')
  return { running: running === 'true', port: +(ports.match(/"HostPort":"(\d+)"/)?.[1] || 0), volumes: mounts.trim().split(' ').filter(Boolean), image }
}

// 본 DB public 의 ptl_ 표 바이트(없으면 null — DB 없음·컨테이너 꺼짐)
async function tableBytes(o, db) {
  try {
    return +(await psql(o, db, `SELECT coalesce(sum(pg_relation_size(oid)), 0) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE 'ptl\\_%';`))
  } catch {
    return null
  }
}

// ---------- 사전점검(plan·실행 공통, 읽기만) ----------
async function precheck(o, S) {
  const items = []
  const add = (nm, ok, note, fatal = true) => items.push({ nm, ok, note, fatal })
  const ver = docker('version', '--format', '{{.Server.Version}}')
  add('Docker 엔진', ver.ok, ver.ok ? ver.out : `응답 없음 — Docker Desktop 을 켜고 다시(${ver.err.split('\n')[0].slice(0, 120)})`)
  const nodeMajor = +process.versions.node.split('.')[0]
  add('Node 22 이상', nodeMajor >= 22, 'v' + process.versions.node)
  add('postgres 패키지(메타 적재기 전용 — 재구축엔 불필요)', fs.existsSync(path.join(HERE, '../node_modules/postgres/package.json')), '없으면 저장소 루트에서 pnpm install', false)
  if (!ver.ok) return (o.jobs ??= 7), items
  const [ncpu, mem] = docker('info', '--format', '{{.NCPU}}|{{.MemTotal}}').out.split('|').map(Number)
  o.jobs ??= Math.max(1, (ncpu || 8) - 1)
  add('Docker CPU·메모리', true, `${ncpu} CPU · ${(mem / 1e9).toFixed(1)}GB → 생성기 동시 ${o.jobs}`, false)

  const c = containerInfo(o)
  const gone = o.reset // 초기화하면 지금 컨테이너·볼륨은 지워짐
  if (c && !gone) {
    add(`컨테이너 ${o.name}`, true, `있음 · ${c.running ? '실행 중' : '정지(기동 예정)'} · 포트 ${c.port} · 볼륨 ${c.volumes.join(',')} · ${c.image} → 재사용`, false)
    if (c.port !== o.port) add('포트 일치', false, `기존 컨테이너 포트 ${c.port} ≠ 요청 ${o.port} — 기존 컨테이너 그대로 씀`, false)
  } else {
    if (!(c && gone)) add(`포트 ${o.port} 비어 있음`, await portFree(o.port), '사용 중이면 --port 로 다른 포트')
    const vol = docker('volume', 'inspect', o.volume).ok
    add(`컨테이너 ${o.name}`, true, `${c ? '초기화로 삭제 후 ' : ''}새로 만듦 · 볼륨 ${o.volume}(${vol && !gone ? '있음 — 안의 데이터 재사용' : '새로'})`, false)
  }

  const root = path.parse(process.env.LOCALAPPDATA || 'C:/').root
  const freeGB = (s => (s.bavail * s.bsize) / 1e9)(fs.statfsSync(root))
  const need = needGB(o.scale)
  const fresh = !S.dataTries // 적재를 시작한 적 없음 — 시작 뒤엔 이미 쓴 만큼 여유가 줄어 판정 안 함
  add(`디스크 ${root} 여유(Docker 디스크 이미지 위치 가정)`, freeGB >= need || !fresh, `여유 ${freeGB.toFixed(0)}GB · 필요 약 ${need.toFixed(0)}GB(배율 ${o.scale} — DB ${(M.dbGB * o.scale).toFixed(1)}GB + 예비)`, fresh)

  // 이미 구축된 DB 보호 — 진행 기록 없이 데이터가 있으면 실행 안 함(초기화 또는 --from 으로만)
  if (c?.running && !gone) {
    const bytes = await tableBytes(o, envInfo().db)
    if (bytes > 0) add('기존 데이터', !!(S.dataTries || o.from), `${envInfo().db}.public 표 ${(bytes / 1e9).toFixed(1)}GB${S.dataTries ? ' — 이 재구축 기록의 데이터(이어서)' : o.from ? ` — --from ${o.from} 로 그 단계부터` : ' — 처음부터 = --reset --yes / 일부 단계만 = --from <단계>'}`)
  }
  return items
}

// ---------- 초기화(--reset --yes) ----------
function resetTargets(o) {
  const env = envInfo()
  const files = [stFile(o), verifySt(o), ...(fs.existsSync(P.stateDir) ? fs.readdirSync(P.stateDir).filter(f => f.startsWith(`${pre(o)}${env.db}_public_`) || f.startsWith(`${pre(o)}${env.dev}_`)).map(f => path.join(P.stateDir, f)) : [])].filter(f => fs.existsSync(f))
  return { ct: !!containerInfo(o), vol: docker('volume', 'inspect', o.volume).ok, files }
}
function doReset(o) {
  const t = resetTargets(o)
  log(`초기화 대상 — 컨테이너 ${o.name}(${t.ct ? '있음' : '없음'}) · 볼륨 ${o.volume}(${t.vol ? '있음' : '없음'}) · 진행 기록 ${t.files.length}개${t.files.map(f => '\n    ' + path.relative(HERE, f)).join('')}`)
  if (!o.yes) throw new Error('초기화는 --reset --yes 둘 다 있어야 실행 — 위 대상을 확인하고 --yes 를 붙여 다시')
  if (t.ct) {
    const r = docker('rm', '-f', o.name)
    if (!r.ok) throw new Error('컨테이너 삭제 실패 : ' + r.err)
    log(`삭제 컨테이너 ${o.name}`)
  }
  if (t.vol) {
    const r = docker('volume', 'rm', o.volume)
    if (!r.ok) throw new Error('볼륨 삭제 실패(다른 컨테이너가 쓰는 중?) : ' + r.err)
    log(`삭제 볼륨 ${o.volume}`)
  }
  for (const f of t.files) fs.unlinkSync(f)
  log('초기화 끝 — .env.local 은 남김(비밀번호 재사용)')
}

// .env.local 접속 주소 — URL 객체로 조립(비밀번호 = 실행 때 무작위, 문자열 템플릿을 소스에 두지 않음)
const dbUrl = (pw, port, db) => {
  const u = new URL('postgres://localhost')
  u.username = 'postgres'
  u.password = pw
  u.port = String(port)
  u.pathname = '/' + db
  return u.href
}

// ---------- 단계 ----------
const STEP = {
  async container(o, S) {
    const c = containerInfo(o)
    let { pw, exists } = envInfo()
    if (!exists) {
      pw = crypto.randomBytes(18).toString('base64url')
      const port = o.name === DEF.name ? o.port : DEF.port // 시험 이름(예 pitel-pg-rbtest)이 먼저 만들어도 URL 은 본 구축 포트 — 외부 접속 도구용(재구축은 docker exec 라 무관)
      fs.writeFileSync(P.env, `PITEL_DB_URL=${dbUrl(pw, port, 'pitel')}\nPITEL_DEV_DB_URL=${dbUrl(pw, port, 'pitel_dev')}\n`)
      log(`.env.local 새로 만듦(비밀번호 무작위 — 값은 출력 안 함)${c ? ' — 기존 컨테이너 비밀번호와 다름(외부 접속 도구만 영향, 재구축은 docker exec 라 무관)' : ''}`)
    }
    if (!c) {
      const volExisted = docker('volume', 'inspect', o.volume).ok
      const args = ['run', '-d', '--name', o.name, '--restart', 'unless-stopped', '-p', `${o.port}:5432`, '-e', 'POSTGRES_PASSWORD', '-v', `${o.volume}:/var/lib/postgresql/data`, `--shm-size=${o.shm}`, o.image, ...Object.entries(o.pg).flatMap(([k, v]) => ['-c', `${k}=${v}`])]
      log(`docker run ${o.name} · 포트 ${o.port} · 볼륨 ${o.volume} · ${o.image} · shm ${o.shm} · 설정 ${Object.keys(o.pg).length}개(이미지가 없으면 내려받기 수 분)`)
      const r = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, POSTGRES_PASSWORD: pw } }) // 비밀번호는 명령줄이 아닌 환경으로
      if (r.status !== 0) throw new Error('docker run 실패 : ' + (r.stderr || '').trim().slice(-400))
      if (!volExisted) {
        o.freshVol = true // 빈 볼륨 = DB 부터 — run() 이 재개 단계를 이 뒤에 계산
        if (Object.keys(S.steps).some(id => id !== 'container') || S.dataTries) log('새 볼륨 — 이전 진행 기록 무시하고 처음부터')
        Object.assign(S, { steps: { container: S.steps.container }, dataTries: 0 })
      }
    } else if (!c.running) {
      log(`docker start ${o.name}`)
      if (!docker('start', o.name).ok) throw new Error('docker start 실패')
    }
    // 준비 대기 — TCP 로 확인(초기화 중 임시 서버는 소켓만 열어 오판 방지)
    for (let i = 0; ; i++) {
      if (docker('exec', o.name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-q').ok) break
      if (i >= 90) throw new Error('3분 안에 준비되지 않음 — docker logs ' + o.name)
      await sleep(2000)
    }
    return { note: (await psql(o, 'postgres', `SELECT 'PostgreSQL ' || current_setting('server_version') || ' · wal_level ' || current_setting('wal_level') || ' · shared_buffers ' || current_setting('shared_buffers');`)) }
  },

  async db(o) {
    const { db, dev } = envInfo()
    const have = new Set((await psql(o, 'postgres', `SELECT datname FROM pg_database;`)).split('\n'))
    for (const d of [db, dev]) if (!have.has(d)) await psql(o, 'postgres', `CREATE DATABASE ${d};`)
    await psql(o, db, `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`)
    return { note: `${db}·${dev} (새로 ${[db, dev].filter(d => !have.has(d)).length}개)` }
  },

  async ddl(o) {
    const { db } = envInfo()
    // 생성기 --ddl = gen 함수 + 00_run_order.txt 의 _tables 를 public 에 생성, --only __none__ = 적재 0
    const r = await runNode(o, [P.gen, 'run', '--db', 'prod', '--yes', '--schema', 'public', '--scale', String(o.scale), '--ddl', '--only', '__none__'], path.join(P.dbDir, `datagen_${o.name}.log`), l => /DDL/.test(l))
    if (r.code !== 0) throw new Error('테이블 생성 실패 : ' + r.last)
    const [t, part] = (await psql(o, db, `SELECT count(*) FILTER (WHERE NOT relispartition), count(*) FILTER (WHERE relispartition) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND relname LIKE 'ptl\\_%';`)).split('|').map(Number)
    if (t !== EXPECT.tables) throw new Error(`테이블 ${t} ≠ ${EXPECT.tables}`)
    return { rows: 0, note: `테이블 ${t} · 파티션 하위 ${part.toLocaleString()}` }
  },

  async data(o, S) {
    const { db } = envInfo()
    const glog = path.join(P.dbDir, `datagen_${o.name}.log`)
    const { plans, target } = await planTarget(o, glog)
    const st = genSt(o, db)
    const resume = S.dataTries > 0
    if (!resume) {
      const bytes = await tableBytes(o, db)
      if (bytes) throw new Error(`표에 데이터가 이미 있음(${(bytes / 1e9).toFixed(1)}GB) — 처음부터 = --reset --yes`)
      fs.rmSync(st, { force: true }) // 지난 적재의 state 가 남으면 전부 건너뜀
    } else {
      // 앞 실행이 끊겼으면 남은 INSERT 가 끝날 때까지 — 커밋됐는데 state 에 없는 조각은 아래 건수 대조로 정리
      const busy = `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state <> 'idle' AND query ILIKE 'INSERT INTO ptl_%';`
      while (+(await psql(o, db, busy)) > 0) {
        log('  앞 실행의 남은 INSERT 종료 대기(10초)')
        await sleep(10000)
      }
    }
    const before = new Set(readJson(st, []))
    let suspect = resume ? plans.filter(p => !chunkIds(p).every(id => before.has(id))) : []
    S.dataTries = (S.dataTries || 0) + 1
    save(o, S)
    await psql(o, db, `ALTER SYSTEM SET autovacuum = off;\nSELECT pg_reload_conf();`) // 적재 중 autovacuum 끔(지난 주말 run-init 과 같음) — analyze 단계에서 원복
    log(`  목표 ${target.toLocaleString()}행 · 테이블 ${plans.length} · 동시 ${o.jobs} · 상세 로그 ${path.relative(HERE, glog)}${resume ? ` · 이어서(완료 조각 ${before.size} 건너뜀)` : ''}`)
    for (let round = 0; ; round++) {
      const r = await runNode(o, [P.gen, 'run', '--db', 'prod', '--yes', '--schema', 'public', '--scale', String(o.scale), '--jobs', String(o.jobs)], glog, l => /^(조각 |진행 |끝 |실패 )/.test(l))
      if (r.code !== 0) throw new Error(`생성기 실패(종료 ${r.code}) — 다시 실행하면 실패 조각만 다시 : ${r.last}`)
      if (!suspect.length) break
      // 끊겼던 표만 정확 건수 대조 — 중복(커밋됐는데 state 에 없던 조각)이면 그 표를 비우고 다시
      const bad = []
      await pool(suspect, o.jobs, async p => {
        const n = +(await psql(o, db, `SELECT count(*) FROM public.${p.tbl};`))
        if (n !== p.n) bad.push({ p, n })
      })
      log(`  끊겼던 표 ${suspect.length}개 건수 대조 — 불일치 ${bad.length}`)
      if (!bad.length) break
      if (round) throw new Error('건수 불일치 반복 : ' + bad.map(b => `${b.p.tbl} ${b.n}/${b.p.n}`).join(', '))
      const done = new Set(readJson(st, []))
      for (const { p, n } of bad) {
        log(`  ${p.tbl} 실제 ${n.toLocaleString()} ≠ 목표 ${p.n.toLocaleString()} → TRUNCATE 후 다시`)
        await psql(o, db, `TRUNCATE public.${p.tbl};`)
        chunkIds(p).forEach(id => done.delete(id))
      }
      fs.writeFileSync(st, JSON.stringify([...done]))
      suspect = bad.map(b => b.p)
    }
    return { rows: target, note: `목표 ${target.toLocaleString()}행 적재` }
  },

  async constraints(o) {
    const { db } = envInfo()
    await pool(CON, CON_CONC, async f => {
      const t0 = Date.now()
      log(`  제약 ${f} 시작`)
      await psql(o, db, `SET search_path = public;\n` + fs.readFileSync(path.join(P.ddl, f + '_constraints.sql'), 'utf8'))
      log(`  제약 ${f} 완료 (${dur(Date.now() - t0)})`)
    })
    const [pk, ix, bad] = (await psql(o, db, IDX_SQL)).split('|').map(Number)
    if (pk !== EXPECT.pk || ix !== EXPECT.ix || bad) throw new Error(`PK ${pk}/${EXPECT.pk} · 보조 ${ix}/${EXPECT.ix} · 무효 ${bad}`)
    return { note: `PK ${pk} · 보조 인덱스 ${ix} · 합계 ${pk + ix} · 무효 0` }
  },

  async analyze(o) {
    const { db } = envInfo()
    await psql(o, db, 'ANALYZE;')
    await psql(o, db, `ALTER SYSTEM RESET autovacuum;\nSELECT pg_reload_conf();`)
    const rows = +(await psql(o, db, ROWS_SQL))
    return { rows, note: `추정 행 ${rows.toLocaleString()}(reltuples) · autovacuum 원복` }
  },

  async verify(o, S, prev) {
    const fresh = prev?.st !== '실패' // 실패한 검증을 다시 하면 남은 건만, 그 밖엔 처음부터
    const r = await runNode(o, [P.verify, '--db', 'prod', '--schema', 'public', '--conc', String(o.verifyConc), ...(fresh ? ['--fresh'] : [])], null) // 상세는 verify 자체 로그
    if (r.code !== 0) throw new Error('검증 미완료 — 다시 실행하면 남은 건만 : ' + r.last)
    return { note: r.last }
  },

  async summary(o, S) {
    const { db } = envInfo()
    const [sum, idx, def, { target }] = await Promise.all([...[SUM_SQL, IDX_SQL, DEF_SQL].map(q => psql(o, db, q)), planTarget(o, path.join(P.dbDir, `datagen_${o.name}.log`))])
    const [tbl, part, rows, defs, size] = sum.split('|')
    const [pk, ix, bad] = idx.split('|').map(Number)
    const defRows = +def
    const diff = Math.abs(+rows - target) / target
    S.result = { tables: +tbl, partitions: +part, estRows: +rows, targetRows: target, pk, ix, invalidIdx: bad, defaultParts: +defs, defaultRows: defRows, dbSize: size }
    const ok = +tbl === EXPECT.tables && +part === EXPECT.parts && diff <= EXPECT.rowTol && pk === EXPECT.pk && ix === EXPECT.ix && !bad && defRows === 0
    log(`  테이블 ${tbl}(기대 ${EXPECT.tables}) · 파티션 하위 ${(+part).toLocaleString()}(기대 ${EXPECT.parts.toLocaleString()}) · 추정 행 ${(+rows).toLocaleString()}(배율 ${o.scale} 목표 ${target.toLocaleString()} · 차이 ${(diff * 100).toFixed(4)}% · 허용 ${EXPECT.rowTol * 100}%)`)
    log(`  PK ${pk} · 보조 인덱스 ${ix} · 합계 ${pk + ix}(기대 ${EXPECT.pk + EXPECT.ix}) · 무효 인덱스 ${bad} · DEFAULT 파티션 ${defs}개 ${defRows}행(기대 0) · DB ${size}`)
    log('  편향 지표 = 검증 출력 S4·S1·S9 값(PASS/FAIL 표시 없음) — 배율 0.001 실측 S4 0.596 · S1 0.459 · S9 167, 배율 1 기준값과 S2·S5·S6 판정은 reviews/09 4절')
    if (!ok) throw new Error('요약 기준 불일치 — 위 값 확인')
    return { rows: +rows, note: `테이블 ${tbl} · 인덱스 ${pk + ix} · DEFAULT 0행 · ${size}` }
  },
}
// 현재 배율의 목표 행(결정적) — 생성기 plan 을 다시 돌려 datagen/out/plan.json 을 읽음(--from 재개 때 다른 배율 미리보기가 남아 있어도 맞게)
async function planTarget(o, glog) {
  const g = await runNode(o, [P.gen, 'plan', '--scale', String(o.scale)], glog, () => false)
  if (g.code !== 0) throw new Error('계획 실패 : ' + g.last)
  const plans = JSON.parse(fs.readFileSync(P.plan, 'utf8'))
  return { plans, target: plans.reduce((s, p) => s + p.n, 0) }
}
const IDX_SQL = `SELECT count(*) FILTER (WHERE x.indisprimary), count(*) FILTER (WHERE NOT x.indisprimary), count(*) FILTER (WHERE NOT x.indisvalid) FROM pg_index x JOIN pg_class t ON t.oid = x.indrelid WHERE t.relnamespace = 'public'::regnamespace AND t.relname LIKE 'ptl\\_%' AND NOT t.relispartition;`
const ROWS_SQL = `SELECT coalesce(round(sum(reltuples)), 0)::bigint FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND reltuples > 0 AND relname LIKE 'ptl\\_%';`
const SUM_SQL = `SELECT (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND NOT relispartition AND relname LIKE 'ptl\\_%'), (SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p') AND relispartition AND relname LIKE 'ptl\\_%'), (${ROWS_SQL.slice(0, -1)}), (SELECT count(*) FROM pg_partitioned_table pt JOIN pg_class p ON p.oid = pt.partrelid WHERE p.relnamespace = 'public'::regnamespace AND pt.partdefid <> 0), pg_size_pretty(pg_database_size(current_database()));`
// DEFAULT 파티션 정확 건수 합(비어 있어 빠름) — reviews/10 2절 DO 블록을 한 문장으로
const DEF_SQL = `SELECT coalesce(sum((xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', d.relname), false, true, '')))[1]::text::bigint), 0) FROM pg_partitioned_table pt JOIN pg_class d ON d.oid = pt.partdefid WHERE d.relnamespace = 'public'::regnamespace;`

// ---------- 계획 ----------
function estMs(id, s) {
  const lin = { data: M.loadS, constraints: M.conS, analyze: M.analyzeS, verify: M.verifyS }[id]
  return lin ? Math.max(30000, lin * 1000 * s) : 60000
}
async function plan(o) {
  // 초기화하거나 컨테이너·볼륨이 둘 다 없으면 빈 DB 로 시작 — 남은 진행 기록은 무시(run 과 같은 판정)
  const blank = o.reset || (!containerInfo(o) && !docker('volume', 'inspect', o.volume).ok)
  const S = blank ? { steps: {} } : readJson(stFile(o), { steps: {} })
  const env = envInfo()
  console.log(`pitel 재구축 계획(실행하지 않음 — 읽기만)`)
  console.log(`  컨테이너 ${o.name} · 포트 ${o.port} · 볼륨 ${o.volume} · ${o.image} · shm ${o.shm} · postgres 설정 ${Object.keys(o.pg).length}개${JSON.stringify(o.pg) === JSON.stringify(PG) ? '(지난 주말과 같음)' : '(변경 있음)'}`)
  console.log(`  .env.local ${env.exists ? `있음(DB ${env.db}·${env.dev})` : '없음 — 실행 때 무작위 비밀번호로 새로 만듦'}`)
  if (o.reset) {
    const t = resetTargets(o)
    console.log(`  초기화(--reset${o.yes ? ' --yes' : ''}) 대상 : 컨테이너 ${o.name}(${t.ct ? '있음' : '없음'}) · 볼륨 ${o.volume}(${t.vol ? '있음' : '없음'}) · 진행 기록 ${t.files.length}개${t.files.map(f => ' ' + path.relative(HERE, f)).join('')}`)
  }
  const items = await precheck(o, S)
  console.log(`  배율 ${o.scale} · 목표 약 ${estRows(o.scale).toLocaleString()}행 · 생성기 동시 ${o.jobs} · 검증 동시 ${o.verifyConc}`)
  console.log('사전점검')
  for (const x of items) console.log(`  [${x.ok ? '통과' : x.fatal ? '실패' : '참고'}] ${x.nm} — ${x.note}`)
  const st = blank ? 0 : startIdx(S, o.from)
  console.log('단계(예상 소요 — 배율 1 실측 × 배율, 검증은 [확인중 : 배율 1 동시 1 검증 실측])')
  let tot = 0
  STEPS.forEach(([id, nm], i) => {
    const skip = i > 0 && i < st
    const ms = estMs(id, o.scale)
    if (!skip) tot += ms
    console.log(`  ${i + 1}. ${id.padEnd(11)} ${nm} — ${skip ? (S.steps?.[id]?.st === '완료' ? '완료(건너뜀)' : '건너뜀(--from)') : ms === 60000 ? '1분 이내' : '≈ ' + dur(ms)}`)
  })
  console.log(`예상 합계 ≈ ${dur(tot)} · 필요 디스크 약 ${needGB(o.scale).toFixed(0)}GB`)
  const fatal = items.filter(x => x.fatal && !x.ok)
  if (o.reset && !o.yes) console.log('초기화를 실제로 하려면 --reset 에 --yes 도 붙여야 함(없으면 대상만 출력하고 멈춤)')
  console.log(fatal.length ? `실행하면 사전점검에서 멈춤 : ${fatal.map(x => x.nm).join(', ')}` : '실행 가능 : node rebuild.mjs' + process.argv.slice(2).filter(a => a !== 'plan').map(a => ' ' + a).join(''))
  console.log(LOADER_NOTE)
}

// ---------- 실행 ----------
async function run(o) {
  fs.mkdirSync(P.stateDir, { recursive: true })
  LOG = path.join(P.dbDir, `rebuild_${o.name}.log`)
  log(`재구축 시작 PID ${process.pid} · ${process.argv.slice(2).join(' ') || '(기본)'}`)
  if (o.reset) doReset(o)
  let S = readJson(stFile(o), { steps: {} })
  // 컨테이너·볼륨이 둘 다 없으면 빈 DB 로 시작 — 남은 진행 기록(배율·dataTries·완료 단계)은 무효라 사전점검 전에 비움
  if (!containerInfo(o) && !docker('volume', 'inspect', o.volume).ok) {
    if (Object.keys(S.steps).length || S.dataTries) log('컨테이너·볼륨 없음 — 이전 진행 기록 무시하고 처음부터')
    S = { steps: {} }
  }
  const items = await precheck(o, S)
  for (const x of items) log(`사전점검 ${x.ok ? '통과' : x.fatal ? '실패' : '참고'} ${x.nm} — ${x.note}`)
  if (items.some(x => x.fatal && !x.ok)) throw new Error('사전점검 실패 — 위 [실패] 항목 해결 후 다시(계획만 보기 : node rebuild.mjs plan)')
  if (S.scale != null && S.scale !== o.scale && S.dataTries) throw new Error(`이전 기록은 배율 ${S.scale} — 같은 배율로 이어서, 또는 --reset --yes 로 처음부터`)
  S.scale = o.scale
  keepAwake()
  // 컨테이너 단계를 먼저 끝낸 뒤 재개 단계를 계산 — 새 볼륨이면 기록이 초기화되므로 그 뒤 기록 기준(완료 기록이 있어도 컨테이너·볼륨은 늘 확인)
  if (!(await runStep(o, S, STEPS[0]))) return
  if (o.freshVol && o.from && STEP_IDS.indexOf(o.from) > 1) log(`새 볼륨이라 --from ${o.from} 무시 — db 단계부터`)
  const st = resumeAt(S, o)
  if (st >= STEPS.length) return log('이미 전부 완료 — 다시 하려면 --from <단계> 또는 --reset --yes')
  for (const step of STEPS.slice(Math.max(1, st))) if (!(await runStep(o, S, step))) return
  log('재구축 끝 — 단계별 소요')
  for (const [id] of STEPS) if (S.steps[id]) log(`  ${id.padEnd(11)} ${fmt(S.steps[id].s)} → ${fmt(S.steps[id].e)} · ${dur(S.steps[id].ms)}`)
  log(LOADER_NOTE)
}

// 재개 단계 — 새 볼륨이면 기록·--from 과 무관하게 db(1)부터
const resumeAt = (S, o) => (o.freshVol ? 1 : startIdx(S, o.from))

// 단계 1개 실행·기록 — 실패면 false(종료코드 1·재개 안내)
async function runStep(o, S, [id, nm]) {
  const prev = S.steps[id]
  const x = (S.steps[id] = { nm, st: '진행', s: Date.now() })
  save(o, S)
  log(`단계 시작 ${id} — ${nm}`)
  try {
    Object.assign(x, await STEP[id](o, S, prev), { st: '완료' })
  } catch (e) {
    Object.assign(x, { st: '실패', e: Date.now(), ms: Date.now() - x.s, note: e.message.slice(0, 600) })
    save(o, S)
    log(`단계 실패 ${id} : ${e.message.slice(0, 600)}`)
    log(`다시 : 원인 해결 후 node rebuild.mjs ${process.argv.slice(2).filter(a => !['--reset', '--yes'].includes(a)).join(' ')}(끊긴 ${id} 부터 이어서) — 또는 --from ${id}`)
    process.exitCode = 1
    return false
  }
  Object.assign(x, { e: Date.now(), ms: Date.now() - x.s })
  save(o, S)
  log(`단계 완료 ${id} (${dur(x.ms)})${x.rows != null ? ` · 행 ${x.rows.toLocaleString()}` : ''}${x.note ? ' · ' + String(x.note).split('\n')[0].slice(0, 200) : ''}`)
  return true
}

function selftest() {
  const assert = (c, m) => {
    if (!c) throw new Error('selftest 실패 : ' + m)
  }
  const d = parseArgs([])
  assert(d.cmd === 'run' && d.name === 'pitel-pg' && d.port === 55432 && d.volume === 'pitel-pgdata' && d.scale === 1 && d.verifyConc === 1 && !d.reset, '기본값 = 지난 주말 구성')
  assert(Object.keys(d.pg).length === 15 && d.pg.wal_level === 'logical' && d.pg.shared_buffers === '2GB', 'postgres 설정 15개')
  const t = parseArgs(['plan', '--name', 'pitel-pg-rbtest', '--port', '55439', '--scale', '0.001', '--verify-conc', '2', '--pg', 'max_locks_per_transaction=256,shared_buffers=1GB', '--from', 'data', '--reset', '--yes'])
  assert(t.cmd === 'plan' && t.port === 55439 && t.scale === 0.001 && t.verifyConc === 2 && t.pg.max_locks_per_transaction === '256' && t.pg.shared_buffers === '1GB' && t.from === 'data' && t.reset && t.yes, '옵션 해석')
  for (const bad of [['--from', 'x'], ['--scale', '0'], ['--name', 'a;b'], ['--port'], ['--pg', 'x'], ['--bogus']]) {
    let threw = false
    try {
      parseArgs(bad)
    } catch {
      threw = true
    }
    assert(threw, '잘못된 인자 거부 ' + bad.join(' '))
  }
  assert(Math.round(needGB(1)) === 331 && needGB(0.001) < 6, '필요 디스크')
  assert(chunkIds({ tbl: 'a', n: 10 }).join() === 'a:all' && chunkIds({ tbl: 'b', n: 2e6 }).length === 17, '조각 id(datagen chunks 와 같은 규칙)')
  assert(startIdx({ steps: { container: { st: '완료' }, db: { st: '완료' } } }) === 2 && startIdx({ steps: {} }) === 1 && startIdx({ steps: {} }, 'verify') === 6 && startIdx({ steps: Object.fromEntries(STEP_IDS.map(id => [id, { st: '완료' }])) }) === STEPS.length, '시작 단계')
  const allDone = { steps: Object.fromEntries(STEP_IDS.map(id => [id, { st: '완료' }])) }
  assert(resumeAt(allDone, { freshVol: true, from: 'constraints' }) === 1 && resumeAt(allDone, {}) === STEPS.length && resumeAt(allDone, { from: 'verify' }) === 6, '새 볼륨 = db 부터(D-001)')
  assert(pre({ name: 'pitel-pg' }) === '' && pre({ name: 'x' }) === 'x_', 'state 접두(datagen ST_PRE)')
  console.log('selftest 통과')
}

let o
try {
  o = parseArgs(process.argv.slice(2))
} catch (e) {
  console.error(e.message + '\n\n' + HELP)
  process.exit(2)
}
if (o.cmd === 'help') console.log(HELP)
else if (o.cmd === 'selftest') selftest()
else
  (o.cmd === 'plan' ? plan(o) : run(o)).catch(e => {
    LOG ? log('중단 : ' + e.message) : console.error(e.message)
    process.exitCode = 1
  })

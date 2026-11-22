// 적재 진행 5분 갱신기 : 적재 로그 계산(bench/progress.mjs --json, 같은 계산 공유) + Oracle redo 증가·활성 세션 대기 집계를 Supabase mon_load_hist 에 1행 upsert
//   → 공개 현황판 public/restore/dbms_load_live.html 이 /api/mon/load 로 읽음(배포 없이 값만 갱신). 끝 표시(exit 줄·전부 완료) 또는 launch/datagen 프로세스 없음 = 마지막 1회 기록 후 종료
// 실행 : node bench/progress-push.mjs --log oracle/out/full_load_append_nolog_20261122.log --run ora_append_nolog_20261122 --base bench/runs/12_oracle_newpc_20261121_complete.log --every 300 [--target oracle] [--once] [--dry-run]
//   --dry-run = Supabase 쓰기 없이 올릴 행만 출력, --once = 1회만, --selftest = 파싱 자체 점검. docker 가 PATH 에 있어야 함(Oracle 조회). 실패해도 루프 계속, 오류는 <로그>.push.err
//   Supabase 키 = sitemap/schema.pi/.env.local 의 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY(값은 화면·로그에 남기지 않음). progress.mjs 가 실행마다 <로그>.size.jsonl 에 크기 1줄을 덧붙임(기존 동작)
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..') // pitel
const APP = path.resolve(ROOT, '..') // sitemap/schema.pi
const TIMEOUT = 10_000 // 외부 호출(자식 프로세스·Oracle·Supabase) 1회 상한
const LABEL = { oracle: 'Oracle', mssql: 'MS-SQL', mysql: 'MySQL', pg: 'PostgreSQL' }
const AREAS = ['PRD', 'CUS', 'ORD', 'PAY', 'INV', 'COL', 'PRM']
const arg = k => {
  const i = process.argv.indexOf(k)
  return i > 0 ? process.argv[i + 1] : undefined
}
const sum = o => Object.values(o ?? {}).reduce((s, x) => s + x, 0)

// sqlplus 출력 → redo 누적 바이트 · 대기 이벤트별 활성 세션 수(대기 중이 아니면 ON CPU)
export function parseOra(out) {
  let redo = null
  const waits = {}
  for (const l of out.split('\n').map(x => x.trim())) {
    const s = l.match(/^STAT\|(\d+)$/)
    if (s) redo = +s[1]
    const w = l.match(/^WAIT\|(.+)\|(\d+)$/)
    if (w) waits[w[1]] = +w[2]
  }
  return { redo, waits }
}
// 시작 전 기준 파일의 'STAT|redo size|<바이트>' 줄
export const redoBaseOf = text => {
  const m = text.match(/^STAT\|redo size\|(\d+)\s*$/m)
  return m ? +m[1] : null
}
// 다음 측정 순번 : 시작 + k × every 가 지금보다 뒤인 가장 작은 k(지난 주기 건너뜀)
export const nextK = (t0, k, every, now) => Math.max(k + 1, Math.floor((now - t0) / every) + 1)
// 저장 계획 : j = 이번 진행 계산(실패 null), o = 이번 Oracle 값(redo 없으면 null), kept = 종료 재시도 중 보관값 { j, o }
//  진행 중 = 계산이 있으면 저장(빠진 Oracle 값은 다음 주기에), 보관 없음
//  종료 = 빠진 값을 보관값으로 채움(끝난 뒤 진행값은 바뀌지 않음) → 계산·Oracle 둘 다 있으면 저장, 3회째면 계산(보관 포함)만 있어도 저장
export function plan({ end, j, o, kept, lastTry, oraNeed = true }) {
  if (!end) return { j, o, save: !!j, kept: { j: null, o: null } }
  const jj = j ?? kept.j, oo = o ?? kept.o
  return { j: jj, o: oo, save: !!jj && (!!oo || !oraNeed || lastTry), kept: { j: jj, o: oo } }
}
// 적재 프로세스 생존 : 명령줄에 이 로그 경로가 든 launch.mjs 와 그 자식 트리(ParentProcessId) — 다른 실행의 datagen 은 보지 않음
// procs = [{ ProcessId, ParentProcessId, CommandLine }], rel = pitel 기준 로그 경로(/ 구분)
export function treeOf(procs, rel) {
  // 명령줄을 인자 단위로 나눠 launch.mjs 인자와 로그 인자를 각각 완전 일치(경로 정규화)로 비교 — 접두사가 같은 다른 로그는 대상 아님
  const args = c => (c.match(/"[^"]*"|\S+/g) ?? []).map(t => t.replace(/^"|"$/g, '').replace(/\\/g, '/'))
  const hit = (t, name) => t === name || t.endsWith('/' + name)
  const launch = procs.filter(p => { const t = args(p.CommandLine ?? ''); return t.some(x => hit(x, 'launch.mjs')) && t.some(x => hit(x, rel)) }).map(p => p.ProcessId)
  const tree = new Set(launch)
  for (let grew = true; grew; ) {
    grew = false
    for (const p of procs) if (!tree.has(p.ProcessId) && tree.has(p.ParentProcessId)) (tree.add(p.ProcessId), (grew = true))
  }
  return { alive: launch.length > 0, launch, child: [...tree].filter(x => !launch.includes(x)) }
}
// 적재 로그 끝 표식 : launch.mjs 의 'exit <코드> <시각>' 또는 datagen 의 '끝 · …' 줄(진행 계산과 독립 판정)
export const logEndOf = text => /^(exit \d+ \S+|끝 · .*)$/m.test(text)
// 적재 로그 첫 줄 '설정 <ISO> <내용>' → 내용
export const cfgOf = text => text.match(/^설정 \S+ (.+)$/m)?.[1] ?? null

// progress.mjs --json 결과 + Oracle 결과 → mon_load_hist 1행
export function buildRow({ run, dbms, at, j, o, redoBase, alive, logEnd = false, cfg, basLbl }) {
  const area = Object.fromEntries(AREAS.map(a => [a, { tgt: j.tgt[a] ?? 0, rows: j.rows[a] ?? 0, sz: j.sz[a] ?? 0, ...(j.base ? { bas: j.base[a] ?? 0 } : {}) }]))
  const byLog = j.ended || logEnd
  return {
    exec_id: run,
    msrmt_dtm: at,
    dbms_nm: dbms,
    elps_val: j.ms, // 밀리초
    goal_row_cnt: sum(j.tgt),
    cmptn_row_cnt: sum(j.rows),
    tot_unit_cnt: j.units.total,
    cmptn_unit_cnt: j.units.done,
    fail_cnt: j.fail,
    load_sz: sum(j.sz) + j.lob,
    redo_sz: o?.redo != null && redoBase != null ? o.redo - redoBase : null,
    crtr_cmptn_row_cnt: j.base ? sum(j.base) : null,
    end_yn: byLog || !alive ? 'Y' : 'N',
    dtl_val: { area, lob_sz: j.lob, waits: o ? o.waits : null, sess_cnt: o ? sum(o.waits) : null, bas_lbl: basLbl, first_dtm: j.first, end_rsn: byLog ? 'LOG_END' : alive ? null : 'NO_PROCESS' },
    stng_txt: cfg,
  }
}

if (process.argv.includes('--selftest')) {
  const o = parseOra('STAT|100719460\nWAIT|enq: TM - contention|7\nWAIT|ON CPU|7\nWAIT|direct path write|1\n')
  assert.deepEqual(o, { redo: 100719460, waits: { 'enq: TM - contention': 7, 'ON CPU': 7, 'direct path write': 1 } })
  assert.equal(redoBaseOf('x|1|2\nSTAT|db block changes|356157\nSTAT|redo size|62418080\n'), 62418080)
  assert.equal(redoBaseOf('없음'), null)
  assert.equal(cfgOf('설정 2026-11-22T09:01:01Z Oracle 21c EE · 배율 1\n조각'), 'Oracle 21c EE · 배율 1')
  assert.equal(logEndOf('진행 2086/2086 · 2994초\n끝 · 성공 2086 · 실패 0 · 2994초\n'), true)
  assert.equal(logEndOf('시작 a:2010 x\nexit 0 2026-11-21T11:12:29Z\n'), true)
  assert.equal(logEndOf('설정 x\n시작 a:2010 x\n완료 a:2010 y\n'), false)
  const j = { first: '2026-11-22T09:01:02.536Z', sec: 600, ms: 600123, ended: false, units: { done: 10, total: 2086 }, fail: 0, tgt: { COL: 100, PRD: 50 }, rows: { COL: 40 }, base: { COL: 60 }, sz: { COL: 1000 }, lob: 24 }
  const r = buildRow({ run: 't', dbms: 'Oracle', at: '2026-11-22T09:11:00Z', j, o, redoBase: 62418080, alive: true, cfg: null, basLbl: '실행 12' })
  assert.equal(r.exec_id, 't')
  assert.equal(r.msrmt_dtm, '2026-11-22T09:11:00Z')
  assert.equal(r.elps_val, 600123)
  assert.equal(r.goal_row_cnt, 150)
  assert.equal(r.cmptn_row_cnt, 40)
  assert.equal(r.cmptn_unit_cnt, 10)
  assert.equal(r.load_sz, 1024)
  assert.equal(r.redo_sz, 100719460 - 62418080)
  assert.equal(r.crtr_cmptn_row_cnt, 60)
  assert.equal(r.end_yn, 'N')
  assert.equal(r.dtl_val.sess_cnt, 15)
  const r2 = buildRow({ run: 't', dbms: 'Oracle', at: 'x', j: { ...j, base: null }, o: null, redoBase: 1, alive: false, cfg: null, basLbl: null })
  assert.equal(r2.redo_sz, null)
  assert.equal(r2.crtr_cmptn_row_cnt, null)
  assert.equal(r2.end_yn, 'Y')
  assert.equal(r2.dtl_val.end_rsn, 'NO_PROCESS')
  const r3 = buildRow({ run: 't', dbms: 'Oracle', at: 'x', j, o, redoBase: 1, alive: true, logEnd: true, cfg: 'c', basLbl: null })
  assert.equal(r3.end_yn, 'Y')
  assert.equal(r3.dtl_val.end_rsn, 'LOG_END')
  assert.equal(r3.stng_txt, 'c')
  assert.equal(nextK(0, 0, 300, 10), 1) // 처리 10 → 300 까지 대기
  assert.equal(nextK(0, 1, 300, 320), 2) // 처리가 길어도 시각 고정(600)
  assert.equal(nextK(0, 1, 300, 950), 4) // 600·900 지남 → 1200
  assert.equal(nextK(0, 2, 300, 600), 3) // 정각 = 지난 것으로 보고 다음
  const none = { j: null, o: null }
  assert.equal(plan({ end: false, j, o: null, kept: none, lastTry: false }).save, true) // 진행 중 Oracle 실패 = 그 주기 저장
  assert.equal(plan({ end: false, j: null, o, kept: none, lastTry: false }).save, false) // 진행 중 계산 실패 = 저장 없음
  assert.equal(plan({ end: true, j, o, kept: none, lastTry: false }).save, true) // 종료 · 둘 다 성공 = 저장
  // 혼합 실패 : 1·2회 = 계산 성공 + Oracle 실패, 3회 = 계산 실패 → 2회 계산값으로 마지막 저장
  const j2 = { ...j, ms: 700000 }
  const p1 = plan({ end: true, j, o: null, kept: none, lastTry: false })
  assert.equal(p1.save, false)
  const p2 = plan({ end: true, j: j2, o: null, kept: p1.kept, lastTry: false })
  assert.equal(p2.save, false)
  const p3 = plan({ end: true, j: null, o: null, kept: p2.kept, lastTry: true })
  assert.equal(p3.save, true)
  assert.equal(p3.j, j2)
  assert.equal(p3.o, null)
  // 1회 = Oracle 성공 + 계산 실패, 2회 = 계산 성공 + Oracle 실패 → 보관 Oracle 값과 합쳐 저장
  const q1 = plan({ end: true, j: null, o, kept: none, lastTry: false })
  assert.equal(q1.save, false)
  const q2 = plan({ end: true, j, o: null, kept: q1.kept, lastTry: false })
  assert.equal(q2.save, true)
  assert.equal(q2.o, o)
  assert.equal(plan({ end: true, j: null, o: null, kept: none, lastTry: true }).save, false) // 3회째 보관 행도 없음 = 저장 불가
  // 생존 : 이 로그의 launch 와 그 자식만, 다른 실행의 datagen 은 무시
  const ps = [
    { ProcessId: 10, ParentProcessId: 1, CommandLine: 'node bench\\launch.mjs oracle/out/a.log run --target oracle' },
    { ProcessId: 11, ParentProcessId: 10, CommandLine: 'node C:\\x\\datagen\\datagen.mjs run --target oracle' },
    { ProcessId: 20, ParentProcessId: 1, CommandLine: 'node C:\\x\\datagen\\datagen.mjs run --target oracle' },
  ]
  assert.deepEqual(treeOf(ps, 'oracle/out/a.log'), { alive: true, launch: [10], child: [11] })
  assert.equal(treeOf(ps, 'oracle/out/b.log').alive, false)
  assert.equal(treeOf(ps.slice(1), 'oracle/out/a.log').alive, false) // launch 없이 고아 datagen 만 = 끝
  assert.equal(treeOf([{ ProcessId: 20, ParentProcessId: 1, CommandLine: 'node bench\\launch.mjs oracle/out/a.log2 run' }], 'oracle/out/a.log').alive, false) // 접두사 같은 다른 로그
  assert.equal(treeOf([{ ProcessId: 21, ParentProcessId: 1, CommandLine: '"C:\\node.exe" bench\\launch.mjs "C:/w/pitel/oracle/out/a.log" run' }], 'oracle/out/a.log').alive, true) // 따옴표·절대경로 인자
  console.log('selftest 통과')
  process.exit(0)
}

const LOG_ARG = arg('--log'), RUN = arg('--run'), BASE_ARG = arg('--base')
const TARGET = arg('--target') || 'oracle'
if (!LOG_ARG || !RUN) throw new Error('사용 : node bench/progress-push.mjs --log <적재 로그> --run <실행 ID> [--base <기준 로그>] [--every 300] [--once] [--dry-run]')
if (!/^[A-Za-z0-9_]{1,100}$/.test(RUN)) throw new Error('실행 ID 는 영문·숫자·_ 100자 이내')
if (!LABEL[TARGET]) throw new Error(`미지원 대상 : ${TARGET}`)
const LOG = path.resolve(ROOT, LOG_ARG)
const BASE = BASE_ARG ? path.resolve(ROOT, BASE_ARG) : null
const EVERY = Math.max(60, +(arg('--every') || 300)) * 1000
const DRY = process.argv.includes('--dry-run')
const ONCE = process.argv.includes('--once')
const ERR = LOG.replace(/\.log$/, '') + '.push.err'
const baseNo = BASE && path.basename(BASE).match(/^(\d+)_/)?.[1]
const BAS_LBL = BASE ? (baseNo ? `실행 ${baseNo}` : path.basename(BASE)) : null // runs/12_… → '실행 12'
const REDO_BASE_FILE = LOG.replace(/\.log$/, '') + '_events_before.txt'

const logErr = (what, e) => fs.appendFileSync(ERR, `${new Date().toISOString()} ${what} : ${String(e?.message ?? e).split('\n').slice(0, 5).join(' / ')}\n`)

// 자식 트리 종료 : Windows 는 p.kill() 이 손자(docker exec)를 남기므로 taskkill /T /F
const killTree = p => (process.platform === 'win32' && p.pid ? spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => p.kill()) : p.kill())

// 자식 프로세스 실행(stdout 반환), 시간 초과면 자식 트리 종료
function run(cmd, args, ms = TIMEOUT) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { cwd: ROOT, windowsHide: true })
    let out = '', er = ''
    const t = setTimeout(() => {
      killTree(p)
      rej(new Error(`${path.basename(cmd)} ${ms / 1000}초 초과`))
    }, ms)
    p.stdout.setEncoding('utf8')
    p.stderr.setEncoding('utf8')
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (er += d))
    p.on('error', e => {
      clearTimeout(t)
      rej(e)
    })
    p.on('close', c => {
      clearTimeout(t)
      // 오류 줄(… Error: …) 우선 — 스택 끝 3줄만으로는 원인이 안 보임(2026-11-22 push.err)
      c === 0 ? res(out) : rej(new Error(er.match(/^\w*Error\b.*$/m)?.[0] || er.trim().split('\n').slice(-3).join(' / ') || `종료 코드 ${c}`))
    })
  })
}

// 적재 프로세스 생존(treeOf). 확인 불가(비 Windows·PowerShell 실패)면 살아 있다고 봄
let lastTree = null // 콘솔 표시용
async function alive() {
  if (process.platform !== 'win32') return true
  try {
    const out = await run('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId, ParentProcessId, CommandLine | ConvertTo-Json -Compress"])
    const procs = [JSON.parse(out.trim() || '[]')].flat()
    lastTree = treeOf(procs, path.relative(ROOT, LOG).replace(/\\/g, '/'))
    return lastTree.alive
  } catch (e) {
    logErr('프로세스 확인', e)
    return true
  }
}

// Oracle : redo 누적(v$sysstat, PDB) + PITEL 활성 세션 대기 이벤트 집계 — 한 번의 sqlplus 호출
async function oracle() {
  const { ora } = await import('../oracle/ora.mjs')
  const q = `SELECT 'STAT|' || value FROM v$sysstat WHERE name = 'redo size';
SELECT 'WAIT|' || DECODE(state, 'WAITING', event, 'ON CPU') || '|' || COUNT(*) FROM v$session WHERE username = 'PITEL' AND status = 'ACTIVE' GROUP BY DECODE(state, 'WAITING', event, 'ON CPU');`
  return parseOra(await ora(q, { sysdba: true, timeoutMs: TIMEOUT })) // 초과 시 ora 가 docker exec 자식을 종료
}

// .env.local 에서 키 2개(환경변수 우선)
function sbEnv() {
  const f = path.join(APP, '.env.local')
  const txt = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
  const get = k => process.env[k] || txt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  const url = get('NEXT_PUBLIC_SUPABASE_URL'), key = get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 없음(sitemap/schema.pi/.env.local)')
  return { url: url.replace(/\/$/, ''), key }
}

async function upsert(row) {
  const { url, key } = sbEnv()
  const r = await fetch(`${url}/rest/v1/mon_load_hist?on_conflict=exec_id,msrmt_dtm`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(TIMEOUT),
  })
  if (!r.ok) throw new Error(`upsert HTTP ${r.status} ${(await r.text()).slice(0, 300)}`)
}

// 1주기 : 로그 계산 · Oracle · 프로세스 확인은 서로 독립 → 동시에. 반환 = { end : 적재 끝(끝 표시 또는 프로세스 없음), saved : 이번 스냅숏 계산 + 저장 성공 }
let kept = { j: null, o: null } // 종료 재시도 동안 마지막으로 얻은 진행 계산 · Oracle 값
// lastTry = 최종 스냅숏 3회째(그 뒤 재시도 없음)
async function tick(lastTry = false) {
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  // 종료 판정(로그 끝 표식 · 프로세스 생존)을 진행 계산보다 먼저 — 계산이 실패해도 끝났는지는 안다
  const logTxt = fs.readFileSync(LOG, 'utf8')
  const logEnd = logEndOf(logTxt)
  // Oracle 크기 조회 2회(progress.mjs 안 직렬) 각 10초 상한 → 자식 전체 상한 = 2 × 10초 + 5초(적재 중 dba_segments 1회 실측 9.5초, 2026-11-22)
  const pArgs = [path.join(HERE, 'progress.mjs'), '--target', TARGET, '--log', LOG, ...(BASE ? ['--base', BASE] : []), '--json', '--ora-timeout', String(TIMEOUT), ...(DRY ? ['--no-size-log'] : [])] // dry-run 은 크기 이력도 남기지 않음
  const [pj, po, pa] = await Promise.allSettled([run(process.execPath, pArgs, TIMEOUT * 2 + 5000), TARGET === 'oracle' ? oracle() : Promise.resolve(null), alive()])
  const isAlive = pa.status === 'fulfilled' ? pa.value : true
  if (po.status === 'rejected') logErr('Oracle 조회', po.reason)
  if (pj.status === 'rejected') logErr('진행 계산(progress.mjs)', pj.reason)
  const j0 = pj.status === 'fulfilled' ? JSON.parse(pj.value.trim().split('\n').pop()) : null
  const o0 = po.status === 'fulfilled' && po.value.redo != null ? po.value : null
  const end = logEnd || !isAlive || !!j0?.ended
  const p = plan({ end, j: j0, o: o0, kept, lastTry, oraNeed: TARGET === 'oracle' })
  kept = p.kept
  const tree = lastTree ? ` · 생존 ${isAlive} (launch ${lastTree.launch.join(',') || '-'} · 자식 ${lastTree.child.join(',') || '-'})` : ` · 생존 ${isAlive}`
  if (!p.save) {
    console.log(`${at} ${!p.j ? '진행 계산' : 'Oracle redo·대기 조회'} 실패 — ${path.basename(ERR)} 참조${tree}${end ? (lastTry ? ' · 3회째도 보관 행 없음 → 종료' : ' · 적재 끝 → 최종 스냅숏 재시도') : ''}`)
    if (end && lastTry) logErr('최종 스냅숏', '3회째도 진행 계산 결과 없음(보관 행 없음) — 저장 없이 종료')
    return { end, saved: false }
  }
  if (end && (p.j !== j0 || (TARGET === 'oracle' && !p.o))) logErr('최종 스냅숏', `이번 ${p.j !== j0 ? '진행 계산' : 'Oracle 조회'} 실패 — 보관값${p.o ? '' : '(redo·대기 없음)'}으로 저장`)
  const redoBase = fs.existsSync(REDO_BASE_FILE) ? redoBaseOf(fs.readFileSync(REDO_BASE_FILE, 'utf8')) : null
  const row = buildRow({ run: RUN, dbms: LABEL[TARGET], at, j: p.j, o: p.o, redoBase, alive: isAlive, logEnd, cfg: cfgOf(logTxt), basLbl: BAS_LBL })
  const pct = row.goal_row_cnt ? ((row.cmptn_row_cnt / row.goal_row_cnt) * 100).toFixed(1) : '-'
  console.log(`${at} 경과 ${Math.round(row.elps_val / 1000)}초 · 완료 ${row.cmptn_row_cnt.toLocaleString('ko-KR')}행(${pct}%) · 단위 ${row.cmptn_unit_cnt}/${row.tot_unit_cnt} · 실패 ${row.fail_cnt} · 종료 ${row.end_yn}${tree}`)
  let ok = DRY
  if (DRY) console.log(JSON.stringify(row, null, 2))
  else
    try {
      await upsert(row)
      ok = true
    } catch (e) {
      logErr('Supabase upsert', e)
      console.log(`${at} upsert 실패 — 다음 주기 재시도`)
    }
  return { end: row.end_yn === 'Y', saved: ok }
}

// 측정 시각 고정 = 시작 + k × every(처리 시간이 주기에 더해지지 않음), 이미 지난 시각은 건너뜀(겹침 없음)
// 끝난 뒤 최종 스냅숏(계산 + 저장)이 실패하면 다음 주기에 다시 — 최대 3회
const T0 = Date.now()
let k = 0, endTry = 0
for (;;) {
  let r = { end: false, saved: false }
  try {
    r = await tick(endTry >= 2)
  } catch (e) {
    logErr('주기', e) // 로그 파싱 등 예상 밖 오류도 루프는 계속
    let logEnd = false
    try {
      logEnd = logEndOf(fs.readFileSync(LOG, 'utf8'))
    } catch {}
    r = { end: logEnd || !(await alive()), saved: false }
  }
  if (ONCE || (r.end && (r.saved || ++endTry >= 3))) break
  k = nextK(T0, k, EVERY, Date.now())
  await new Promise(res => setTimeout(res, T0 + k * EVERY - Date.now()))
}

// PC 도구 현황 업로더 : 이 PC 에 설치된 Claude Code 도구(Skill·Agent·Plugin·Hook·MCP) 목록 + work-history 사용 집계(루트 scripts/work-history-stats.mjs usageStats)를
//   Supabase mon_tool_snap(sql/022)에 1행 insert → 관리자 화면 /admin/tools 가 /api/admin/tools 로 읽음(배포 없이 값만 갱신)
// 실행 : node scripts/tool-snap-push.mjs [--every 300] [--once] [--dry-run] [--selftest] [--tier dev|staging|prod] [--schema <스키마>] [--pc <PC명>] [--env-file <파일>]
//   --dry-run = 쓰기 없이 페이로드 요약만 출력, --once = 1회만, --selftest = 추출·비밀값 차단 자체 점검. 키 = .env.local(환경변수 우선, 값은 화면·로그에 남기지 않음)
//   업로드 값 = 이름·종류·출처·버전·개수·날짜·스크립트 파일명만 — MCP env·args·헤더·URL, 훅 명령 전문, 대화 내용, 경로(사용자명) 는 수집 단계에서 버린다
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// 직접 실행일 때만 selftest·업로드 루프 — 다른 스크립트·시험이 import 하면 함수만 쓰고 DB 쓰기는 일어나지 않는다
const IS_MAIN = !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
const APP = path.resolve(HERE, '..') // sitemap/sitemap.pi
const REPO = path.resolve(APP, '..', '..') // loginpi
const HOME = os.homedir()
const CFG = {
  everyDflt: 300, // 기본 주기(초)
  everyMin: 60,
  usageDays: 30, // 사용 집계 기간(오늘 포함)
  timeoutMs: 10_000, // Supabase 호출 1회 상한(로컬 배치라 R-P4 요청 경로 예외)
  nameMax: 120,
  pcMax: 100, // = DB pc_nm VARCHAR(100)
  insertTries: 3, // 같은 PC·같은 밀리초 PK 충돌 시 +1ms 재시도 횟수
  hashTimeoutMs: 2000, // 직전 상세 해시 조회 1회 상한
  skillDepth: 3, // skills/<묶음>/<uuid>/<이름>/SKILL.md 까지
  table: 'mon_tool_snap',
}
const TYPES = ['skill', 'agent', 'plugin', 'hook', 'mcp']
// 페이로드에 있으면 안 되는 비밀값 패턴(selftest·업로드 직전 둘 다 검사)
export const SECRET_RE = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /sb_secret_/i,
  /token\s*[=:]/i, // access_token= 등('_' 뒤라 \b 쓰지 않음)
  /key\s*=/i, // api_key= 등
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/,
  /Bearer\s+\S/i,
]

const arg = (k) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? process.argv[i + 1] : undefined
}
const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}
const entries = (d) => {
  try {
    return fs.readdirSync(d, { withFileTypes: true })
  } catch {
    return []
  }
}
const clip = (s) => String(s ?? '').slice(0, CFG.nameMax)
const day = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null)
const localDay = (ms) => new Date(ms).toLocaleDateString('sv-SE') // YYYY-MM-DD(로컬) — work-history r.date 와 같은 기준
// 달력 날짜 문자열 ± n일 — UTC 자정 기준 계산이라 일광절약시간 전환과 무관(c4 D-007)
export const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}


// MCP 서버 설정 → 이름·연결 종류만(command·args·env·url·headers 버림)
export function mcpEntries(servers, src, plugin = null) {
  return Object.entries(servers ?? {}).map(([name, v]) => {
    const kind = typeof v?.type === 'string' && /^[a-z-]{2,20}$/.test(v.type) ? v.type : v?.url ? 'http' : 'stdio'
    return { type: 'mcp', name: clip(name), kind, src, plugin }
  })
}

// settings.hooks(또는 plugin hooks.json) → 이벤트 × 훅 1건. 훅 명령(command·url·prompt 문자열)은 한 글자도 읽지 않는다(c4 D-001 5회차 — 파싱 제거)
//  식별자 = 출처(user·project·local·plugin:<name@marketplace>) : 이벤트 : matcher(도구명 패턴, 화이트리스트 밖이면 'custom', 없으면 '*') # 순번(같은 출처·이벤트 안 1부터)
//  예 project:PreToolUse:Write|Edit#2. 그 밖 허용 = 종류(type 화이트리스트)·timeout(숫자)만
const MATCHER_RE = /^[A-Za-z0-9_|*.:-]{1,80}$/
const EVENT_RE = /^[A-Za-z]{1,40}$/
const HOOK_TYPES = new Set(['command', 'prompt', 'http', 'agent', 'mcp'])
export function hookEntries(cfg, src, plugin = null) {
  const out = []
  const origin = src === 'plugin' && plugin ? `plugin:${plugin}` : src
  for (const [ev, groups] of Object.entries(cfg?.hooks ?? {})) {
    const event = EVENT_RE.test(ev) ? ev : 'custom'
    let n = 0
    for (const g of Array.isArray(groups) ? groups : []) {
      const matcher = typeof g?.matcher === 'string' && g.matcher !== '' ? (MATCHER_RE.test(g.matcher) ? g.matcher : 'custom') : '*'
      for (const h of Array.isArray(g?.hooks) ? g.hooks : []) {
        n++
        out.push({
          type: 'hook',
          name: `${origin}:${event}:${matcher}#${n}`,
          event,
          matcher,
          kind: HOOK_TYPES.has(h?.type) ? h.type : 'other',
          timeout: Number.isFinite(h?.timeout) ? h.timeout : null,
          src,
          plugin,
        })
      }
    }
  }
  return out
}

// PC명 — 호스트명에 OS 사용자명이 들어 있으면 해시로 대체(개인정보 업로드 금지)
export function pcName(host, user) {
  const h = String(host || 'pc')
  return user && h.toLowerCase().includes(String(user).toLowerCase())
    ? `pc-${createHash('sha256').update(h).digest('hex').slice(0, 8)}`
    : h.slice(0, CFG.pcMax)
}

// installed_plugins.json 레코드 중 이 저장소에 유효한 것 — local·project(projectPath = 이 저장소) 우선, 없으면 user. 없으면 null(다른 저장소 전용 설치)
export function pickRecord(recs, repo = REPO) {
  const list = Array.isArray(recs) ? recs : []
  const here = (r) => typeof r?.projectPath === 'string' && path.resolve(r.projectPath).toLowerCase() === path.resolve(repo).toLowerCase()
  return list.find((r) => r?.scope === 'local' && here(r)) ?? list.find((r) => r?.scope === 'project' && here(r)) ?? list.find((r) => r && (!r.scope || r.scope === 'user')) ?? null
}

// tier → 스키마는 한 곳에서만 결정 — 루트 scripts/db-migrate.mjs 와 같은 규칙(prod = public, dev = sitemap_dev, stg = sitemap_stg).
//  env 의 APP_TIER·SUPABASE_SCHEMA 가 있는데 결정값과 다르면 conflicts(쓰기 거부, 모의 실행은 경고) — 개발 업로드가 스테이징으로 가는 사고 차단(c4 D-010)
const TIER_ALIAS = { dev: 'dev', stg: 'staging', staging: 'staging', prod: 'prod' }
export function tierPlan(argTier, envTier, envSchema) {
  const tier = TIER_ALIAS[argTier ?? envTier ?? 'prod']
  if (!tier) return { error: `--tier 는 dev|stg|staging|prod (받은 값 : ${argTier ?? envTier})` }
  const schema = tier === 'prod' ? 'public' : `sitemap_${tier === 'staging' ? 'stg' : 'dev'}`
  const conflicts = []
  if (envTier && TIER_ALIAS[envTier] !== tier) conflicts.push(`APP_TIER=${envTier}`)
  if (envSchema && envSchema !== schema) conflicts.push(`SUPABASE_SCHEMA=${envSchema}`)
  return { tier, schema, conflicts }
}

// 상세 jsonb 내용 주소 방식(c4 D-009 4회차) — 모든 행의 상세에 meta.hash(내용 sha256, meta.hash 넣기 전 기준)를 항상 넣는다
//  같은 PC 최신 행(상세 유무 무관)의 hash(last)와 같으면 상세는 생략하고 { meta: { hash } } 만, 다르면 전체 + meta.hash
//  → 어떤 행이든 hash 로 '같은 내용의 상세가 있는 행'을 찾을 수 있어 조회~삽입 경합에도 측정과 상세가 어긋나지 않는다. last null(조회 실패·첫 행) = 전체 저장
const hashOf = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
export function dedupeDetail(row, last) {
  const h = { instl: hashOf(row.instl_dtl_val), use: hashOf(row.use_dtl_val) }
  const put = (v, hash, same) => (same ? { meta: { hash } } : { ...v, meta: { ...v.meta, hash } })
  return {
    row: {
      ...row,
      instl_dtl_val: put(row.instl_dtl_val, h.instl, !!last.instl && h.instl === last.instl),
      use_dtl_val: put(row.use_dtl_val, h.use, !!last.use && h.use === last.use),
    },
    next: h,
  }
}

// 비밀값·경로 검사 — 걸린 패턴 목록(빈 배열 = 통과)
export function scanPayload(json, home = HOME, user = os.userInfo().username) {
  const hits = SECRET_RE.filter((re) => re.test(json)).map(String)
  const low = json.toLowerCase().replace(/\\\\/g, '/')
  if (home && low.includes(home.toLowerCase().replace(/\\/g, '/'))) hits.push('homedir')
  if (user && low.includes(`users/${user.toLowerCase()}`)) hits.push('user-path')
  return hits
}

// SKILL.md 가 있는 폴더 이름(깊이 제한, 점 폴더 제외, 찾으면 그 아래는 보지 않음)
function skillNames(root, depth = CFG.skillDepth) {
  const out = []
  for (const e of entries(root)) {
    if (e.name.startsWith('.') || !(e.isDirectory() || e.isSymbolicLink())) continue
    const d = path.join(root, e.name)
    if (fs.existsSync(path.join(d, 'SKILL.md'))) out.push(e.name)
    else if (depth > 1) out.push(...skillNames(d, depth - 1))
  }
  return out
}

// 에이전트 정의 *.md 중 frontmatter name 이 있는 것만(README 등 제외)
function agentNames(root, recursive) {
  const out = []
  for (const e of entries(root)) {
    const f = path.join(root, e.name)
    if (e.isDirectory() && recursive) out.push(...agentNames(f, true))
    else if (e.isFile() && e.name.endsWith('.md')) {
      const head = fs.readFileSync(f, 'utf8').slice(0, 2000)
      const m = head.startsWith('---') && head.match(/^name:\s*["']?([^"'\r\n]+)/m)
      if (m) out.push(m[1].trim())
    }
  }
  return out
}

// 설치 현황 수집 — 플러그인은 installed_plugins.json 의 설치 경로만(cache 전체 스캔 금지)
export function collectInstalled() {
  const items = []
  const add = (it) => items.push(it)
  const claude = path.join(HOME, '.claude')
  const userSet = readJson(path.join(claude, 'settings.json')) ?? {}
  const projSet = readJson(path.join(REPO, '.claude', 'settings.json')) ?? {}
  const localSet = readJson(path.join(REPO, '.claude', 'settings.local.json')) ?? {}
  const enabled = { ...userSet.enabledPlugins, ...projSet.enabledPlugins, ...localSet.enabledPlugins }

  // 스킬 — 사용자·프로젝트(.claude/skills 와 .agents/skills 같은 이름은 1건)
  const seen = new Set()
  // 중복 제거 키 = 출처 + 플러그인 전체 키(name@marketplace) + 이름 — 마켓플레이스가 다른 동명 플러그인의 동명 스킬은 따로 센다(c4 D-006)
  const skill = (name, src, plugin = null, on = true) => {
    const k = `${src}:${plugin ?? ''}:${name}`
    if (!seen.has(k)) (seen.add(k), add({ type: 'skill', name: clip(name), src, plugin, on }))
  }
  for (const n of skillNames(path.join(claude, 'skills'))) skill(n, 'user')
  for (const r of ['.claude/skills', '.agents/skills']) for (const n of skillNames(path.join(REPO, r))) skill(n, 'project')
  // 에이전트
  for (const n of agentNames(path.join(claude, 'agents'), true)) add({ type: 'agent', name: clip(n), src: 'user', plugin: null, on: true })
  for (const n of agentNames(path.join(REPO, '.claude', 'agents'), true)) add({ type: 'agent', name: clip(n), src: 'project', plugin: null, on: true })
  // 훅 — 사용자·프로젝트·로컬 settings
  for (const h of hookEntries(userSet, 'user')) add({ ...h, on: true })
  for (const h of hookEntries(projSet, 'project')) add({ ...h, on: true })
  for (const h of hookEntries(localSet, 'local')) add({ ...h, on: true })
  // MCP — ~/.claude.json(사용자·이 저장소 프로젝트 항목)·.mcp.json
  const cj = readJson(path.join(HOME, '.claude.json')) ?? {}
  const repoKey = Object.keys(cj.projects ?? {}).find((k) => path.resolve(k).toLowerCase() === REPO.toLowerCase())
  for (const m of mcpEntries(cj.mcpServers, 'user')) add({ ...m, on: true })
  for (const m of mcpEntries(repoKey ? cj.projects[repoKey].mcpServers : null, 'project')) add({ ...m, on: true })
  for (const m of mcpEntries(readJson(path.join(REPO, '.mcp.json'))?.mcpServers, 'project')) add({ ...m, on: true })
  // 플러그인 + 플러그인이 싣는 스킬·에이전트·훅·MCP
  const ip = readJson(path.join(claude, 'plugins', 'installed_plugins.json'))
  for (const [key, recs] of Object.entries(ip?.plugins ?? {})) {
    const valid = pickRecord(recs)
    const r = valid ?? (Array.isArray(recs) ? recs[0] : null)
    if (!r) continue
    const short = key.split('@')[0]
    // 다른 저장소 전용 설치(유효 레코드 없음)는 목록에만 두고 꺼짐·구성요소 미수집
    const on = !!valid && enabled[key] === true
    add({ type: 'plugin', name: clip(key), src: clip(r.scope ?? 'user'), plugin: null, on, ver: clip(r.version ?? '').slice(0, 40) || null, inst: day(r.installedAt), upd: day(r.lastUpdated) })
    const dir = valid && typeof r.installPath === 'string' && fs.existsSync(r.installPath) ? r.installPath : null
    if (!dir) continue
    // 소속 = 플러그인 전체 키(name@marketplace) — 이름은 사용 기록과 같은 '짧은이름:항목' 형식
    for (const n of skillNames(path.join(dir, 'skills'))) skill(`${short}:${n}`, 'plugin', key, on)
    for (const n of agentNames(path.join(dir, 'agents'), false)) add({ type: 'agent', name: clip(`${short}:${n}`), src: 'plugin', plugin: key, on })
    for (const h of hookEntries(readJson(path.join(dir, 'hooks', 'hooks.json')), 'plugin', key)) add({ ...h, on })
    const pm = readJson(path.join(dir, '.mcp.json'))
    for (const m of mcpEntries(pm?.mcpServers ?? pm, 'plugin', key)) add({ ...m, on })
  }
  return items
}

// 사용 집계 — 최근 CFG.usageDays 일 work-history(턴·호출·오류·평균 ms) + 일별 종류별 호출 + 훅 이벤트별 실행
export async function collectUsage(now = Date.now()) {
  const { loadRows, usageStats } = await import(pathToFileURL(path.join(REPO, 'scripts', 'work-history-stats.mjs')).href)
  const to = localDay(now)
  const from = addDays(to, -(CFG.usageDays - 1))
  const rows = loadRows({ from, to })
  const u = usageStats(rows)
  const items = u.items
    .filter((i) => i.type !== 'hook')
    .map((i) => ({ type: i.type, name: clip(i.name), turns: i.turns, calls: i.calls, errors: i.errors, avg_ms: i.avg_ms }))
  const hooks = u.items
    .filter((i) => i.type === 'hook')
    .map((i) => ({ event: clip(i.name.split(':')[0]), turns: i.turns, runs: i.calls }))
    .sort((a, b) => b.runs - a.runs)
  const byDay = new Map()
  for (const r of rows) (byDay.get(r.date) ?? byDay.set(r.date, []).get(r.date)).push(r)
  const daily = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rs = byDay.get(d) ?? []
    const o = { date: d, turns: rs.length, skill: 0, agent: 0, plugin: 0, hook: 0, mcp: 0 }
    if (rs.length) for (const b of usageStats(rs).byType) if (b.type in o) o[b.type] = b.calls
    daily.push(o)
  }
  return { from, to, turns: rows.length, items, hooks, daily }
}

export function buildRow({ installed, usage, pc, every, at }) {
  const cnt = (t, f = () => true) => installed.filter((i) => i.type === t && f(i)).length
  const used = (t) => usage.items.filter((i) => i.type === t).length
  return {
    pc_nm: pc,
    msrmt_dtm: at,
    instl_skill_cnt: cnt('skill'),
    instl_agent_cnt: cnt('agent'),
    instl_plugin_cnt: cnt('plugin'),
    actv_plugin_cnt: cnt('plugin', (i) => i.on),
    instl_hook_cnt: cnt('hook'),
    instl_mcp_cnt: cnt('mcp'),
    use_skill_cnt: used('skill'),
    use_agent_cnt: used('agent'),
    use_plugin_cnt: used('plugin'),
    use_hook_cnt: usage.hooks.length,
    use_mcp_cnt: used('mcp'),
    use_call_cnt: usage.items.reduce((s, i) => s + i.calls, 0),
    // meta.active = 종류별 활성 건수(꺼진 플러그인 소속 제외) — 화면 KPI 가 큰 items 를 받지 않고 쓰게 미리 계산
    instl_dtl_val: { meta: { every_sec: every, usage_days: CFG.usageDays, active: Object.fromEntries(TYPES.map((t) => [t, cnt(t, (i) => i.on !== false)])) }, items: installed },
    use_dtl_val: usage,
  }
}

// ── selftest ─────────────────────────────────────────────────────────────────
if (IS_MAIN && process.argv.includes('--selftest')) {
  // import 만으로는 업로드 루프가 돌지 않음(직접 실행 가드) — 별도 프로세스에서 import 후 바로 끝나고 출력이 없어야 한다
  {
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(import.meta.url)})`], { encoding: 'utf8', timeout: 20_000 })
    assert.equal(r.status, 0, 'import 프로세스가 끝나지 않음(업로드 루프 실행 의심)')
    assert.equal(`${r.stdout}${r.stderr}`.trim(), '', 'import 만으로 출력 발생')
  }
  // 달력 순회(c4 D-007) — 월·연 경계, 일광절약시간 전환일(미국 2026-03-08) 다음 날
  assert.equal(addDays('2026-03-08', 1), '2026-03-09')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  // insert 충돌 재시도(c4 D-008) — 23505 면 +1ms, 그 밖 오류·횟수 초과는 그대로 실패
  {
    const sent = []
    const send = async (r) => {
      sent.push(r.msrmt_dtm)
      if (sent.length === 1) throw Object.assign(new Error('dup'), { code: '23505' })
    }
    const out = await insertRow({ msrmt_dtm: '2026-11-28T12:00:00.000Z' }, send)
    assert.deepEqual(sent, ['2026-11-28T12:00:00.000Z', '2026-11-28T12:00:00.001Z'])
    assert.equal(out.msrmt_dtm, '2026-11-28T12:00:00.001Z')
    await assert.rejects(insertRow({ msrmt_dtm: '2026-11-28T12:00:00.000Z' }, async () => { throw Object.assign(new Error('perm'), { code: '42501' }) }), /perm/)
    await assert.rejects(insertRow({ msrmt_dtm: '2026-11-28T12:00:00.000Z' }, async () => { throw Object.assign(new Error('dup2'), { code: '23505' }) }, 2), /dup2/)
  }
  // 플러그인 레코드 선택(c4 D-003)
  const R = path.resolve('/w/repo')
  assert.equal(pickRecord([{ scope: 'project', projectPath: '/w/other' }, { scope: 'user', v: 1 }], R).v, 1)
  assert.equal(pickRecord([{ scope: 'user', v: 1 }, { scope: 'local', projectPath: R, v: 2 }, { scope: 'project', projectPath: R, v: 3 }], R).v, 2)
  assert.equal(pickRecord([{ scope: 'project', projectPath: '/w/other' }], R), null)
  // 상세 내용 주소(c4 D-004·D-009) — 직전 해시 없음(null)·다름 = 전체 + meta.hash, 같음 = { meta: { hash } } 만(모든 행에 hash)
  const base = { instl_dtl_val: { meta: { every_sec: 300 }, items: [1] }, use_dtl_val: { items: [2] } }
  const d1 = dedupeDetail(base, { instl: null, use: null })
  assert.deepEqual(d1.row.instl_dtl_val, { meta: { every_sec: 300, hash: d1.next.instl }, items: [1] })
  assert.deepEqual(d1.row.use_dtl_val, { items: [2], meta: { hash: d1.next.use } })
  assert.match(d1.next.instl, /^[0-9a-f]{64}$/)
  // 최신 행 hash(= 저장된 meta.hash)와 같으면 hash 만, 사용만 바뀌면 사용만 전체
  const d2 = dedupeDetail({ instl_dtl_val: { meta: { every_sec: 300 }, items: [1] }, use_dtl_val: { items: [3] } }, { instl: d1.row.instl_dtl_val.meta.hash, use: d1.row.use_dtl_val.meta.hash })
  assert.deepEqual(d2.row.instl_dtl_val, { meta: { hash: d1.next.instl } })
  assert.deepEqual(d2.row.use_dtl_val.items, [3])
  assert.notEqual(d2.row.use_dtl_val.meta.hash, d1.next.use)
  // tier → 스키마 한 곳 결정 + env 불일치 감지(c4 D-010)
  assert.deepEqual(tierPlan('dev', 'staging', 'sitemap_stg'), { tier: 'dev', schema: 'sitemap_dev', conflicts: ['APP_TIER=staging', 'SUPABASE_SCHEMA=sitemap_stg'] })
  assert.deepEqual(tierPlan('dev', 'dev', 'sitemap_dev'), { tier: 'dev', schema: 'sitemap_dev', conflicts: [] })
  assert.deepEqual(tierPlan(undefined, 'staging', 'sitemap_stg'), { tier: 'staging', schema: 'sitemap_stg', conflicts: [] })
  assert.deepEqual(tierPlan('stg', undefined, undefined), { tier: 'staging', schema: 'sitemap_stg', conflicts: [] })
  assert.deepEqual(tierPlan('prod', 'staging', 'sitemap_stg').conflicts.length, 2)
  assert.ok(tierPlan('qa').error)
  // PC명 길이 = DB 100자(c4 D-005)
  assert.equal(pcName('h'.repeat(150), 'zz').length, 100)
  const mcp = mcpEntries({ a: { type: 'http', url: 'https://x.io/?token=abc', headers: { Authorization: 'Bearer sk-abcdefghijklmnop1234' } }, b: { command: 'C:/Users/bob/npx', args: ['--api-key=sk-abcdefghijklmnop1234'], env: { TOKEN: 'sb_secret_xyz' } } }, 'user')
  assert.deepEqual(mcp, [{ type: 'mcp', name: 'a', kind: 'http', src: 'user', plugin: null }, { type: 'mcp', name: 'b', kind: 'stdio', src: 'user', plugin: null }])
  // 훅 식별자(c4 D-001 5회차) — 명령 문자열을 읽지 않음 : 어떤 command(비밀·경로·따옴표 대입 포함)를 넣어도 페이로드에 command 의 길이 4 이상 부분 문자열이 없다
  {
    const nasty = [
      'FOO="zq9 y.sh" node C:/Users/bob/qzx7secret.mjs --key=sk-abcdefghijklmnop1234',
      `bash -c "curl -H 'Authorization: Bearer zzzzzzzzqq' https://qx.example/api?token=qwer1234"`,
      "A='p q.js' pwsh -File C:\\\\vault\\\\qq8.ps1 sb_secret_xxxx",
      'X="a \\" b.sh" python -m pkgzz eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJzdWIi',
      '"FOO=a b.sh" deno run qxz.ts',
    ]
    const cfg = { hooks: { PreToolUse: [{ matcher: 'Write|Edit', hooks: nasty.map((command, i) => ({ type: 'command', command, timeout: 10 + i })) }], Stop: [{ hooks: [{ type: 'command', command: nasty[0] }] }], 'Bad Event!': [{ matcher: 'x; rm -rf /', hooks: [{ type: 'weird', command: nasty[1] }] }] } }
    const out = hookEntries(cfg, 'project')
    assert.deepEqual(out.map((h) => h.name), ['project:PreToolUse:Write|Edit#1', 'project:PreToolUse:Write|Edit#2', 'project:PreToolUse:Write|Edit#3', 'project:PreToolUse:Write|Edit#4', 'project:PreToolUse:Write|Edit#5', 'project:Stop:*#1', 'project:custom:custom#1'])
    assert.deepEqual(out[0], { type: 'hook', name: 'project:PreToolUse:Write|Edit#1', event: 'PreToolUse', matcher: 'Write|Edit', kind: 'command', timeout: 10, src: 'project', plugin: null })
    assert.equal(out[6].kind, 'other')
    const json = JSON.stringify(out)
    for (const c of nasty) for (let i = 0; i + 4 <= c.length; i++) assert.ok(!json.includes(c.slice(i, i + 4)), `command 부분 문자열 노출 : 위치 ${i}`)
    assert.equal(hookEntries({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } }, 'plugin', 'p@m')[0].name, 'plugin:p@m:Stop:*#1')
  }
  assert.match(pcName('anakin-desk', 'anaki'), /^pc-[0-9a-f]{8}$/)
  assert.equal(pcName('build-01', 'bob'), 'build-01')
  // 검사기 자체가 잡는지(음성 대조)
  for (const bad of ['sk-abcdefghijklmnop1234', 'sb_secret_x', 'token=1', 'api_key=1', 'Bearer abc', 'eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJzdWIi'])
    assert.ok(scanPayload(JSON.stringify({ v: bad }), '/home/zz', 'zz').length, `검사기 누락 : ${bad}`)
  assert.ok(scanPayload(JSON.stringify({ p: 'C:\\Users\\bob\\x' }), 'C:\\Users\\bob', 'bob').length)
  // 실제 수집 페이로드 — 비밀 패턴·홈 경로·사용자 경로 없음, 건수 정수
  const installed = collectInstalled()
  const usage = await collectUsage()
  const row = buildRow({ installed, usage, pc: pcName(os.hostname(), os.userInfo().username), every: CFG.everyDflt, at: new Date().toISOString() })
  const json = JSON.stringify(row)
  assert.deepEqual(scanPayload(json), [], '페이로드에 비밀값·경로 패턴')
  // 실제 설치 훅 — 명령 문자열 전체도, 그 안의 스크립트 파일명(…\.mjs 등)도 페이로드에 없다
  {
    const cmds = []
    const walkHooks = (cfg) => { for (const gs of Object.values(cfg?.hooks ?? {})) for (const g of Array.isArray(gs) ? gs : []) for (const h of Array.isArray(g?.hooks) ? g.hooks : []) if (typeof h?.command === 'string') cmds.push(h.command) }
    for (const f of [path.join(HOME, '.claude', 'settings.json'), path.join(REPO, '.claude', 'settings.json'), path.join(REPO, '.claude', 'settings.local.json')]) walkHooks(readJson(f))
    for (const c of cmds) {
      assert.ok(!json.includes(JSON.stringify(c).slice(1, -1)), '훅 명령 전체가 페이로드에 있음')
      for (const m of c.matchAll(/[\w.-]+\.(?:mjs|cjs|js|ts|sh|ps1|py)\b/g)) assert.ok(!json.includes(m[0]), `훅 스크립트 파일명이 페이로드에 있음 : ${m[0]}`)
    }
    // 훅이 없는 PC 도 정상 설치 — 0건이면 이 실데이터 검사는 건너뛴다(합성 명령 검사는 위에서 항상 수행, c4 D-012)
  }
  for (const [k, v] of Object.entries(row)) if (k.endsWith('_cnt')) assert.ok(Number.isInteger(v) && v >= 0, k)
  assert.ok(installed.every((i) => TYPES.includes(i.type) && i.name), '종류·이름 누락 항목')
  assert.equal(usage.daily.length, CFG.usageDays)
  console.log(`selftest 통과 — 설치 ${installed.length}건 · 사용 ${usage.items.length}건 · 페이로드 ${json.length.toLocaleString()} 바이트 · 비밀 패턴 0`)
  process.exit(0)
}

// ── 업로드 ───────────────────────────────────────────────────────────────────
const DRY = process.argv.includes('--dry-run')
const ONCE = process.argv.includes('--once')
const EVERY = Math.max(CFG.everyMin, Math.floor(Number(arg('--every'))) || CFG.everyDflt)
const PC_ARG = arg('--pc')?.trim()
if (PC_ARG !== undefined && (!PC_ARG || PC_ARG.length > CFG.pcMax)) throw new Error(`--pc 는 1~${CFG.pcMax}자 (DB pc_nm VARCHAR(${CFG.pcMax}))`)
const PC = PC_ARG || pcName(os.hostname(), os.userInfo().username)

// 자격증명 — @pi/db resolveDbConfig 와 같은 tier → env 이름 매핑(값은 출력하지 않음)
function sbEnv() {
  const f = arg('--env-file') ? path.resolve(arg('--env-file')) : path.join(APP, '.env.local')
  const txt = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''
  const get = (k) => process.env[k] || txt.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  const plan = tierPlan(arg('--tier'), get('APP_TIER'), get('SUPABASE_SCHEMA'))
  if (plan.error) throw new Error(plan.error)
  const names = { dev: ['DEV_SUPABASE_URL', 'DEV_SUPABASE_SERVICE_ROLE_KEY'], staging: ['STAGING_SUPABASE_URL', 'STAGING_SUPABASE_SERVICE_ROLE_KEY'], prod: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] }[plan.tier]
  const url = get(names[0])
  const key = get(names[1])
  return { ...plan, names, file: path.basename(f), url: url?.replace(/\/$/, ''), key }
}

async function rest(method, query, body, env) {
  const r = await fetch(`${env.url}/rest/v1/${CFG.table}${query}`, {
    method,
    headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json', 'Content-Profile': env.schema, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CFG.timeoutMs),
  })
  // 오류 본문은 기록하지 않음(c4 D-002) — 상태 코드 + PostgREST 짧은 코드(예 PGRST204·42P01·23505)만
  if (!r.ok) {
    const code = await r.json().then((b) => String(b?.code ?? ''), () => '')
    const short = /^[A-Z0-9]{1,10}$/.test(code) ? code : ''
    throw Object.assign(new Error(`${method} HTTP ${r.status}${short ? ` ${short}` : ''}`), { code: short })
  }
}

// 1행 insert(upsert 아님 — 같은 PK 를 덮어써 앞선 측정을 잃지 않게). PK(pc_nm, msrmt_dtm 밀리초) 충돌 23505 면 +1ms 로 재시도(R-P5, c4 D-008)
//  잠금 파일 방식보다 단순하고(비정상 종료 뒤 남은 잠금 정리 불필요) 다른 PC·여러 프로세스 모두에 같은 규칙이 적용된다
export async function insertRow(row, send, tries = CFG.insertTries) {
  for (let n = 1; ; n++) {
    try {
      await send(row)
      return row
    } catch (e) {
      if (e?.code !== '23505' || n >= tries) throw e
      row = { ...row, msrmt_dtm: new Date(Date.parse(row.msrmt_dtm) + 1).toISOString() }
    }
  }
}

// 같은 PC 최신 행(상세 유무 무관)의 meta.hash 2개를 한 번의 select 로 — 2초 상한. 실패·없음 = null(전체 저장 쪽 안전 폴백, 오류 본문 미기록)
//  업로더가 여러 개 떠 있어도 DB 기준(c4 D-009). 상세 생략 행도 { meta: { hash } } 를 가지므로 최신 행 하나로 비교한다
async function lastHashes(env) {
  try {
    const q = `?select=ih:instl_dtl_val->meta->>hash,uh:use_dtl_val->meta->>hash&pc_nm=eq.${encodeURIComponent(PC)}&del_yn=eq.N&order=msrmt_dtm.desc&limit=1`
    const r = await fetch(`${env.url}/rest/v1/${CFG.table}${q}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Accept-Profile': env.schema },
      signal: AbortSignal.timeout(CFG.hashTimeoutMs),
    })
    if (!r.ok) return { instl: null, use: null }
    const row = (await r.json())?.[0] ?? {}
    const ok = (h) => (typeof h === 'string' && /^[0-9a-f]{64}$/.test(h) ? h : null)
    return { instl: ok(row.ih), use: ok(row.uh) }
  } catch {
    return { instl: null, use: null }
  }
}

async function tick() {
  const at = new Date().toISOString() // 밀리초까지(같은 초에 시작한 별도 수집과 PK 분리)
  const [installed, usage] = [collectInstalled(), await collectUsage()]
  const env = sbEnv()
  // tier·스키마 불일치 = 쓰기 거부(모의 실행은 경고만)
  if (env.conflicts.length) {
    const msg = `--tier ${env.tier}(스키마 ${env.schema}) 와 env 불일치 : ${env.conflicts.join(', ')} (${env.file}) — 같은 tier 의 env 로 실행하거나 APP_TIER·SUPABASE_SCHEMA 를 맞출 것`
    if (!DRY) throw new Error(`쓰기 거부 — ${msg}`)
    console.warn(`[warn] ${msg}`)
  }
  if (!DRY && (!env.url || !env.key)) throw new Error(`${env.names.join(' · ')} 없음(${env.file} 또는 환경변수, tier=${env.tier})`)
  // 모의 실행은 DB 를 조회하지 않음(직전 해시 없음 = 상세 저장으로 표시)
  const last = DRY ? { instl: null, use: null } : await lastHashes(env)
  const { row } = dedupeDetail(buildRow({ installed, usage, pc: PC, every: EVERY, at }), last)
  const json = JSON.stringify(row)
  const hits = scanPayload(json)
  if (hits.length) throw new Error(`비밀값·경로 패턴 감지 — 업로드 중단 : ${hits.join(', ')}`)
  const byType = Object.fromEntries(TYPES.map((t) => [t, installed.filter((i) => i.type === t).length]))
  const bySrc = installed.reduce((o, i) => ((o[i.src] = (o[i.src] ?? 0) + 1), o), {})
  const saved = (v) => ('items' in v ? '저장' : '변화 없음(meta.hash 만)')
  const head = `${row.msrmt_dtm} pc=${PC} tier=${env.tier} schema=${env.schema} 설치 ${JSON.stringify(byType)} 출처 ${JSON.stringify(bySrc)} 활성 플러그인 ${row.actv_plugin_cnt} · 사용(${usage.from}~${usage.to}, 턴 ${usage.turns}) 스킬 ${row.use_skill_cnt}·에이전트 ${row.use_agent_cnt}·플러그인 ${row.use_plugin_cnt}·훅 이벤트 ${row.use_hook_cnt}·MCP ${row.use_mcp_cnt}·호출 ${row.use_call_cnt} · 페이로드 ${json.length.toLocaleString()} 바이트(상세 설치 ${saved(row.instl_dtl_val)}·사용 ${saved(row.use_dtl_val)}) · hash 설치 ${row.instl_dtl_val.meta.hash.slice(0, 8)}·사용 ${row.use_dtl_val.meta.hash.slice(0, 8)} · 비밀 패턴 0`
  if (DRY) {
    const sample = Object.fromEntries(TYPES.map((t) => [t, installed.filter((i) => i.type === t).slice(0, 3).map((i) => i.name)]))
    console.log(`[dry-run] ${head}\n  표본 ${JSON.stringify(sample)}\n  사용 상위 ${JSON.stringify([...usage.items].sort((a, b) => b.calls - a.calls).slice(0, 5).map((i) => `${i.type}:${i.name}=${i.calls}`))}`)
    return
  }
  const out = await insertRow(row, (r) => rest('POST', '', r, env))
  console.log(`[push] ${head.replace(row.msrmt_dtm, out.msrmt_dtm)}`)
}

// 직접 실행일 때만(IS_MAIN) 업로드 루프
for (;IS_MAIN;) {
  try {
    await tick()
  } catch (e) {
    console.error(`[err] ${new Date().toISOString()} ${e.message}`)
    if (ONCE || DRY) process.exitCode = 1
  }
  if (ONCE || DRY) break
  await new Promise((r) => setTimeout(r, EVERY * 1000))
}

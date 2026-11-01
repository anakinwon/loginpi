// DB 운영 안전 순수 규칙(PRD 12 §9) — 9-1 파라미터 진단·9-2 계정·권한 감사·9-3 백업 점검·9-4 복제 지연. 입력 = 이름 붙인 조회 결과 객체, 출력 = 판정(OK/WARN/RISK) + 규칙 코드
//  문구는 화면 messages ops.rules.<rule> 로 번역(여기는 코드만). 시험 : node --test src/lib/ops/params.test.mjs
//  ponytail: 서버 총 메모리는 조회 수단이 없어 shared_buffers ≈ 메모리 25% 관례로 역산(추정치) — 에이전트(AGT) 수집이 생기면 실제 메모리로 교체

export type Level = 'OK' | 'WARN' | 'RISK'
export type Finding = { rule: string; level: Level; name?: string; value?: string; targets?: string[] }
export type Setting = { name: string; setting: string | null; unit: string | null }

const MB = 1024 * 1024
const UNIT_BYTES: Record<string, number> = { B: 1, kB: 1024, '8kB': 8192, '16kB': 16384, '32kB': 32768, MB, '16MB': 16 * MB, GB: 1024 * MB, TB: 1024 * 1024 * MB }
const UNIT_MS: Record<string, number> = { us: 0.001, ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 }
const TARGET_CAP = 30 // 화면에 보일 대상 이름 상한

export function toBytes(s: Setting): number | null {
  const n = Number(s.setting)
  const u = UNIT_BYTES[s.unit ?? '']
  return Number.isFinite(n) && u ? n * u : null
}
export function toMs(s: Setting): number | null {
  const n = Number(s.setting)
  const u = UNIT_MS[s.unit ?? '']
  return Number.isFinite(n) && u ? n * u : null
}
export function fmtBytes(b: number): string {
  const u = ['B', 'kB', 'MB', 'GB', 'TB']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${u[i]}`
}

// 표시값 — 바이트·시간 단위는 사람이 읽는 값으로
function show(s: Setting): string {
  const b = toBytes(s)
  if (b !== null) return fmtBytes(b)
  if (s.unit && UNIT_MS[s.unit] && Number(s.setting) > 0) return `${s.setting}${s.unit}`
  return s.setting ?? ''
}

// 9-1 파라미터 진단 — 없는 설정은 건너뛴다(버전 차이)
export function diagnoseParams(list: Setting[]): Finding[] {
  const m = new Map(list.map((s) => [s.name, s]))
  const out: Finding[] = []
  const add = (name: string, level: Level, rule: string) => {
    const s = m.get(name)
    if (s) out.push({ name, value: show(s), level, rule })
  }
  const get = (name: string) => m.get(name)
  const sb = get('shared_buffers') ? toBytes(get('shared_buffers')!) : null
  const wm = get('work_mem') ? toBytes(get('work_mem')!) : null
  const maxConn = get('max_connections') ? Number(get('max_connections')!.setting) : null

  if (sb !== null) add('shared_buffers', sb <= 128 * MB ? 'WARN' : 'OK', sb <= 128 * MB ? 'sb_default' : 'sb_ok')
  if (wm !== null) {
    // 최악(접속 수 × work_mem)이 추정 메모리(shared_buffers × 4)를 넘으면 OOM 위험
    if (sb !== null && maxConn && wm * maxConn > sb * 4) add('work_mem', 'RISK', 'wm_over')
    else add('work_mem', wm <= 4 * MB ? 'WARN' : 'OK', wm <= 4 * MB ? 'wm_default' : 'wm_ok')
  }
  const mwm = get('maintenance_work_mem') ? toBytes(get('maintenance_work_mem')!) : null
  if (mwm !== null) add('maintenance_work_mem', mwm <= 64 * MB ? 'WARN' : 'OK', mwm <= 64 * MB ? 'mwm_default' : 'mwm_ok')
  if (get('autovacuum')) add('autovacuum', get('autovacuum')!.setting === 'on' ? 'OK' : 'RISK', get('autovacuum')!.setting === 'on' ? 'av_on' : 'av_off')
  if (maxConn !== null) add('max_connections', maxConn > 500 ? 'RISK' : maxConn > 200 ? 'WARN' : 'OK', maxConn > 200 ? 'conn_high' : 'conn_ok')
  const lmd = get('log_min_duration_statement')
  if (lmd) {
    const v = Number(lmd.setting)
    add('log_min_duration_statement', v === -1 || v === 0 ? 'WARN' : 'OK', v === -1 ? 'lmd_off' : v === 0 ? 'lmd_all' : 'lmd_ok')
  }
  for (const [name, rule] of [
    ['statement_timeout', 'st'],
    ['idle_in_transaction_session_timeout', 'iit'],
  ] as const) {
    const s = get(name)
    if (s) add(name, Number(s.setting) === 0 ? 'WARN' : 'OK', Number(s.setting) === 0 ? `${rule}_off` : `${rule}_ok`)
  }
  const ct = get('checkpoint_timeout') ? toMs(get('checkpoint_timeout')!) : null
  if (ct !== null) add('checkpoint_timeout', ct <= 300_000 ? 'WARN' : 'OK', ct <= 300_000 ? 'ckpt_short' : 'ckpt_ok')
  const wl = get('wal_level')
  if (wl) add('wal_level', wl.setting === 'minimal' ? 'RISK' : 'OK', wl.setting === 'minimal' ? 'wal_minimal' : 'wal_ok')
  const rpc = get('random_page_cost')
  if (rpc) add('random_page_cost', Number(rpc.setting) >= 4 ? 'WARN' : 'OK', Number(rpc.setting) >= 4 ? 'rpc_hdd' : 'rpc_ok')
  return out
}

// 9-2 계정·권한 감사
export type Role = { rolname: string; rolsuper: boolean; rolcanlogin: boolean; rolbypassrls: boolean; rolvaliduntil: string | null }
export type Priv = { grantee: string; table_schema: string; table_name: string; privilege_type: string }

const cap = (a: string[]) => (a.length > TARGET_CAP ? [...a.slice(0, TARGET_CAP), `+${a.length - TARGET_CAP}`] : a)

export function auditRoles(roles: Role[], privs: Priv[]): Finding[] {
  const supers = roles.filter((r) => r.rolsuper).map((r) => r.rolname)
  const bypass = roles.filter((r) => !r.rolsuper && r.rolbypassrls).map((r) => r.rolname)
  const noExp = roles.filter((r) => r.rolcanlogin && (!r.rolvaliduntil || r.rolvaliduntil === 'infinity')).map((r) => r.rolname)
  const pubTbl = new Map<string, string[]>()
  for (const p of privs) {
    if (p.grantee !== 'PUBLIC') continue
    const k = `${p.table_schema}.${p.table_name}`
    pubTbl.set(k, [...(pubTbl.get(k) ?? []), p.privilege_type])
  }
  const pub = [...pubTbl].map(([k, v]) => `${k}(${v.join(',')})`)
  const pubWrite = [...pubTbl.values()].some((v) => v.some((x) => x !== 'SELECT'))
  return [
    { rule: supers.length > 1 ? 'super_many' : 'super_ok', level: supers.length > 1 ? 'RISK' : 'OK', value: String(supers.length), targets: cap(supers) },
    { rule: bypass.length ? 'bypass_rls' : 'bypass_ok', level: bypass.length ? 'WARN' : 'OK', value: String(bypass.length), targets: cap(bypass) },
    { rule: noExp.length ? 'no_expiry' : 'expiry_ok', level: noExp.length ? 'WARN' : 'OK', value: String(noExp.length), targets: cap(noExp) },
    { rule: pub.length ? 'public_grant' : 'public_ok', level: pub.length ? (pubWrite ? 'RISK' : 'WARN') : 'OK', value: String(pub.length), targets: cap(pub) },
  ]
}

// 9-3 백업 자동 점검 — archiver 1행 + 설정
export type Archiver = { archived_count: number; last_archived_time: string | null; failed_count: number; last_failed_time: string | null; archive_mode: string | null }
const DAY = 86_400_000

export function backupChecks(arc: Archiver | null, list: Setting[], now = Date.now()): Finding[] {
  const m = new Map(list.map((s) => [s.name, s.setting ?? '']))
  const mode = arc?.archive_mode ?? m.get('archive_mode') ?? ''
  const on = mode === 'on' || mode === 'always'
  const wl = m.get('wal_level')
  const out: Finding[] = [
    { rule: on ? 'arc_on' : 'arc_off', level: on ? 'OK' : 'RISK', value: mode || '-' },
  ]
  if (wl !== undefined) out.push({ rule: wl === 'minimal' ? 'wal_minimal' : 'wal_ok', level: wl === 'minimal' ? 'RISK' : 'OK', value: wl })
  if (on) {
    const cmd = m.get('archive_command') ?? ''
    const lib = m.get('archive_library') ?? ''
    if (m.has('archive_command') && (!cmd || cmd === '(disabled)') && !lib) out.push({ rule: 'arc_cmd_empty', level: 'RISK' })
    const last = arc?.last_archived_time ? Date.parse(arc.last_archived_time) : NaN
    out.push(
      Number.isNaN(last)
        ? { rule: 'arc_never', level: 'WARN' }
        : { rule: now - last > DAY ? 'arc_stale' : 'arc_recent', level: now - last > DAY ? 'WARN' : 'OK', value: arc!.last_archived_time! },
    )
    const failAt = arc?.last_failed_time ? Date.parse(arc.last_failed_time) : NaN
    // 마지막 실패가 마지막 성공보다 뒤 = 지금 실패 중
    if (!Number.isNaN(failAt) && (Number.isNaN(last) || failAt > last)) out.push({ rule: 'arc_failing', level: 'RISK', value: String(arc!.failed_count) })
  }
  return out
}

// 수동 점검 항목(dbm_ops_chk.chk_cd) — 자동으로 알 수 없는 백업·복구 운영 사항
export const MANUAL_CHECKS = ['base_backup', 'offsite_copy', 'restore_rehearsal', 'pitr_target', 'backup_encrypt', 'retention'] as const
export type ManualCheck = (typeof MANUAL_CHECKS)[number]

// 9-4 복제·DR — interval 텍스트('00:00:01.5', '1 day 02:00:00') → 초
export function intervalSec(v: string | null): number | null {
  if (!v) return null
  const m = /^(?:(-?\d+) days? ?)?(-?)(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(v.trim())
  if (!m) return null
  const sec = Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5])
  return Number(m[1] ?? 0) * 86400 + (m[2] ? -sec : sec)
}

export const LAG = { warnSec: 5, riskSec: 60 }
export type Replica = { application_name: string | null; client_addr: string | null; state: string | null; sync_state: string | null; replay_lag: string | null }
export type ReplicaRow = { appNm: string; clientAddr: string | null; state: string | null; syncState: string | null; lagSec: number | null; level: Level }

export function replicationStatus(rows: Replica[], inRecovery: boolean | null): { role: 'primary' | 'standby' | 'unknown'; summary: Finding; replicas: ReplicaRow[] } {
  const replicas = rows.map((r) => {
    const lagSec = intervalSec(r.replay_lag)
    // replay_lag NULL = 최근 변경 없음(유휴) — streaming 이면 정상으로 본다
    const level: Level = r.state !== 'streaming' ? 'RISK' : lagSec === null ? 'OK' : lagSec >= LAG.riskSec ? 'RISK' : lagSec >= LAG.warnSec ? 'WARN' : 'OK'
    return { appNm: r.application_name || '-', clientAddr: r.client_addr, state: r.state, syncState: r.sync_state, lagSec, level }
  })
  const role = inRecovery === true ? 'standby' : inRecovery === false ? 'primary' : 'unknown'
  const worst: Level = replicas.some((r) => r.level === 'RISK') ? 'RISK' : replicas.some((r) => r.level === 'WARN') ? 'WARN' : 'OK'
  const summary: Finding =
    role === 'standby'
      ? { rule: 'repl_is_standby', level: 'OK' }
      : replicas.length === 0
        ? { rule: 'repl_none', level: 'RISK' }
        : { rule: worst === 'OK' ? 'repl_ok' : 'repl_lag', level: worst, value: String(replicas.length) }
  return { role, summary, replicas }
}

export function countLevels(fs: Finding[]) {
  return {
    ok: fs.filter((f) => f.level === 'OK').length,
    warn: fs.filter((f) => f.level === 'WARN').length,
    risk: fs.filter((f) => f.level === 'RISK').length,
  }
}

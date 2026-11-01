'use client'

// 모니터링 보드 신호 격자 — 범주 5개 × 신호 카드(상태 배지·값·기준·한 줄 해결) + 펼치면 해결 단계 3줄·TOP 목록·확인 SQL 복사·이동 링크·'이 지표에 규칙 추가'
//  화면 공용 도우미(값 포맷·사유/해결 문구·딥링크·복사 버튼·카드 열기)도 여기서 내보낸다. 상태는 색 + 아이콘 + 라벨 동시(색만으로 구분 금지)
import { useCallback, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { LEVEL, LEVEL_CARD, LEVEL_ICON } from '@/components/ui'
import type { MetricCd } from '@/lib/monitor/rules'
import {
  SIG_IDS,
  worst,
  type Cat,
  type Lvl,
  type SigId,
  type Signal,
} from '@/lib/monitor/signals'

export const SCHEMA_MON_URL = 'https://schem.vercel.app'
export const CATS: Cat[] = ['avail', 'load', 'eff', 'store', 'protect']
const CAT_OF: Record<SigId, Cat> = {
  AVAIL: 'avail',
  CONN_USE: 'avail',
  URL: 'avail',
  LONG_QRY: 'load',
  IDLE_TX: 'load',
  LOCK_WAIT: 'load',
  CACHE_HIT: 'eff',
  XACT_ERR: 'eff',
  SLOW_SQL: 'eff',
  STORAGE: 'store',
  VACUUM: 'store',
  INDEX: 'store',
  BACKUP: 'protect',
  REPL: 'protect',
}
// link 만 있어도 보이는 신호(접속 없음·미지원이어도 조회)
export const LINK_ONLY = new Set<SigId>(['URL'])

// 이동 대상 — 해결은 원인 진단(성능)·수정(SQL 튜닝)·운영 안전 탭으로 이어진다
type Go =
  | 'activity'
  | 'top'
  | 'health'
  | 'trend'
  | 'params'
  | 'repl'
  | 'backup'
  | 'sqlLab'
  | 'drift'
  | 'connect'
  | 'schema'
const GO_PATH: Record<Go, string> = {
  activity: '/perf?tab=activity',
  top: '/perf?tab=top',
  health: '/perf?tab=health',
  trend: '/perf?tab=trend',
  params: '/ops?tab=params',
  repl: '/ops?tab=repl',
  backup: '/ops?tab=backup',
  sqlLab: '/sql-lab',
  drift: '/drift',
  connect: '/connect',
  schema: '',
}
export const GO: Record<SigId, Go[]> = {
  AVAIL: ['connect', 'schema'],
  CONN_USE: ['activity', 'params'],
  URL: ['schema'],
  LONG_QRY: ['sqlLab', 'activity'],
  IDLE_TX: ['activity', 'params'],
  LOCK_WAIT: ['activity'],
  CACHE_HIT: ['params', 'top'],
  XACT_ERR: ['activity'],
  SLOW_SQL: ['top', 'sqlLab'],
  STORAGE: ['trend'],
  VACUUM: ['health', 'params'],
  INDEX: ['health', 'sqlLab', 'drift'],
  BACKUP: ['backup'],
  REPL: ['repl'],
}
// 사용자 규칙을 걸 수 있는 신호 → 지표(sql/030 CHECK 범위 안)
export const RULE_METRIC: Partial<Record<SigId, MetricCd>> = {
  CONN_USE: 'DB_SESS_CNT',
  LOCK_WAIT: 'DB_LOCK_WAIT_CNT',
  CACHE_HIT: 'DB_CACHE_HIT_PCT',
  STORAGE: 'DB_SIZE_MB',
  URL: 'URL_FAIL_CNT',
}
// 확인용 읽기 전용 SQL(대상 DB 에서 DBA 가 직접 실행) — 조치 SQL 은 두지 않는다
export const SQL_CHECK: Partial<Record<SigId | 'PGSS', string>> = {
  AVAIL: 'SELECT now() - pg_postmaster_start_time() AS uptime, version();',
  CONN_USE:
    "SELECT usename, state, count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' GROUP BY 1, 2 ORDER BY 3 DESC;\nSHOW max_connections;",
  LONG_QRY:
    "SELECT pid, usename, now() - query_start AS run, left(query, 200) AS query FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '30 seconds' ORDER BY run DESC;",
  IDLE_TX:
    "SELECT pid, usename, now() - xact_start AS age, left(query, 200) AS query FROM pg_stat_activity WHERE state LIKE 'idle in transaction%' ORDER BY age DESC;\nSHOW idle_in_transaction_session_timeout;",
  LOCK_WAIT:
    "SELECT pid, pg_blocking_pids(pid) AS blocked_by, wait_event, now() - query_start AS wait, left(query, 200) AS query FROM pg_stat_activity WHERE wait_event_type = 'Lock';",
  CACHE_HIT:
    'SELECT blks_hit, blks_read, round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) AS hit_pct, stats_reset FROM pg_stat_database WHERE datname = current_database();\nSHOW shared_buffers;',
  XACT_ERR:
    'SELECT xact_commit, xact_rollback, deadlocks, stats_reset FROM pg_stat_database WHERE datname = current_database();',
  SLOW_SQL:
    'SELECT calls, round(mean_exec_time) AS mean_ms, round(total_exec_time) AS total_ms, left(query, 200) AS query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;',
  STORAGE:
    'SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size;',
  VACUUM:
    'SELECT schemaname, relname, n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;',
  INDEX:
    'SELECT indexrelid::regclass AS idx, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size FROM pg_stat_user_indexes ORDER BY idx_scan, pg_relation_size(indexrelid) DESC LIMIT 10;\nSELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;',
  BACKUP: 'SELECT * FROM pg_stat_archiver;\nSHOW archive_mode;',
  REPL: 'SELECT application_name, state, sent_lsn, replay_lsn, replay_lag FROM pg_stat_replication;',
  PGSS: "-- postgresql.conf : shared_preload_libraries = 'pg_stat_statements' 후 재시작\nCREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
}

// ── 값 포맷 ──
const nf = (v: number, d = 1) =>
  v.toLocaleString(undefined, { maximumFractionDigits: d })
export const fmtBytes = (v: number | null) =>
  v === null
    ? '—'
    : v >= 1024 ** 3
      ? `${nf(v / 1024 ** 3, 2)} GB`
      : `${nf(v / 1024 ** 2, 1)} MB`
export function fmtVal(s: Pick<Signal, 'value' | 'unit' | 'id'>) {
  const v = s.value
  if (v === null) return '—'
  switch (s.unit) {
    case 'ms':
      return `${nf(v, 0)} ms`
    case 'pct':
      return `${nf(v, 2)}%`
    case 'sec':
      return v < 120 ? `${nf(v, 1)}s` : `${nf(v / 60, 0)}m`
    case 'byte':
      return fmtBytes(v)
    case 'cnt':
      return nf(v, 0)
    default:
      return s.id === 'BACKUP' ? `${nf(v, 0)}h` : nf(v)
  }
}

// fix 문구 파라미터 기본값 — 신호마다 params 가 달라도 ICU 자리표시자가 비지 않게
const PARAM_DEF = {
  sess: '-',
  max: '-',
  n: '-',
  sec: '-',
  pct: '-',
  ms: '-',
  gb: '-',
  days: '-',
  tbl: '-',
  code: '-',
}

export function useSigText() {
  const t = useTranslations('monitor.board')
  const te = useTranslations('monitor.errors')
  const name = useCallback((id: SigId) => t(`sig.${id}`), [t])
  const reason = useCallback(
    (s: Signal) => {
      const r = s.reason
      if (!r) return null
      if (r.startsWith('LINK_')) {
        const code = r.slice(5)
        return te.has(code) ? te(code) : t('reason.LINK', { code })
      }
      return t.has(`reason.${r}`) ? t(`reason.${r}`) : r
    },
    [t, te],
  )
  // AVAIL RISK + code = 접속 자체 실패(느림·재시작 문구와 구분)
  const fix = useCallback(
    (s: Signal) =>
      t(
        s.id === 'AVAIL' && s.lvl === 'RISK' && s.params?.code
          ? 'fix.AVAIL_DOWN'
          : `fix.${s.id}`,
        { ...PARAM_DEF, ...s.params },
      ),
    [t],
  )
  // 카드 한 줄 : 문제 = 해결 / 확인 불가·해당 없음 = 사유 / 정상 = 기준
  const line = useCallback(
    (s: Signal) =>
      s.lvl === 'RISK' || s.lvl === 'WARN'
        ? fix(s)
        : s.lvl === 'OK' && !s.reason
          ? null
          : reason(s),
    [fix, reason],
  )
  return { name, reason, fix, line }
}

export type Sel = { linkId: string; connId: string | null }
export const goHref = (g: Go, sel: Sel) =>
  g === 'schema'
    ? SCHEMA_MON_URL
    : `${GO_PATH[g]}${GO_PATH[g].includes('?') ? '&' : '?'}link=${sel.linkId}${sel.connId ? `&conn=${encodeURIComponent(sel.connId)}` : ''}`

export function GoLink({ g, sel }: { g: Go; sel: Sel }) {
  const t = useTranslations('monitor.board.go')
  const cls = 'text-accent text-sm font-semibold underline underline-offset-2'
  return g === 'schema' ? (
    <a
      href={SCHEMA_MON_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
    >
      {t(g)} ↗
    </a>
  ) : (
    <Link href={goHref(g, sel)} className={cls}>
      {t(g)} →
    </Link>
  )
}

export function LvlBadge({ lvl, text }: { lvl: Lvl; text?: string }) {
  const t = useTranslations('monitor.board.level')
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${LEVEL[lvl]}`}
    >
      <span aria-hidden>{LEVEL_ICON[lvl]}</span>
      {text ?? t(lvl)}
    </span>
  )
}

export function CopyBtn({ text }: { text: string }) {
  const t = useTranslations('monitor.board.todo')
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="bg-surface-raised h-9 rounded-lg px-3 text-xs font-semibold"
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
    >
      {done ? t('copied') : t('copySql')}
    </button>
  )
}

// 카드 열기(띠·할 일에서) — 범주 접힘도 함께 연다
export function openSignal(id: SigId) {
  const d = document.getElementById(`sig-${id}`) as HTMLDetailsElement | null
  if (!d) return
  d.open = true
  const cat = d.parentElement?.closest('details')
  if (cat) cat.open = true
  d.scrollIntoView({ behavior: 'smooth', block: 'start' })
  d.querySelector('summary')?.focus({ preventScroll: true })
}

const mq = '(min-width: 768px)'
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(mq)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(mq).matches,
    () => true,
  )
}

type GridProps = {
  signals: Map<SigId, Signal>
  sel: Sel
  pending: { fast: boolean; slow: boolean }
  onAddRule: (m: MetricCd) => void
}

export function SignalGrid(p: GridProps) {
  const wide = useWide()
  return (
    <div className="space-y-3">
      {CATS.map((c) => (
        <CategorySection key={c} cat={c} wide={wide} {...p} />
      ))}
    </div>
  )
}

function CategorySection({
  cat,
  wide,
  signals,
  sel,
  pending,
  onAddRule,
}: GridProps & { cat: Cat; wide: boolean }) {
  const t = useTranslations('monitor.board')
  const ids = SIG_IDS.filter((id) => CAT_OF[id] === cat)
  const got = ids.map((id) => signals.get(id)).filter((s): s is Signal => !!s)
  const lvl = worst(got.map((s) => s.lvl))
  const bad = lvl === 'RISK' || lvl === 'WARN'
  return (
    <details open={wide || bad} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1">
        <span
          aria-hidden
          className="text-muted-foreground transition-transform group-open:rotate-90"
        >
          ›
        </span>
        <h2 className="font-bold">{t(`cat.${cat}`)}</h2>
        {got.length > 0 && <LvlBadge lvl={lvl === 'NA' ? 'OK' : lvl} />}
      </summary>
      <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ids.map((id) => {
          const s = signals.get(id)
          const tier =
            id === 'URL' ||
            [
              'SLOW_SQL',
              'STORAGE',
              'VACUUM',
              'INDEX',
              'BACKUP',
              'REPL',
            ].includes(id)
              ? 'slow'
              : 'fast'
          if (s)
            return <SignalCard key={id} s={s} sel={sel} onAddRule={onAddRule} />
          return (
            <EmptyCard
              key={id}
              id={id}
              loading={pending[tier] && (!!sel.connId || LINK_ONLY.has(id))}
            />
          )
        })}
      </div>
    </details>
  )
}

function EmptyCard({ id, loading }: { id: SigId; loading: boolean }) {
  const t = useTranslations('monitor')
  const { name } = useSigText()
  return (
    <div className="bg-surface rounded-2xl border border-dashed border-white/15 p-4">
      <p className="font-semibold">{name(id)}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {loading ? t('loading') : t('board.empty.noConn')}
      </p>
    </div>
  )
}

function SignalCard({
  s,
  sel,
  onAddRule,
}: {
  s: Signal
  sel: Sel
  onAddRule: (m: MetricCd) => void
}) {
  const t = useTranslations('monitor.board')
  const { name, line, reason } = useSigText()
  const ln = line(s)
  const metric = RULE_METRIC[s.id]
  const sql = SQL_CHECK[s.id]
  const rule = s.params.rule
  return (
    <details
      id={`sig-${s.id}`}
      className={`bg-surface scroll-mt-20 rounded-2xl p-4 ${LEVEL_CARD[s.lvl]}`}
    >
      <summary className="cursor-pointer list-none space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-semibold break-keep">{name(s.id)}</h3>
          <LvlBadge lvl={s.lvl} />
        </div>
        <p className="text-2xl font-extrabold tabular-nums">{fmtVal(s)}</p>
        {s.thr && (
          <p className="text-muted-foreground text-xs">
            {t(s.thr.down ? 'card.thrDown' : 'card.thr', {
              warn: fmtVal({ ...s, value: s.thr.warn }),
              risk: fmtVal({ ...s, value: s.thr.risk }),
            })}
          </p>
        )}
        {ln && <p className="text-sm break-keep">{ln}</p>}
        {rule && (
          <p className="text-xs font-semibold text-red-400">
            {t('todo.myRule', { rule: String(rule) })}
          </p>
        )}
        <p className="text-accent text-xs">{t('card.more')}</p>
      </summary>
      <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-sm">
        {(s.params.basis === 'stored' || s.params.since) && (
          <p className="text-muted-foreground text-xs">
            {s.params.basis === 'live'
              ? t('card.basisLive')
              : t('card.basisStored')}
            {s.params.since
              ? ` · ${t('card.since', { at: new Date(String(s.params.since)).toLocaleString() })}`
              : ''}
          </p>
        )}
        {s.partial && (
          <p className="text-muted-foreground text-xs">{t('card.partial')}</p>
        )}
        {s.reason && s.lvl !== 'UNKNOWN' && s.lvl !== 'NA' && (
          <p className="text-muted-foreground text-xs">{reason(s)}</p>
        )}
        <ol className="list-decimal space-y-1 pl-5 break-keep">
          {(['1', '2', '3'] as const).map((k) => (
            <li key={k}>{t(`steps.${s.id}.${k}`)}</li>
          ))}
        </ol>
        {s.top.length > 0 && (
          <ul className="space-y-1">
            {s.top.map((x) => (
              <li
                key={x.key}
                className="bg-surface-raised rounded-lg px-2 py-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-xs">
                    {x.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums">
                    {x.lvl && x.lvl !== 'OK' && (
                      <span aria-hidden>{LEVEL_ICON[x.lvl]}</span>
                    )}
                    {nf(x.value)}
                  </span>
                </div>
                {x.sub && (
                  <p className="text-muted-foreground line-clamp-2 font-mono text-xs break-all">
                    {x.sub}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {sql && (
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs break-keep">
              {t('sqlNote')}
            </p>
            <pre className="bg-surface-raised overflow-hidden rounded-lg p-2 font-mono text-xs break-all whitespace-pre-wrap">
              {sql}
            </pre>
            <CopyBtn text={sql} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {GO[s.id].map((g) => (
            <GoLink key={g} g={g} sel={sel} />
          ))}
          {metric && (
            <button
              type="button"
              className="text-sm font-semibold underline underline-offset-2"
              onClick={() => onAddRule(metric)}
            >
              {t('card.addRule')}
            </button>
          )}
        </div>
      </div>
    </details>
  )
}

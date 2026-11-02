'use client'

// 성능 관측 화면(PRD 12 §3) — 로그인 게이트 + 연결·접속 선택 + 탭 5개(수집·느린 쿼리·건강·용량·활동/락). 열린 탭만 조회(지연 조회), 목록은 페이지 단위
//  모든 호출 piFetch(Pi Browser X-Pi-Token). 연결 클라이언트 오류는 code 로 번역(perf.err → link2.errors → apiErrors)
import { Fragment, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { qryKey, type QryCum } from '@/lib/perf/calc'
import { SQL_LAB_SEED } from '@/lib/sql-lab/seed'
import type { QidCause, SrcJudge } from '@/lib/perf/source'
import { diagnose, withCum, type DiagLvl } from '@/lib/perf/diagnose'
import { readApi, type ApiErrorBody } from '@/lib/client-api'
import { LoginGate } from '@/components/login-gate'
import { LinkPicker, type LinkSelection } from '@/components/link/link-picker'
import { useLinkErrText } from '@/components/link/link-api'
import { BTN, BTN_PRIMARY } from '@/components/ui'

const TABS = ['collect', 'top', 'health', 'trend', 'activity'] as const
type Tab = (typeof TABS)[number]
type Sel = { linkId: string; connId: string }

const CARD = 'bg-surface rounded-2xl p-4 sm:p-5'
const TH =
  'text-muted-foreground px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap'
const TD = 'px-2 py-1.5 align-top'

const fmtNum = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 })
function fmtBytes(b: number | null) {
  if (b === null) return '-'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = b
  while (Math.abs(v) >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`
}
const fmtDtm = (s: string | null) => (s ? new Date(s).toLocaleString() : '-')

function useErrText() {
  const t = useTranslations('perf.err')
  const linkErr = useLinkErrText()
  return useCallback(
    (b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : linkErr(b)),
    [t, linkErr],
  )
}

// 탭 공용 조회 — sel·key 가 바뀔 때만, 렌더 비차단
function useGet<T>(url: string | null) {
  const errText = useErrText()
  const [state, setState] = useState<{
    url: string
    data?: T
    err?: string
    code?: string
  } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    void readApi<T>(piFetch(url)).then((r) => {
      if (!alive) return
      setState(
        r.ok
          ? { url, data: r.data }
          : { url, err: errText(r.body), code: r.body.code },
      )
    })
    return () => {
      alive = false
    }
  }, [url, errText])
  return state?.url === url ? state : null // 다른 url 의 이전 결과는 로딩으로
}

function Status({ s }: { s: { err?: string; code?: string } | null }) {
  const t = useTranslations('perf')
  if (!s) return <p className="text-muted-foreground text-sm">{t('loading')}</p>
  if (!s.err) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-danger text-sm" role="alert">
        {s.err}
      </p>
      {s.code === 'PGSS_MISSING' && <PgssGuide />}
    </div>
  )
}

function PgssGuide() {
  const t = useTranslations('perf.pgss')
  return (
    <div className="bg-surface-raised rounded-xl p-3 text-sm">
      <p className="font-semibold">{t('title')}</p>
      <p className="text-muted-foreground mt-1 break-keep">{t('body')}</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-black/30 p-2 text-xs">
        {'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;'}
      </pre>
      <p className="text-muted-foreground mt-1 text-xs break-keep">
        {t('note')}
      </p>
    </div>
  )
}

export function PerfView() {
  return <LoginGate>{() => <PerfInner />}</LoginGate>
}

function PerfInner() {
  const t = useTranslations('perf')
  const [sel, setSel] = useState<Sel | null>(null)
  // 모니터링 딥링크 ?tab= 초기값(목록 밖 값은 기본 탭)
  const tab0 = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(() =>
    (TABS as readonly string[]).includes(tab0 ?? '')
      ? (tab0 as Tab)
      : 'collect',
  )
  const [rev, setRev] = useState(0) // 수집 완료 시 다른 탭 재조회
  const onChange = useCallback((s: LinkSelection) => {
    setSel(s.linkId && s.connId ? { linkId: s.linkId, connId: s.connId } : null)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <LinkPicker onChange={onChange} />
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm ${tab === k ? 'bg-accent font-semibold text-white' : 'bg-surface-raised text-muted-foreground'}`}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {!sel ? (
        <p className={`${CARD} text-muted-foreground text-sm`}>
          {t('pickFirst')}
        </p>
      ) : (
        <section className={CARD} role="tabpanel">
          {tab === 'collect' && (
            <CollectTab sel={sel} onDone={() => setRev((r) => r + 1)} />
          )}
          {tab === 'top' && (
            <TopTab
              sel={sel}
              rev={rev}
              onCollected={() => setRev((r) => r + 1)}
            />
          )}
          {tab === 'health' && <HealthTab sel={sel} rev={rev} />}
          {tab === 'trend' && <TrendTab sel={sel} rev={rev} />}
          {tab === 'activity' && <ActivityTab sel={sel} />}
        </section>
      )}
    </div>
  )
}

const qs = (sel: Sel, extra = '') =>
  `link=${encodeURIComponent(sel.linkId)}&conn=${encodeURIComponent(sel.connId)}${extra}`

// 수집 1회 실행 — 수집 탭 버튼과 느린 쿼리 탭 '최고값 없음' 배너가 같이 쓴다
function useCollect(sel: Sel, onDone: () => void) {
  const t = useTranslations('perf.collect')
  const errText = useErrText()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{
    ok: boolean
    text: string
    code?: string
  } | null>(null)

  async function run() {
    setBusy(true)
    setMsg(null)
    const r = await readApi<{
      clctDtm: string
      pgss: boolean
      qryCnt: number
      tblCnt: number
      idxCnt: number
    }>(
      piFetch('/api/perf/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sel),
      }),
    )
    setBusy(false)
    if (r.ok) {
      setMsg({
        ok: true,
        text: t('done', {
          dtm: fmtDtm(r.data.clctDtm),
          qry: r.data.qryCnt,
          tbl: r.data.tblCnt,
          idx: r.data.idxCnt,
        }),
        code: r.data.pgss ? undefined : 'PGSS_MISSING',
      })
      onDone()
    } else setMsg({ ok: false, text: errText(r.body), code: r.body.code })
  }
  return { busy, msg, run }
}

function CollectBtn({
  sel,
  onDone,
  primary,
}: {
  sel: Sel
  onDone: () => void
  primary?: boolean
}) {
  const t = useTranslations('perf.collect')
  const { busy, msg, run } = useCollect(sel, onDone)
  return (
    <>
      <button
        className={primary ? BTN_PRIMARY : BTN}
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? t('running') : t('run')}
      </button>
      {msg && (
        <p className={`text-sm ${msg.ok ? '' : 'text-danger'}`} role="status">
          {msg.text}
        </p>
      )}
      {msg?.code === 'PGSS_MISSING' && <PgssGuide />}
    </>
  )
}

// 3-1 수집 — 버튼 1회 = 스냅샷 1건
function CollectTab({ sel, onDone }: { sel: Sel; onDone: () => void }) {
  const t = useTranslations('perf.collect')
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      <CollectBtn sel={sel} onDone={onDone} primary />
    </div>
  )
}

type TopRow = {
  qryId: string
  usrNm?: string | null
  qryTxt: string | null
  calls: number
  totalMs: number
  meanMs: number
  maxMs: number | null // 1회 최고(리셋 이후) — sql/033 이전 수집은 null
  rows: number
  blkHit?: number | null // 블록 수 증감(sql/034 이전 수집은 null)
  blkRead?: number | null
  tmpBlk?: number | null
  reset: boolean
  src?: SrcJudge
} & Partial<QryCum> // 누적치(통계 리셋 이후) — 구간 호출 0 이면 원인 진단이 대체
type TopRes = {
  clctDtm: string | null
  prevDtm: string | null
  pgss: boolean
  rows: TopRow[]
  total: number
  page: number
  pageSize: number
  noMaxCnt?: number // 최고값 없는 행(sql/033 이전 수집) — 1회 평균으로 임시 정렬
  qid?: {
    cause: QidCause | null
    verNum: number | null
    linkUsr?: string | null
  } | null
}

// 출처 배지 색 — 확신 높음만 진하게(추정 값을 확정처럼 보이지 않게)
const SRC_CONF_CLS: Record<SrcJudge['conf'], string> = {
  high: 'bg-primary/20 text-foreground',
  mid: 'bg-surface-raised text-foreground',
  low: 'bg-surface-raised text-muted-foreground',
  acct: 'bg-surface-raised text-muted-foreground',
  ver: 'bg-surface-raised text-muted-foreground',
}

// 3-2 느린 쿼리 Top-N — 최근 2회 수집 증감
function TopTab({
  sel,
  rev,
  onCollected,
}: {
  sel: Sel
  rev: number
  onCollected: () => void
}) {
  const t = useTranslations('perf.top')
  const [page, setPage] = useState(1)
  // 기본 정렬 = 1회 최고(마스터 2026-11-02 — 느린 SQL 은 max 만)
  const [sort, setSort] = useState<'max' | 'total' | 'mean' | 'calls'>('max')
  const [open, setOpen] = useState<string | null>(null) // 출처 상세를 펼친 행 키
  const s = useGet<TopRes>(
    `/api/perf/top?${qs(sel, `&page=${page}&sort=${sort}&r=${rev}`)}`,
  )
  const d = s?.data
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-muted-foreground" htmlFor="perf-sort">
          {t('sort')}
        </label>
        <select
          id="perf-sort"
          className="bg-surface-raised h-9 rounded-lg px-2"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort)
            setPage(1)
          }}
        >
          <option value="max">{t('sortMax')}</option>
          <option value="total">{t('sortTotal')}</option>
          <option value="mean">{t('sortMean')}</option>
          <option value="calls">{t('sortCalls')}</option>
        </select>
      </div>
      <Status s={s} />
      {d && !d.clctDtm && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {d?.clctDtm && (
        <>
          <p className="text-muted-foreground text-xs">
            {d.prevDtm
              ? t('range', { from: fmtDtm(d.prevDtm), to: fmtDtm(d.clctDtm) })
              : t('first', { dtm: fmtDtm(d.clctDtm) })}
          </p>
          {!d.pgss && <PgssGuide />}
          {!!d.noMaxCnt && (
            <div
              className="bg-surface-raised flex flex-col items-start gap-2 rounded-xl p-3 text-xs"
              role="note"
            >
              <p className="break-keep">{t('noMax', { n: d.noMaxCnt })}</p>
              <CollectBtn sel={sel} onDone={onCollected} />
            </div>
          )}
          <SrcNotice
            cause={d.qid?.cause ?? null}
            linkUsr={d.qid?.linkUsr ?? null}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={TH}>{t('query')}</th>
                  <th className={TH}>{t('src')}</th>
                  <th className={`${TH} text-right`}>{t('calls')}</th>
                  <th className={`${TH} text-right`}>{t('maxMs')}</th>
                  <th className={`${TH} text-right`}>{t('totalMs')}</th>
                  <th className={`${TH} text-right`}>{t('meanMs')}</th>
                  <th className={`${TH} text-right`}>{t('rows')}</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <Fragment key={qryKey(r)}>
                    <tr className="border-t border-white/5">
                      <td className={`${TD} max-w-md`}>
                        <code className="line-clamp-3 text-xs break-all">
                          {r.qryTxt ?? r.qryId}
                        </code>
                        {r.reset && (
                          <span className="text-muted-foreground text-xs">
                            {t('reset')}
                          </span>
                        )}
                        <button
                          type="button"
                          className="text-accent block min-h-9 text-xs"
                          aria-expanded={open === qryKey(r)}
                          onClick={() =>
                            setOpen((o) => (o === qryKey(r) ? null : qryKey(r)))
                          }
                        >
                          {t('diagToggle')}{' '}
                          <span aria-hidden="true">
                            {open === qryKey(r) ? '▴' : '▾'}
                          </span>
                        </button>
                      </td>
                      <td className={TD}>
                        <SrcBadge
                          r={r}
                          open={open === qryKey(r)}
                          onToggle={() =>
                            setOpen((o) => (o === qryKey(r) ? null : qryKey(r)))
                          }
                        />
                      </td>
                      <td className={`${TD} text-right`}>{fmtNum(r.calls)}</td>
                      <td className={`${TD} text-right`}>
                        {r.maxMs == null ? '—' : fmtNum(r.maxMs)}
                      </td>
                      <td className={`${TD} text-right`}>
                        {fmtNum(r.totalMs)}
                      </td>
                      <td className={`${TD} text-right`}>{fmtNum(r.meanMs)}</td>
                      <td className={`${TD} text-right`}>{fmtNum(r.rows)}</td>
                    </tr>
                    {open === qryKey(r) && (
                      <tr>
                        <td colSpan={7} className="px-2 pb-3">
                          <SrcDetail r={r} sel={sel} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={d.page}
            total={d.total}
            size={d.pageSize}
            onPage={setPage}
          />
        </>
      )}
    </div>
  )
}

// 화면 첫 줄 — 출처를 정확히 가리는 근본 대책 + 계정 확정·앱 추정 한계, 표본이 안 쌓이는 원인(버전·권한·설정) 안내
const QID_MSG = { ver: 'verOff', priv: 'privOff', off: 'qidOff' } as const
function SrcNotice({
  cause,
  linkUsr,
}: {
  cause: QidCause | null
  linkUsr: string | null
}) {
  const t = useTranslations('perf.src')
  const why = cause && cause !== 'ok' ? QID_MSG[cause] : null
  return (
    <div className="flex flex-col gap-2">
      <p className="bg-surface-raised rounded-xl p-3 text-xs break-keep">
        {t('root')}
      </p>
      {why && (
        <p
          className="bg-surface-raised text-muted-foreground rounded-xl p-3 text-xs break-keep"
          role="note"
        >
          {/* 계정명을 모르면(schema.pi 구버전) 바꿔 넣을 자리임을 <연결 계정> 꼴로 보인다 */}
          {t(why, { user: linkUsr || `<${t('linkUsr')}>` })}
        </p>
      )}
    </div>
  )
}

// 출처 배지(분류 + 확신도) — 누르면 아래 행에 상세. 계정은 확정값이라 별도 줄
function SrcBadge({
  r,
  open,
  onToggle,
}: {
  r: TopRow
  open: boolean
  onToggle: () => void
}) {
  const t = useTranslations('perf')
  const src = r.src
  if (!src) return <span className="text-muted-foreground text-xs">-</span>
  const label = `${t(`src.cd.${src.cd}`)} · ${t(`src.conf.${src.conf}`)}`
  return (
    <button
      type="button"
      className="flex min-h-9 flex-col items-start gap-0.5 text-left"
      aria-expanded={open}
      aria-label={`${t('top.srcToggle')} — ${label}`}
      onClick={onToggle}
    >
      <span
        className={`rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${SRC_CONF_CLS[src.conf]}`}
      >
        {label}
        <span aria-hidden="true"> {open ? '▴' : '▾'}</span>
      </span>
      {r.usrNm && (
        <span className="text-muted-foreground text-xs break-all">
          {t('top.acct')} {r.usrNm}
        </span>
      )}
    </button>
  )
}

// 원인 진단 — 통계(최고·평균·호출·행·블록)와 쿼리문 모양으로 원인 → 조치(src/lib/perf/diagnose.ts), 근거 수치 한 줄
const DIAG_CLS: Record<DiagLvl, string> = {
  info: 'text-muted-foreground',
  warn: 'text-amber-400',
  risk: 'text-danger',
}
function DiagBlock({ r: row }: { r: TopRow }) {
  const t = useTranslations('perf.diag')
  const r = withCum(row) // 구간 호출 0 = 누적치로 진단(근거 줄에 '누적' 표기)
  const list = diagnose({
    ...r,
    srcCd: r.src?.cd ?? null,
    srcConf: r.src?.conf ?? null,
  })
  const fmtP = (p: Record<string, number>) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, fmtNum(v)]))
  const na = '—'
  const readPct =
    r.blkHit != null && r.blkRead != null && r.blkHit + r.blkRead > 0
      ? `${fmtNum((r.blkRead / (r.blkHit + r.blkRead)) * 100)}%`
      : na
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-semibold">{t('title')}</p>
      {list.length ? (
        <ul className="flex flex-col gap-1.5">
          {list.map((x) => (
            <li key={x.cd} className="break-keep">
              <span className={`font-medium ${DIAG_CLS[x.lvl]}`}>
                {t(`${x.cd}.cause`, fmtP(x.params))}
              </span>
              <br />
              <span className="text-muted-foreground">
                {t('fix')} {t(`${x.cd}.fix`, fmtP(x.params))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="break-keep">{t('none')}</p>
      )}
      <p className="text-muted-foreground break-keep">
        {r.cum && `${t('cum')} · `}
        {t('basis', {
          max: r.maxMs == null ? na : fmtNum(r.maxMs),
          mean: fmtNum(r.meanMs),
          calls: fmtNum(r.calls),
          rpc: r.calls > 0 ? fmtNum(r.rows / r.calls) : na,
          read: readPct,
          tmp: r.tmpBlk == null ? na : fmtNum(r.tmpBlk),
        })}
      </p>
    </div>
  )
}

// 출처 상세 — 원인 진단 + 표본 상위 3(앱·마스킹 주소·표본 수·기간) + 출처별 해결 방안 + SQL 튜닝 딥링크
function SrcDetail({ r, sel }: { r: TopRow; sel: Sel }) {
  const t = useTranslations('perf')
  const src = r.src
  if (!src) return null
  const href = `/sql-lab?link=${encodeURIComponent(sel.linkId)}&conn=${encodeURIComponent(sel.connId)}`
  return (
    <div className="bg-surface-raised flex flex-col gap-2 rounded-xl p-3 text-xs">
      <DiagBlock r={r} />
      <p className="text-muted-foreground font-semibold">
        {t('src.detailTitle')}
      </p>
      {src.top.length ? (
        <ul className="flex flex-col gap-1">
          {src.top.map((x, i) => (
            <li key={i} className="break-all">
              <span className="text-muted-foreground">
                {t('src.detail.app')}
              </span>{' '}
              {x.appNm || t('src.detail.none')} ·{' '}
              <span className="text-muted-foreground">
                {t('src.detail.addr')}
              </span>{' '}
              {x.addr || t('src.detail.none')} ·{' '}
              <span className="text-muted-foreground">
                {t('src.detail.samples')}
              </span>{' '}
              {fmtNum(x.smpCnt)} ·{' '}
              <span className="text-muted-foreground">
                {t('src.detail.active')}
              </span>{' '}
              {fmtNum(x.actvCnt ?? 0)}
              {x.fstDtm && (
                <>
                  {' · '}
                  <span className="text-muted-foreground">
                    {t('src.detail.period')}
                  </span>{' '}
                  {fmtDtm(x.fstDtm)} ~ {fmtDtm(x.lstDtm ?? null)}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground break-keep">{t('src.noSample')}</p>
      )}
      <p className="break-keep">{t(`src.fix.${src.cd}`)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          className={BTN}
          href={href}
          onClick={() => {
            // 쿼리문은 URL(서버 로그)에 싣지 않고 sessionStorage 로 1회 전달 — sql-lab 이 읽고 지움
            if (r.qryTxt) sessionStorage.setItem(SQL_LAB_SEED, r.qryTxt)
          }}
        >
          {t('top.openSqlLab')}
        </Link>
        <span className="text-muted-foreground break-keep">
          {t('src.openHint')}
        </span>
      </div>
    </div>
  )
}

function Pager({
  page,
  total,
  size,
  onPage,
}: {
  page: number
  total: number
  size: number
  onPage: (p: number) => void
}) {
  const t = useTranslations('perf')
  const last = Math.max(1, Math.ceil(total / size))
  if (last <= 1) return null
  return (
    <nav
      className="flex items-center justify-center gap-2 text-sm"
      aria-label={t('pager')}
    >
      <button
        className={BTN}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ‹
      </button>
      <span className="text-muted-foreground">
        {page} / {last}
      </span>
      <button
        className={BTN}
        disabled={page >= last}
        onClick={() => onPage(page + 1)}
      >
        ›
      </button>
    </nav>
  )
}

type HealthRes = {
  clctDtm: string | null
  unusedIdx: { idxNm: string; tblNm: string; szByte: number | null }[]
  fullScan: {
    tblNm: string
    fullScan: number
    liveTup: number
    ratio: number
  }[]
  dead: { tblNm: string; deadTup: number; liveTup: number; ratio: number }[]
}

// 3-3 테이블·인덱스 건강
function HealthTab({ sel, rev }: { sel: Sel; rev: number }) {
  const t = useTranslations('perf.health')
  const s = useGet<HealthRes>(`/api/perf/health?${qs(sel, `&r=${rev}`)}`)
  const d = s?.data
  const pct = (r: number) => `${(r * 100).toFixed(0)}%`
  return (
    <div className="flex flex-col gap-4">
      <Status s={s} />
      {d && !d.clctDtm && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {d?.clctDtm && (
        <>
          <p className="text-muted-foreground text-xs">
            {t('basis', { dtm: fmtDtm(d.clctDtm) })}
          </p>
          <List
            title={t('unusedIdx')}
            hint={t('unusedIdxHint')}
            items={d.unusedIdx.map((i) => [
              i.idxNm,
              i.tblNm,
              fmtBytes(i.szByte),
            ])}
            none={t('none')}
          />
          <List
            title={t('fullScan')}
            hint={t('fullScanHint')}
            items={d.fullScan.map((r) => [
              r.tblNm,
              `${fmtNum(r.fullScan)} ${t('scans')}`,
              pct(r.ratio),
            ])}
            none={t('none')}
          />
          <List
            title={t('dead')}
            hint={t('deadHint')}
            items={d.dead.map((r) => [
              r.tblNm,
              `${fmtNum(r.deadTup)} / ${fmtNum(r.liveTup)}`,
              pct(r.ratio),
            ])}
            none={t('none')}
          />
        </>
      )}
    </div>
  )
}

function List({
  title,
  hint,
  items,
  none,
}: {
  title: string
  hint: string
  items: string[][]
  none: string
}) {
  return (
    <div>
      <h3 className="font-semibold">
        {title}{' '}
        <span className="text-muted-foreground text-xs font-normal">
          ({items.length})
        </span>
      </h3>
      <p className="text-muted-foreground mb-1 text-xs break-keep">{hint}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{none}</p>
      ) : (
        <ul className="divide-y divide-white/5 text-sm">
          {items.map((c) => (
            <li
              key={c.join('|')}
              className="flex flex-wrap justify-between gap-x-3 py-1"
            >
              <span className="font-mono break-all">{c[0]}</span>
              <span className="text-muted-foreground">
                {c.slice(1).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type TrendRes = {
  points: { t: number; bytes: number }[]
  limitGb: number
  perDay: number | null
  daysLeft: number | null
}

// 3-4 용량 추이·예측 — 막대(최근 30일) + 임계 도달 예상일
function TrendTab({ sel, rev }: { sel: Sel; rev: number }) {
  const t = useTranslations('perf.trend')
  const [limitGb, setLimitGb] = useState(8)
  const s = useGet<TrendRes>(
    `/api/perf/trend?${qs(sel, `&limitGb=${limitGb}&r=${rev}`)}`,
  )
  const d = s?.data
  const max = d ? Math.max(1, ...d.points.map((p) => p.bytes)) : 1
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t('limit')}</span>
        <input
          type="number"
          min={0.1}
          step={0.1}
          className="bg-surface-raised h-9 w-24 rounded-lg px-2"
          defaultValue={limitGb}
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (v > 0) setLimitGb(v)
          }}
        />
        GB
      </label>
      <Status s={s} />
      {d && d.points.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      {d && d.points.length > 0 && (
        <>
          <div
            className="flex h-32 items-end gap-px"
            aria-label={t('chart')}
            role="img"
          >
            {d.points.map((p) => (
              <div
                key={p.t}
                title={`${fmtDtm(new Date(p.t).toISOString())} · ${fmtBytes(p.bytes)}`}
                className="bg-accent/70 min-w-0.5 flex-1 rounded-t"
                style={{ height: `${Math.max(2, (p.bytes / max) * 100)}%` }}
              />
            ))}
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">{t('now')}</dt>
              <dd>{fmtBytes(d.points[d.points.length - 1].bytes)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('perDay')}</dt>
              <dd>{d.perDay === null ? t('needMore') : fmtBytes(d.perDay)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('daysLeft', { gb: d.limitGb })}
              </dt>
              <dd>
                {d.daysLeft === null
                  ? t('noGrowth')
                  : t('days', { n: Math.floor(d.daysLeft) })}
              </dd>
            </div>
          </dl>
        </>
      )}
    </div>
  )
}

type Grid = { cols: string[]; rows: unknown[][]; ms: number }

// 3-5 활동·락 — 실시간(저장 안 함), 새로고침 버튼
function ActivityTab({ sel }: { sel: Sel }) {
  const t = useTranslations('perf.activity')
  const [n, setN] = useState(0)
  const s = useGet<{ activity: Grid; locks: Grid }>(
    `/api/perf/activity?${qs(sel, `&n=${n}`)}`,
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button className={BTN} onClick={() => setN((x) => x + 1)}>
          {t('refresh')}
        </button>
        <span className="text-muted-foreground text-xs">{t('live')}</span>
      </div>
      <Status s={s} />
      {s?.data && (
        <>
          <GridView
            title={t('sessions')}
            g={s.data.activity}
            none={t('none')}
          />
          <GridView title={t('locks')} g={s.data.locks} none={t('none')} />
        </>
      )}
    </div>
  )
}

function GridView({
  title,
  g,
  none,
}: {
  title: string
  g: Grid
  none: string
}) {
  return (
    <div>
      <h3 className="mb-1 font-semibold">
        {title}{' '}
        <span className="text-muted-foreground text-xs font-normal">
          ({g.rows.length} · {g.ms}ms)
        </span>
      </h3>
      {g.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{none}</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {g.cols.map((c) => (
                  <th key={c} className={TH}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  {r.map((v, j) => (
                    <td key={j} className={`${TD} max-w-xs break-all`}>
                      {v === null ? '-' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

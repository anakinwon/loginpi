'use client'

// 관리 화면 — 클라이언트 게이트 + piFetch. 사이트 심사(승인·반려 사유·정지·복구)·신고 처리(인용 → 사이트 정지 / 기각).
// 목록은 테이블(행 클릭 → 상세·액션 행 펼침) + 서버 페이지네이션(page·size, 기본 LIMITS.adminPageSize) — 마스터 지시 2026-10-13.
// 권한 판정은 서버(isAdmin) — 401/403 은 오류 문구로 표시
import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from './login-gate'
import { Pagination } from './pagination'
import {
  readApi,
  useApiErrorText,
  useRegFees,
  type ApiErrorBody,
} from '@/lib/client-api'
import {
  LIMITS,
  PLAN_COLOR,
  RJCT_RSN,
  VERIFY_FILE,
  type OwnerSite,
  type Paged,
} from '@/lib/site'

type AdminSite = OwnerSite & {
  sys_user: { pi_username: string | null } | null
  pi_pymnt: { pi_amt: number | string } | null // 결제 원장 임베드(미결제 null)
}
interface AdminReport {
  rpt_id: string
  site_id: string
  rpt_rsn_cd: string
  rpt_cont: string | null
  reg_dtm: string
  site_mst: { site_dom_nm: string; site_nm: string; site_sts_cd: string } | null
  sys_user: { pi_username: string | null } | null
}

const SITE_TABS = ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'] as const
// 페이지당 건수 선택지 — 서버 sizeParam 클램프(10~100)와 일치
const PAGE_SIZES = [20, 50, 100] as const

export function AdminPanel() {
  const t = useTranslations('admin')
  const [tab, setTab] = useState<'sites' | 'reports'>('sites')
  return (
    <LoginGate>
      {() => (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              className={tab === 'sites' ? 'btn btn-primary' : 'btn'}
              onClick={() => setTab('sites')}
            >
              {t('tabSites')}
            </button>
            <button
              className={tab === 'reports' ? 'btn btn-primary' : 'btn'}
              onClick={() => setTab('reports')}
            >
              {t('tabReports')}
            </button>
          </div>
          {tab === 'sites' ? <SiteQueue /> : <ReportQueue />}
        </div>
      )}
    </LoginGate>
  )
}

// 목록 조회 공용 — 페이지·건수·필터 변경 시 비동기 재조회(렌더 비차단, 이전 데이터는 응답 전까지 유지)
function usePaged<T>(url: string) {
  const [page, setPage] = useState(1)
  const [size, setSizeState] = useState<number>(LIMITS.adminPageSize)
  const [data, setData] = useState<Paged<T> | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    const r = await readApi<Paged<T>>(
      piFetch(
        `${url}${url.includes('?') ? '&' : '?'}page=${page}&size=${size}`,
      ),
    )
    setLoading(false)
    if (r.ok) setData(r.data)
    else {
      setData(null)
      setError(r.body)
    }
  }, [url, page, size])
  useEffect(() => {
    void load()
  }, [load])
  // 건수 변경은 1페이지부터
  const setSize = (n: number) => {
    setSizeState(n)
    setPage(1)
  }
  return {
    page,
    setPage,
    size,
    setSize,
    data,
    error,
    setError,
    loading,
    reload: load,
  }
}

async function patch(url: string, body: object) {
  return readApi(
    piFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

// 목록 머리말 — 총 건수 + 페이지당 건수 선택
function ListMeta({
  total,
  size,
  onSize,
}: {
  total: number | null
  size: number
  onSize: (n: number) => void
}) {
  const t = useTranslations('admin')
  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
      <span>{total == null ? '' : t('total', { n: total })}</span>
      <label className="flex items-center gap-1">
        {t('pageSize')}
        <select
          className="input w-auto py-1"
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function SiteQueue() {
  const t = useTranslations('admin')
  const ts = useTranslations('siteSts')
  const tc = useTranslations('siteCtgr')
  const tp = useTranslations('plan')
  const fmt = useFormatter()
  const errText = useApiErrorText()
  const [sts, setSts] = useState<(typeof SITE_TABS)[number]>('PENDING')
  const { data, error, setError, setPage, size, setSize, loading, reload } =
    usePaged<AdminSite>(`/api/admin/sites?sts=${sts}`)
  // 펼친 행(사이트 1건만 — 상세·액션은 한 번에 하나)
  const [open, setOpen] = useState<string | null>(null)

  const act = async (id: string, body: object) => {
    const r = await patch(`/api/admin/sites/${id}`, body)
    if (r.ok) {
      setOpen(null)
      void reload()
    } else setError(r.body)
  }

  const COLS = 10

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="input w-auto"
          value={sts}
          onChange={(e) => {
            setSts(e.target.value as (typeof SITE_TABS)[number])
            setPage(1)
            setOpen(null)
          }}
        >
          {SITE_TABS.map((s) => (
            <option key={s} value={s}>
              {ts(s)}
            </option>
          ))}
        </select>
        <div className="grow">
          <ListMeta total={data?.total ?? null} size={size} onSize={setSize} />
        </div>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {errText(error)}
        </p>
      )}
      <div
        className={`admin-table-wrap ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading}
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('colDate')}</th>
              <th>{t('colSite')}</th>
              <th>{t('colDomain')}</th>
              <th>{t('colCtgr')}</th>
              <th>{t('colPlan')}</th>
              <th>{t('colPay')}</th>
              <th>{t('colPayAmt')}</th>
              <th>{t('colPayDtm')}</th>
              <th>{t('colOwner')}</th>
              <th>{t('colDetail')}</th>
            </tr>
          </thead>
          <tbody>
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={COLS} className="text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
            {data?.items.map((s) => {
              const isOpen = open === s.site_id
              return (
                <SiteRows
                  key={s.site_id}
                  site={s}
                  open={isOpen}
                  cols={COLS}
                  onToggle={() => setOpen(isOpen ? null : s.site_id)}
                  onAct={(body) => void act(s.site_id, body)}
                  date={fmt.dateTime(new Date(s.reg_dtm), {
                    dateStyle: 'short',
                  })}
                  ctgr={tc(s.site_ctgr_cd)}
                  plan={tp(s.plan_cd)}
                  payDtm={
                    s.pay_dtm
                      ? fmt.dateTime(new Date(s.pay_dtm), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '-'
                  }
                />
              )
            })}
          </tbody>
        </table>
      </div>
      {data && (
        <Pagination
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          onChange={(p) => {
            setPage(p)
            setOpen(null)
          }}
        />
      )}
    </section>
  )
}

// 사이트 1건 = 요약 행 + (펼침 시) 상세·액션 행
function SiteRows({
  site: s,
  open,
  cols,
  onToggle,
  onAct,
  date,
  ctgr,
  plan,
  payDtm,
}: {
  site: AdminSite
  open: boolean
  cols: number
  onToggle: () => void
  onAct: (body: object) => void
  date: string
  ctgr: string
  plan: string
  payDtm: string
}) {
  const t = useTranslations('admin')
  // 상세 행 id — 열기/닫기 버튼의 aria-controls 대상(접근성, 팀장 지적 2026-10-13)
  const detailId = `site-detail-${s.site_id}`
  const pay =
    s.own_site_yn === 'Y' ? (
      <span className="text-xs text-violet-400">{t('ownSite')}</span>
    ) : (
      <span
        className={
          s.pymnt_id
            ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
            : 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-100'
        }
      >
        {s.pymnt_id ? t('paid') : t('unpaid')}
      </span>
    )
  return (
    <>
      <tr className="admin-table-row" onClick={onToggle}>
        <td className="whitespace-nowrap">{date}</td>
        <td className="font-semibold">{s.site_nm}</td>
        <td className="font-mono whitespace-nowrap">{s.site_dom_nm}</td>
        <td className="whitespace-nowrap">{ctgr}</td>
        <td className="whitespace-nowrap">
          {/* 요금제 배지 — 메인 버블과 같은 색(PLAN_COLOR) */}
          <span
            className="rounded border px-2 py-0.5 text-xs font-semibold"
            style={{
              color: PLAN_COLOR[s.plan_cd],
              borderColor: PLAN_COLOR[s.plan_cd],
            }}
          >
            {plan}
          </span>
        </td>
        <td className="whitespace-nowrap">{pay}</td>
        <td className="text-right whitespace-nowrap tabular-nums">
          {s.pi_pymnt ? `${Number(s.pi_pymnt.pi_amt)} Pi` : '-'}
        </td>
        <td className="whitespace-nowrap">{payDtm}</td>
        <td className="whitespace-nowrap">{s.sys_user?.pi_username ?? '-'}</td>
        <td className="whitespace-nowrap">
          <button
            type="button"
            className="btn py-0.5 text-xs"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {open ? t('detailClose') : t('detailOpen')}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="admin-table-detail" id={detailId}>
          <td colSpan={cols}>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                {t('pvtCntc')}: {s.pvt_cntc_txt ?? '-'}
                {' · '}
                {t('pubCntc')}: {s.pub_cntc_txt ?? '-'}
              </p>
              {s.own_site_yn !== 'Y' && s.vrfy_tkn && (
                <div className="rounded border border-amber-300 p-2 text-xs">
                  <p>
                    {t('verifyToken')}:{' '}
                    <code className="font-mono select-all">{s.vrfy_tkn}</code>
                  </p>
                  <ol className="ml-4 list-decimal">
                    <li>
                      {t('verifyStep1')}{' '}
                      <a
                        className="underline"
                        href={`https://${s.site_dom_nm}${VERIFY_FILE}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {`https://${s.site_dom_nm}${VERIFY_FILE}`}
                      </a>
                    </li>
                    <li>{t('verifyStep2')}</li>
                    <li>{t('verifyStep3')}</li>
                  </ol>
                </div>
              )}
              <div className="flex gap-3">
                {s.site_img_url && (
                  <img
                    src={s.site_img_url}
                    alt=""
                    className="size-20 shrink-0 rounded object-cover"
                  />
                )}
                {s.site_desc && (
                  <p className="whitespace-pre-wrap">{s.site_desc}</p>
                )}
              </div>
              <SiteActions site={s} onAct={onAct} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function SiteActions({
  site,
  onAct,
}: {
  site: AdminSite
  onAct: (body: object) => void
}) {
  const t = useTranslations('admin')
  const tr = useTranslations('rjctRsn')
  const [rsnCd, setRsnCd] = useState<string>(RJCT_RSN[0])
  const [rsnCont, setRsnCont] = useState('')
  // 외부 등록은 소유 확인 체크 후에만 승인 가능(서버도 ownershipVerified 없으면 400)
  const needVerify = site.own_site_yn !== 'Y'
  // 결제 필요 = 외부 등록 · 미결제 · 단가 > 0 (요금표 조회 중엔 필요로 간주 — 서버 402 가 최종 판정)
  const fees = useRegFees()
  const needPay =
    needVerify &&
    !site.pymnt_id &&
    (fees == null || (fees[site.plan_cd]?.pi_amt ?? 0) > 0)
  const [verified, setVerified] = useState(false)
  const memo = (
    <input
      className="input"
      maxLength={LIMITS.rsnCont}
      placeholder={t('memoPlaceholder')}
      value={rsnCont}
      onChange={(e) => setRsnCont(e.target.value)}
    />
  )

  if (site.site_sts_cd === 'PENDING')
    return (
      <div className="mt-2 flex flex-col gap-2">
        {needVerify && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            {t('ownershipVerified')}
          </label>
        )}
        {/* 외부 등록은 결제 완료 전 승인 불가(서버 402 PAYMENT_REQUIRED — 단가 0 요금제는 서버가 통과시킴) */}
        {needPay && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t('unpaidNote')}
          </p>
        )}
        <button
          className="btn btn-primary w-fit"
          disabled={(needVerify && !verified) || needPay}
          onClick={() =>
            onAct({ action: 'approve', ownershipVerified: verified })
          }
        >
          {t('approve')}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto"
            value={rsnCd}
            onChange={(e) => setRsnCd(e.target.value)}
          >
            {RJCT_RSN.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-danger"
            onClick={() => onAct({ action: 'reject', rsnCd, rsnCont })}
          >
            {t('reject')}
          </button>
        </div>
        {memo}
      </div>
    )
  if (site.site_sts_cd === 'APPROVED')
    return (
      <div className="mt-2 flex flex-col gap-2">
        {memo}
        <button
          className="btn btn-danger w-fit"
          onClick={() => onAct({ action: 'suspend', rsnCont })}
        >
          {t('suspend')}
        </button>
      </div>
    )
  if (site.site_sts_cd === 'SUSPENDED')
    return (
      <button
        className="btn mt-2 w-fit"
        onClick={() => onAct({ action: 'restore' })}
      >
        {t('restore')}
      </button>
    )
  return null
}

function ReportQueue() {
  const t = useTranslations('admin')
  const tr = useTranslations('rptRsn')
  const ts = useTranslations('siteSts')
  const fmt = useFormatter()
  const errText = useApiErrorText()
  const { data, error, setError, setPage, size, setSize, loading, reload } =
    usePaged<AdminReport>('/api/admin/reports?sts=RECEIVED')
  const [memo, setMemo] = useState<Record<string, string>>({})

  const act = async (id: string, action: 'accept' | 'dismiss') => {
    const r = await patch(`/api/admin/reports/${id}`, {
      action,
      prcsCont: memo[id] ?? '',
    })
    if (r.ok) void reload()
    else setError(r.body)
  }

  return (
    <section className="flex flex-col gap-3">
      <ListMeta total={data?.total ?? null} size={size} onSize={setSize} />
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {errText(error)}
        </p>
      )}
      <div
        className={`admin-table-wrap ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading}
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t('colReceived')}</th>
              <th>{t('colDomain')}</th>
              <th>{t('colReason')}</th>
              <th>{t('colReporter')}</th>
              <th>{t('colContent')}</th>
              <th>{t('colProcess')}</th>
            </tr>
          </thead>
          <tbody>
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground">
                  {t('empty')}
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.rpt_id}>
                <td className="whitespace-nowrap">
                  {fmt.dateTime(new Date(r.reg_dtm), { dateStyle: 'short' })}
                </td>
                <td className="whitespace-nowrap">
                  <span className="font-mono">{r.site_mst?.site_dom_nm}</span>{' '}
                  <span className="text-muted-foreground text-xs">
                    ({r.site_mst ? ts(r.site_mst.site_sts_cd) : '-'})
                  </span>
                </td>
                <td className="whitespace-nowrap">{tr(r.rpt_rsn_cd)}</td>
                <td className="whitespace-nowrap">
                  {r.sys_user?.pi_username ?? '-'}
                </td>
                <td className="min-w-48 whitespace-pre-wrap">
                  {r.rpt_cont ?? '-'}
                </td>
                <td className="min-w-64">
                  <div className="flex flex-col gap-2">
                    <input
                      className="input"
                      maxLength={LIMITS.rsnCont}
                      placeholder={t('memoPlaceholder')}
                      value={memo[r.rpt_id] ?? ''}
                      onChange={(e) =>
                        setMemo({ ...memo, [r.rpt_id]: e.target.value })
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn btn-danger"
                        onClick={() => void act(r.rpt_id, 'accept')}
                      >
                        {t('accept')}
                      </button>
                      <button
                        className="btn"
                        onClick={() => void act(r.rpt_id, 'dismiss')}
                      >
                        {t('dismiss')}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && (
        <Pagination
          page={data.page}
          total={data.total}
          pageSize={data.pageSize}
          onChange={setPage}
        />
      )}
    </section>
  )
}

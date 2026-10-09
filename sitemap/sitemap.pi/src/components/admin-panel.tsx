'use client'

// 관리 화면 — 클라이언트 게이트 + piFetch. 사이트 심사(승인·반려 사유·정지·복구)·신고 처리(인용 → 사이트 정지 / 기각).
// 권한 판정은 서버(isAdmin) — 401/403 은 오류 문구로 표시
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from './login-gate'
import { Pagination } from './pagination'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import {
  LIMITS,
  RJCT_RSN,
  VERIFY_FILE,
  type OwnerSite,
  type Paged,
} from '@/lib/site'

type AdminSite = OwnerSite & { sys_user: { pi_username: string | null } | null }
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

// 목록 조회 공용 — 페이지·필터 변경 시 비동기 재조회
function usePaged<T>(url: string) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<T> | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const load = useCallback(async () => {
    setError(null)
    const r = await readApi<Paged<T>>(
      piFetch(`${url}${url.includes('?') ? '&' : '?'}page=${page}`),
    )
    if (r.ok) setData(r.data)
    else {
      setData(null)
      setError(r.body)
    }
  }, [url, page])
  useEffect(() => {
    void load()
  }, [load])
  return { page, setPage, data, error, setError, reload: load }
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

function SiteQueue() {
  const t = useTranslations('admin')
  const ts = useTranslations('siteSts')
  const tc = useTranslations('siteCtgr')
  const errText = useApiErrorText()
  const [sts, setSts] = useState<(typeof SITE_TABS)[number]>('PENDING')
  const { data, error, setError, setPage, reload } = usePaged<AdminSite>(
    `/api/admin/sites?sts=${sts}`,
  )

  const act = async (id: string, body: object) => {
    const r = await patch(`/api/admin/sites/${id}`, body)
    if (r.ok) void reload()
    else setError(r.body)
  }

  return (
    <section className="flex flex-col gap-3">
      <select
        className="input w-auto"
        value={sts}
        onChange={(e) => {
          setSts(e.target.value as (typeof SITE_TABS)[number])
          setPage(1)
        }}
      >
        {SITE_TABS.map((s) => (
          <option key={s} value={s}>
            {ts(s)}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {errText(error)}
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.items.map((s) => (
          <li key={s.site_id} className="card flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{s.site_nm}</span>
              <span className="font-mono">{s.site_dom_nm}</span>
              <span className="text-muted-foreground">
                {tc(s.site_ctgr_cd)}
              </span>
              {s.own_site_yn === 'Y' && (
                <span className="text-xs text-violet-400">{t('ownSite')}</span>
              )}
            </div>
            <p className="text-muted-foreground">
              {t('owner')}: {s.sys_user?.pi_username ?? '-'} · {t('pvtCntc')}:{' '}
              {s.pvt_cntc_txt ?? '-'}
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
            {s.site_img_url && (
              <img
                src={s.site_img_url}
                alt=""
                className="size-20 rounded object-cover"
              />
            )}
            {s.site_desc && (
              <p className="whitespace-pre-wrap">{s.site_desc}</p>
            )}
            <SiteActions site={s} onAct={(body) => void act(s.site_id, body)} />
          </li>
        ))}
      </ul>
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
        <button
          className="btn btn-primary w-fit"
          disabled={needVerify && !verified}
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
  const errText = useApiErrorText()
  const { data, error, setError, setPage, reload } = usePaged<AdminReport>(
    '/api/admin/reports?sts=RECEIVED',
  )
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
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {errText(error)}
        </p>
      )}
      {data && data.items.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      )}
      <ul className="flex flex-col gap-3">
        {data?.items.map((r) => (
          <li key={r.rpt_id} className="card flex flex-col gap-1 text-sm">
            <p>
              <span className="font-mono">{r.site_mst?.site_dom_nm}</span>{' '}
              <span className="text-muted-foreground">
                ({r.site_mst ? ts(r.site_mst.site_sts_cd) : '-'})
              </span>
            </p>
            <p>
              {t('reason')}: {tr(r.rpt_rsn_cd)} · {t('reporter')}:{' '}
              {r.sys_user?.pi_username ?? '-'}
            </p>
            {r.rpt_cont && <p className="whitespace-pre-wrap">{r.rpt_cont}</p>}
            <input
              className="input"
              maxLength={LIMITS.rsnCont}
              placeholder={t('memoPlaceholder')}
              value={memo[r.rpt_id] ?? ''}
              onChange={(e) => setMemo({ ...memo, [r.rpt_id]: e.target.value })}
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
          </li>
        ))}
      </ul>
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

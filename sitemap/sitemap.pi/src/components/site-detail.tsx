'use client'

// 사이트 상세 — 소개·이미지·조회수·방문(이동 안내 확인 후에만 이동, 자동 리다이렉트·iframe 금지 A-6)·신고.
// 조회·클릭 기록은 브라우저 세션당 사이트·유형별 1회(sessionStorage)로 중복 완화
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { LoginGate } from './login-gate'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import { LIMITS, RPT_RSN, type PublicSite } from '@/lib/site'

function recordStat(siteId: string, type: 'VIEW' | 'CLCK') {
  const key = `stat:${type}:${siteId}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch {
    // 저장소 차단 환경 — 서버 rate limit 이 2차 방어
  }
  void fetch('/api/stat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteId, type }),
    keepalive: true, // 이동 직후에도 전송 유지
  }).catch(() => {})
}

export function SiteDetail({ domain }: { domain: string }) {
  const t = useTranslations('detail')
  const tc = useTranslations('siteCtgr')
  const errText = useApiErrorText()
  const [data, setData] = useState<{
    site: PublicSite
    viewCnt: number
  } | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    void readApi<{ site: PublicSite; viewCnt: number }>(
      fetch(`/api/sites/${encodeURIComponent(domain)}`),
    ).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setData(r.data)
        recordStat(r.data.site.site_id, 'VIEW')
      } else setError(r.body)
    })
    return () => {
      cancelled = true
    }
  }, [domain])

  if (error)
    return (
      <p className="card text-destructive text-sm" role="alert">
        {errText(error)}
      </p>
    )
  if (!data)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  const { site, viewCnt } = data
  const url = `https://${site.site_dom_nm}`
  const visit = () => {
    recordStat(site.site_id, 'CLCK')
    // 새 창으로 열기 — noopener 로 이동한 사이트가 이 창(window.opener)에 접근하지 못하게
    window.open(url, '_blank', 'noopener,noreferrer')
    setConfirming(false)
  }

  return (
    <article className="flex flex-col gap-4">
      <header className="flex items-start gap-4">
        {site.site_img_url ? (
          <img
            src={site.site_img_url}
            alt={site.site_nm}
            className="size-24 rounded-lg object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{site.site_nm}</h1>
          <p className="text-muted-foreground">{site.site_dom_nm}</p>
          <p className="text-muted-foreground text-sm">
            {tc(site.site_ctgr_cd)} · {t('views', { count: viewCnt })}
          </p>
        </div>
      </header>

      {site.site_desc && (
        <p className="whitespace-pre-wrap">{site.site_desc}</p>
      )}
      {site.pub_cntc_txt && (
        <p className="text-sm">
          {t('contact')}: {site.pub_cntc_txt}
        </p>
      )}

      {confirming ? (
        <div
          className="card flex flex-col gap-2"
          role="dialog"
          aria-modal="false"
        >
          <p className="font-medium">{t('leaveTitle')}</p>
          <p className="text-sm">{t('leaveBody')}</p>
          <p className="font-mono text-sm break-all">{url}</p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={visit}>
              {t('leaveConfirm')}
            </button>
            <button className="btn" onClick={() => setConfirming(false)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            className="btn btn-primary"
            onClick={() => setConfirming(true)}
          >
            {t('visit')}
          </button>
        </div>
      )}

      <ReportBox siteId={site.site_id} />
    </article>
  )
}

function ReportBox({ siteId }: { siteId: string }) {
  const t = useTranslations('report')
  const tr = useTranslations('rptRsn')
  const errText = useApiErrorText()
  const [open, setOpen] = useState(false)
  const [rsn, setRsn] = useState<string>(RPT_RSN[0])
  const [cont, setCont] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  if (!open)
    return (
      <div>
        <button className="btn text-sm" onClick={() => setOpen(true)}>
          {t('open')}
        </button>
      </div>
    )

  return (
    <section className="card flex flex-col gap-2">
      <h2 className="font-semibold">{t('title')}</h2>
      <LoginGate>
        {() =>
          msg?.ok ? (
            <p className="text-sm">{msg.text}</p>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                const r = await readApi(
                  piFetch('/api/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteId, rsn, cont }),
                  }),
                )
                setBusy(false)
                setMsg(
                  r.ok
                    ? { ok: true, text: t('done') }
                    : { ok: false, text: errText(r.body) },
                )
              }}
            >
              <label className="label" htmlFor="rpt-rsn">
                {t('reason')}
              </label>
              <select
                id="rpt-rsn"
                className="input"
                value={rsn}
                onChange={(e) => setRsn(e.target.value)}
              >
                {RPT_RSN.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
              </select>
              <textarea
                className="input"
                rows={3}
                maxLength={LIMITS.rpt}
                placeholder={t('detailPlaceholder')}
                value={cont}
                onChange={(e) => setCont(e.target.value)}
              />
              {msg && !msg.ok && (
                <p className="text-destructive text-sm">{msg.text}</p>
              )}
              <div className="flex gap-2">
                <button className="btn btn-danger" disabled={busy}>
                  {t('submit')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setOpen(false)}
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          )
        }
      </LoginGate>
    </section>
  )
}

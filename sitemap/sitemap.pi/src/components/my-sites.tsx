'use client'

// 내 사이트 — 클라이언트 게이트(서버 redirect 없음) 뒤에서 piFetch 로 내 등록 목록·등록·수정·제출·철회.
// 상태·반려 사유 표시, 'pi' 접두 도메인은 PI_BRAND 반려 대상 경고(등록은 받음 — 심사에서 판정)
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { LoginGate } from './login-gate'
import { Pagination } from './pagination'
import { readApi, useApiErrorText, type ApiErrorBody } from '@/lib/client-api'
import {
  DOMAIN_RE,
  isPiBrandDomain,
  LIMITS,
  normalizeDomain,
  SITE_CTGR,
  type OwnerSite,
  type Paged,
  type SiteSts,
  VERIFY_FILE,
} from '@/lib/site'

const EDITABLE: SiteSts[] = ['DRAFT', 'PENDING', 'REJECTED', 'APPROVED']

export function MySites() {
  return <LoginGate>{() => <MySitesInner />}</LoginGate>
}

function MySitesInner() {
  const t = useTranslations('me')
  const ts = useTranslations('siteSts')
  const tr = useTranslations('rjctRsn')
  const errText = useApiErrorText()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<OwnerSite> | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)
  const [editing, setEditing] = useState<OwnerSite | 'new' | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const r = await readApi<Paged<OwnerSite>>(
      piFetch(`/api/me/sites?page=${page}`),
    )
    if (r.ok) setData(r.data)
    else setError(r.body)
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  const withdraw = async (s: OwnerSite) => {
    if (!window.confirm(t('withdrawConfirm', { domain: s.site_dom_nm }))) return
    const r = await readApi(
      piFetch(`/api/me/sites/${s.site_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw' }),
      }),
    )
    if (r.ok) void load()
    else setError(r.body)
  }

  if (editing)
    return (
      <SiteForm
        site={editing === 'new' ? null : editing}
        onDone={() => {
          setEditing(null)
          void load()
        }}
      />
    )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          {t('new')}
        </button>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {errText(error)}
        </p>
      )}
      {!data ? (
        !error && (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        )
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((s) => (
              <li key={s.site_id} className="card flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{s.site_nm}</span>
                  <span className="text-muted-foreground text-sm">
                    {s.site_dom_nm}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
                    {ts(s.site_sts_cd)}
                  </span>
                </div>
                {s.site_sts_cd === 'REJECTED' && s.rjct_rsn_cd && (
                  <p className="text-destructive text-sm">
                    {t('rejectReason')}: {tr(s.rjct_rsn_cd)}
                    {s.rjct_rsn_cont ? ` — ${s.rjct_rsn_cont}` : ''}
                  </p>
                )}
                {s.site_sts_cd === 'SUSPENDED' && (
                  <p className="text-destructive text-sm">
                    {t('suspendedNote')}
                    {s.rjct_rsn_cont ? ` — ${s.rjct_rsn_cont}` : ''}
                  </p>
                )}
                {s.vrfy_tkn && s.site_sts_cd !== 'WITHDRAWN' && (
                  <p className="text-muted-foreground text-xs">
                    {t('verifyGuide', {
                      url: `https://${s.site_dom_nm}${VERIFY_FILE}`,
                    })}{' '}
                    <code className="font-mono select-all">{s.vrfy_tkn}</code>
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  {EDITABLE.includes(s.site_sts_cd) && (
                    <button className="btn" onClick={() => setEditing(s)}>
                      {t('edit')}
                    </button>
                  )}
                  {s.site_sts_cd !== 'WITHDRAWN' &&
                    s.site_sts_cd !== 'SUSPENDED' && (
                    <button className="btn" onClick={() => void withdraw(s)}>
                      {t('withdraw')}
                    </button>
                  )}
                  {s.site_sts_cd === 'APPROVED' && (
                    <Link className="btn" href={`/s/${s.site_dom_nm}`}>
                      {t('view')}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            onChange={setPage}
          />
        </>
      )}
    </div>
  )
}

function SiteForm({
  site,
  onDone,
}: {
  site: OwnerSite | null
  onDone: () => void
}) {
  const t = useTranslations('form')
  const tc = useTranslations('siteCtgr')
  const errText = useApiErrorText()
  const [domain, setDomain] = useState(site?.site_dom_nm ?? '')
  const [name, setName] = useState(site?.site_nm ?? '')
  const [ctgr, setCtgr] = useState<string>(site?.site_ctgr_cd ?? 'ETC')
  const [desc, setDesc] = useState(site?.site_desc ?? '')
  const [imgUrl, setImgUrl] = useState<string | null>(
    site?.site_img_url ?? null,
  )
  const [pvtCntc, setPvtCntc] = useState(site?.pvt_cntc_txt ?? '')
  const [pubCntc, setPubCntc] = useState(site?.pub_cntc_txt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const norm = normalizeDomain(domain)
  const domainValid = DOMAIN_RE.test(norm)
  const domainLocked =
    !!site && !['DRAFT', 'REJECTED'].includes(site.site_sts_cd)

  const upload = async (file: File) => {
    if (file.size > LIMITS.imgMaxBytes)
      return setError(errText({ code: 'IMG_TOO_LARGE' }))
    setBusy(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    const r = await readApi<{ url: string }>(
      piFetch('/api/me/upload', { method: 'POST', body: fd }),
    )
    setBusy(false)
    if (r.ok) setImgUrl(r.data.url)
    else setError(errText(r.body))
  }

  const save = async (submit: boolean) => {
    if (!domainValid) return setError(t('domainInvalid'))
    if (submit && !pvtCntc.trim()) return setError(t('pvtRequired'))
    setBusy(true)
    setError(null)
    const r = await readApi(
      piFetch(site ? `/api/me/sites/${site.site_id}` : '/api/me/sites', {
        method: site ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: norm,
          name,
          ctgr,
          desc,
          imgUrl,
          pvtCntc,
          pubCntc,
          submit,
        }),
      }),
    )
    setBusy(false)
    if (r.ok) onDone()
    else setError(errText(r.body))
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      <h2 className="text-lg font-semibold">
        {site ? t('editTitle') : t('newTitle')}
      </h2>
      {site?.site_sts_cd === 'APPROVED' && (
        <p className="text-sm text-amber-600">{t('reReviewNote')}</p>
      )}

      <div>
        <label className="label" htmlFor="f-domain">
          {t('domain')}
        </label>
        <input
          id="f-domain"
          className="input"
          value={domain}
          disabled={domainLocked}
          placeholder="example.pi"
          autoCapitalize="none"
          onChange={(e) => setDomain(e.target.value)}
        />
        <p className="text-muted-foreground mt-1 text-xs">{t('domainHint')}</p>
        {domain && !domainValid && (
          <p className="text-destructive text-xs">{t('domainInvalid')}</p>
        )}
        {domainValid && isPiBrandDomain(norm) && (
          <p className="text-xs text-amber-600">{t('piBrandWarn')}</p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="f-name">
          {t('name')}
        </label>
        <input
          id="f-name"
          className="input"
          maxLength={LIMITS.nameMax}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="f-ctgr">
          {t('category')}
        </label>
        <select
          id="f-ctgr"
          className="input"
          value={ctgr}
          onChange={(e) => setCtgr(e.target.value)}
        >
          {SITE_CTGR.map((c) => (
            <option key={c} value={c}>
              {tc(c)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="f-desc">
          {t('desc')}
        </label>
        <textarea
          id="f-desc"
          className="input"
          rows={5}
          maxLength={LIMITS.descMax}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <p className="text-muted-foreground text-right text-xs">
          {desc.length} / {LIMITS.descMax}
        </p>
      </div>

      <div>
        <label className="label" htmlFor="f-img">
          {t('image')}
        </label>
        {imgUrl && (
          <img
            src={imgUrl}
            alt=""
            className="mb-2 size-24 rounded-md object-cover"
          />
        )}
        <input
          id="f-img"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="text-sm"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
          }}
        />
        <p className="text-muted-foreground mt-1 text-xs">{t('imageHint')}</p>
        {imgUrl && (
          <button
            type="button"
            className="btn mt-1"
            onClick={() => setImgUrl(null)}
          >
            {t('imageRemove')}
          </button>
        )}
      </div>

      <div>
        <label className="label" htmlFor="f-pvt">
          {t('pvtCntc')}
        </label>
        <input
          id="f-pvt"
          className="input"
          maxLength={LIMITS.cntcMax}
          value={pvtCntc}
          onChange={(e) => setPvtCntc(e.target.value)}
        />
        <p className="text-muted-foreground mt-1 text-xs">{t('pvtHint')}</p>
      </div>

      <div>
        <label className="label" htmlFor="f-pub">
          {t('pubCntc')}
        </label>
        <input
          id="f-pub"
          className="input"
          maxLength={LIMITS.cntcMax}
          value={pubCntc}
          onChange={(e) => setPubCntc(e.target.value)}
        />
        <p className="text-muted-foreground mt-1 text-xs">{t('pubHint')}</p>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(!site || site.site_sts_cd === 'DRAFT') && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void save(false)}
          >
            {t('saveDraft')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void save(true)}
        >
          {t('submit')}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

'use client'

// 내 사이트 — 클라이언트 게이트(서버 redirect 없음) 뒤에서 piFetch 로 내 등록 목록·등록·수정·신청·재등록·철회.
// 상태 9종(siteSts)·사용기간·반려 사유 표시, 'pi' 접두 도메인은 PI_BRAND 반려 대상 경고(등록은 받음 — 관리자가 반려·정지)
import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link, useRouter } from '@/i18n/navigation'
import { LoginGate } from './login-gate'
import { Pagination } from './pagination'
import {
  hourText,
  readApi,
  useApiErrorText,
  useFeeData,
  useFeeLabel,
  useRegFees,
  type ApiErrorBody,
  type FeeMap,
} from '@/lib/client-api'
import { LogoField } from './logo-field'
import {
  APPLY_PLAN_CD,
  DOMAIN_EDITABLE_STS,
  DOMAIN_RE,
  EDITABLE_STS,
  isPiBrandDomain,
  LIMITS,
  normalizeDomain,
  SITE_CTGR,
  type OwnerSite,
  type Paged,
  PAYABLE_STS,
  SPK_PAYABLE_STS,
  VERIFY_FILE,
  WITHDRAW_BLOCKED_STS,
} from '@/lib/site'

// 결제 필요 여부 — 외부 등록·미결제·결제 가능 상태(APPLYING)·단가 > 0. 결제 자체는 /pay/<id>
//  요금표 조회 중(null)엔 필요로 간주(admin-panel 과 동일 — 서버가 최종 판정), 조회 실패({})는 불필요
const needsPayment = (s: OwnerSite, fees: FeeMap | null) =>
  s.own_site_yn !== 'Y' &&
  !s.pymnt_id &&
  (PAYABLE_STS as readonly string[]).includes(s.site_sts_cd) &&
  (fees == null || (fees[s.plan_cd]?.pi_amt ?? 0) > 0)
// 사용료 결제 표시 금액 — 반짝임 신청(미결제)이 있으면 합산(서버 prepare 와 같은 규칙)
const payAmount = (s: OwnerSite, fees: FeeMap | null) => {
  const base = fees?.[s.plan_cd]?.pi_amt
  if (base == null) return '…'
  const spk =
    s.spk_yn === 'Y' && !s.spk_pymnt_id ? (fees?.[s.plan_cd]?.spk ?? 0) : 0
  return String(base + spk)
}
// 반짝임 단독 결제 필요 — 사용료 결제 뒤(APPLYING 은 pymnt_id 있을 때)·신청 켜짐·미결제·판매 중
const needsSpkPayment = (s: OwnerSite, fees: FeeMap | null) =>
  s.own_site_yn !== 'Y' &&
  s.spk_yn === 'Y' &&
  !s.spk_pymnt_id &&
  (SPK_PAYABLE_STS as readonly string[]).includes(s.site_sts_cd) &&
  (s.site_sts_cd !== 'APPLYING' || !!s.pymnt_id) &&
  (fees == null || (fees[s.plan_cd]?.spk ?? 0) > 0)

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
  const tp = useTranslations('plan')
  const fmt = useFormatter()
  const { fees, cfg } = useFeeData()
  const feeLabel = useFeeLabel()
  const when = (iso: string) =>
    fmt.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short' })

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
                  <span className="text-muted-foreground text-xs">
                    {tp(s.plan_cd)}
                    {s.spk_yn === 'Y' ? '++' : ''}
                    {fees?.[s.plan_cd]
                      ? ` · ${feeLabel(fees[s.plan_cd]).term}`
                      : ''}
                  </span>
                  {s.own_site_yn !== 'Y' &&
                    s.site_sts_cd !== 'WITHDRAWN' &&
                    (fees?.[s.plan_cd]?.pi_amt ?? 0) > 0 && (
                      <span
                        className={
                          s.pymnt_id
                            ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                            : 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-100'
                        }
                      >
                        {s.pymnt_id ? t('paid') : t('unpaid')}
                      </span>
                    )}
                </div>
                {needsPayment(s, fees) && (
                  <div className="mt-1 flex flex-col gap-1">
                    <p className="text-muted-foreground text-xs">
                      {t('payHint')}
                    </p>
                    <Link
                      className="btn btn-primary w-fit"
                      href={`/pay/${s.site_id}`}
                    >
                      {t('payGo', { amount: payAmount(s, fees) })}
                    </Link>
                  </div>
                )}
                {s.spk_yn === 'Y' && (
                  <p className="text-xs">
                    ✨ {t('spk')}
                    {s.own_site_yn !== 'Y' && (
                      <span className="text-muted-foreground">
                        {' · '}
                        {s.spk_pymnt_id ? t('paid') : t('unpaid')}
                      </span>
                    )}
                  </p>
                )}
                {needsSpkPayment(s, fees) && (
                  <Link
                    className="btn w-fit"
                    href={`/pay/${s.site_id}?kind=spk`}
                  >
                    {t('spkGo', { amount: fees?.[s.plan_cd]?.spk ?? '…' })}
                  </Link>
                )}
                {s.site_sts_cd === 'APPLYING' && (
                  <p className="text-muted-foreground text-xs">
                    {t('payDeadline', {
                      h: hourText(cfg?.SITE_PAY_TIMEOUT_HOUR),
                    })}
                  </p>
                )}
                {s.site_sts_cd === 'PAID' && (
                  <p className="text-muted-foreground text-xs">
                    {t('useStartAt', {
                      h: hourText(cfg?.SITE_USE_BGN_DELAY_HOUR),
                    })}
                  </p>
                )}
                {s.site_sts_cd === 'IN_USE' && (
                  <p className="text-muted-foreground text-xs">
                    {t('useEndAt', {
                      time: s.use_end_dtm
                        ? when(s.use_end_dtm)
                        : t('permanent'),
                    })}
                  </p>
                )}
                {s.site_sts_cd === 'USED' && (
                  <p className="text-xs text-amber-600">
                    {t('reapplyUntil', {
                      h: hourText(cfg?.SITE_REAPLY_WINDOW_HOUR),
                    })}
                  </p>
                )}
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
                  {/* USED 는 저장 경로가 없어 [재등록]만 노출(수정 버튼을 눌러도 재신청이 되는 오해 방지) */}
                  {EDITABLE_STS.includes(s.site_sts_cd) &&
                    s.site_sts_cd !== 'USED' && (
                      <button className="btn" onClick={() => setEditing(s)}>
                        {t('edit')}
                      </button>
                    )}
                  {/* 재등록(USED, 도메인 유지)·다시 신청(EXPIRED) — 수정 폼을 열어 신청하면 새 결제로 이어진다 */}
                  {(s.site_sts_cd === 'USED' ||
                    s.site_sts_cd === 'EXPIRED') && (
                    <button
                      className="btn btn-primary"
                      onClick={() => setEditing(s)}
                    >
                      {t(s.site_sts_cd === 'USED' ? 'reapply' : 'reapplyOpen')}
                    </button>
                  )}
                  {!WITHDRAW_BLOCKED_STS.includes(s.site_sts_cd) && (
                    <button className="btn" onClick={() => void withdraw(s)}>
                      {t('withdraw')}
                    </button>
                  )}
                  {s.site_sts_cd === 'IN_USE' && (
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
  const [mvUrl, setMvUrl] = useState(site?.site_mv_url ?? '')
  // 등록 요금제 — 신청자는 유료 5단계 중 선택. 사용 중(IN_USE)엔 요금제·이동 URL 잠금(서버 409), 재등록(USED·EXPIRED)은 새 결제라 선택 가능
  const [planCd, setPlanCd] = useState<string>(
    site?.plan_cd && site.plan_cd !== 'NONE' ? site.plan_cd : 'BSC1',
  )
  // 반짝임 부가서비스 — 결제된 뒤엔 끌 수 없다(서버도 강제)
  const [spk, setSpk] = useState(site?.spk_yn === 'Y')
  // 재등록(USED·EXPIRED)은 새 결제라 지난 주기 결제와 무관하게 다시 고른다
  const spkPaid =
    !!site?.spk_pymnt_id &&
    site.site_sts_cd !== 'USED' &&
    site.site_sts_cd !== 'EXPIRED'
  const inUse = site?.site_sts_cd === 'IN_USE'
  // 결제가 남은 행(IN_USE, 결제 후 반려 등)은 요금제 잠금 — 재등록(USED·EXPIRED)만 새 결제라 선택 가능
  const planLocked =
    inUse ||
    (!!site?.pymnt_id &&
      site.site_sts_cd !== 'USED' &&
      site.site_sts_cd !== 'EXPIRED')
  const tp = useTranslations('plan')
  const fees = useRegFees()
  const feeLabel = useFeeLabel()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const norm = normalizeDomain(domain)
  const domainValid = DOMAIN_RE.test(norm)
  const domainLocked = !!site && !DOMAIN_EDITABLE_STS.includes(site.site_sts_cd)

  const save = async (submit: boolean) => {
    if (!domainValid) return setError(t('domainInvalid'))
    if (submit && !pvtCntc.trim()) return setError(t('pvtRequired'))
    setBusy(true)
    setError(null)
    const r = await readApi<{ site: OwnerSite }>(
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
          mvUrl,
          planCd,
          spk,
          submit,
        }),
      }),
    )
    setBusy(false)
    if (!r.ok) return setError(errText(r.body))
    // 신청 직후 결제가 필요하면 결제 페이지로 — 신청 → 결제 흐름을 끊지 않는다
    if (submit && needsPayment(r.data.site, fees))
      router.push(`/pay/${r.data.site.site_id}`)
    else onDone()
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      <h2 className="text-lg font-semibold">
        {site ? t('editTitle') : t('newTitle')}
      </h2>
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
        <label className="label" htmlFor="f-plan">
          {t('plan')}
        </label>
        <select
          id="f-plan"
          className="input"
          value={planCd}
          disabled={planLocked}
          onChange={(e) => setPlanCd(e.target.value)}
        >
          {APPLY_PLAN_CD.map((p) => {
            const f = fees?.[p]
            const { term, discount } = feeLabel(f)
            return (
              <option key={p} value={p}>
                {tp(p)}
                {f
                  ? ` — ${term} · ${f.pi_amt} Pi${discount ? ` (${discount})` : ''}`
                  : ''}
              </option>
            )
          })}
        </select>
        <p className="text-muted-foreground mt-1 text-xs">
          {planLocked ? t('planLocked') : t('planHint')}
        </p>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={spk}
            disabled={spkPaid}
            onChange={(e) => setSpk(e.target.checked)}
          />
          ✨ {t('spk')}
          {fees?.[planCd]?.spk != null ? ` (+${fees[planCd].spk} Pi)` : ''}
        </label>
        <p className="text-muted-foreground mt-1 text-xs">
          {spkPaid ? t('spkPaid') : t('spkHint')}
        </p>
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

      <LogoField
        value={imgUrl}
        onChange={setImgUrl}
        onError={setError}
        onBusy={setBusy}
        disabled={busy}
      />

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

      <div>
        <label className="label" htmlFor="f-mv">
          {t('mvUrl')}
        </label>
        <input
          id="f-mv"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={1000}
          value={mvUrl}
          disabled={inUse}
          onChange={(e) => setMvUrl(e.target.value)}
        />
        <p className="text-muted-foreground mt-1 text-xs">{t('mvHint')}</p>
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
          {inUse ? t('save') : t('submit')}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

'use client'

// 등록 심사비 결제 페이지 본문 — 클라이언트 게이트(LoginGate) 뒤에서 piFetch 로 내 사이트 단건 조회,
//  요약(도메인·이름·요금제·금액) + SitePayButton. 결제 완료·불필요·불가 상태는 안내만. 서버 redirect 없음(Pi Browser 무한 루프 금지)
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { LoginGate } from './login-gate'
import { SitePayButton } from './site-pay-button'
import {
  readApi,
  useApiErrorText,
  useRegFees,
  type ApiErrorBody,
} from '@/lib/client-api'
import { PAYABLE_STS, type OwnerSite } from '@/lib/site'

export function PayPanel({ siteId }: { siteId: string }) {
  return <LoginGate>{() => <PayPanelInner siteId={siteId} />}</LoginGate>
}

function PayPanelInner({ siteId }: { siteId: string }) {
  const t = useTranslations('pay')
  const tp = useTranslations('plan')
  const ts = useTranslations('siteSts')
  const errText = useApiErrorText()
  const fees = useRegFees()
  const [site, setSite] = useState<OwnerSite | null>(null)
  const [error, setError] = useState<ApiErrorBody | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const r = await readApi<{ site: OwnerSite }>(
      piFetch(`/api/me/sites/${siteId}`),
    )
    if (r.ok) setSite(r.data.site)
    else setError(r.body)
  }, [siteId])

  useEffect(() => {
    void load()
  }, [load])

  if (error)
    return (
      <p className="text-destructive text-sm" role="alert">
        {errText(error)}
      </p>
    )
  if (!site)
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  const amount = fees?.[site.plan_cd] ?? null
  const payable = (PAYABLE_STS as readonly string[]).includes(site.site_sts_cd)
  // 요금표에 해당 요금제가 있고 단가 0 일 때만 "불필요" — 조회 중·조회 실패는 금액 미상으로 두고 버튼 유지(서버 prepare 가 최종 판정)
  const notRequired =
    site.own_site_yn === 'Y' || (amount != null && !(amount > 0))

  return (
    <div className="flex flex-col gap-4">
      <dl className="card grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('domain')}</dt>
        <dd className="font-mono">{site.site_dom_nm}</dd>
        <dt className="text-muted-foreground">{t('name')}</dt>
        <dd>{site.site_nm}</dd>
        <dt className="text-muted-foreground">{t('status')}</dt>
        <dd>{ts(site.site_sts_cd)}</dd>
        <dt className="text-muted-foreground">{t('plan')}</dt>
        <dd>{tp(site.plan_cd)}</dd>
        <dt className="text-muted-foreground">{t('amount')}</dt>
        <dd className="text-lg font-semibold">
          {amount == null ? '…' : `${amount} Pi`}
        </dd>
      </dl>

      {site.pymnt_id ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
          {t('alreadyPaid', { at: site.pay_dtm ?? '' })}
        </p>
      ) : notRequired ? (
        <p className="text-muted-foreground text-sm">{t('notRequired')}</p>
      ) : !payable ? (
        <p className="text-muted-foreground text-sm">{t('notPayable')}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('intro')}</p>
          <SitePayButton site={site} amount={amount} onPaid={() => void load()} />
        </>
      )}

      <Link className="btn w-fit" href="/me">
        {t('backToMe')}
      </Link>
    </div>
  )
}

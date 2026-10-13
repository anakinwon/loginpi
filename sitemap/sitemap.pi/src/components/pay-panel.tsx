'use client'

// 사용료 결제 페이지 본문 — 클라이언트 게이트(LoginGate) 뒤에서 piFetch 로 내 사이트 단건 조회,
//  요약(도메인·이름·요금제·금액) + SitePayButton. 결제 완료·불필요·불가 상태는 안내만. 서버 redirect 없음(Pi Browser 무한 루프 금지)
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { LoginGate } from './login-gate'
import { EFCT_ICON } from './bubble-canvas'
import { SitePayButton } from './site-pay-button'
import {
  readApi,
  useApiErrorText,
  useFeeLabel,
  useRegFees,
  type ApiErrorBody,
} from '@/lib/client-api'
import { PAYABLE_STS, SPK_PAYABLE_STS, type OwnerSite } from '@/lib/site'

export type PayKind = 'REG' | 'SPK' | 'EFCT' // 사용료(부가서비스 합산 포함) / 반짝임 단독 / 이펙트 단독

export function PayPanel({ siteId, kind }: { siteId: string; kind: PayKind }) {
  return (
    <LoginGate>{() => <PayPanelInner siteId={siteId} kind={kind} />}</LoginGate>
  )
}

function PayPanelInner({ siteId, kind }: { siteId: string; kind: PayKind }) {
  const t = useTranslations('pay')
  const tp = useTranslations('plan')
  const ts = useTranslations('siteSts')
  const te = useTranslations('efct')
  const errText = useApiErrorText()
  const fees = useRegFees()
  const feeLabel = useFeeLabel()
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

  const fee = fees?.[site.plan_cd]
  const spkFee = fee?.spk ?? null
  // 합산 : 신청에 반짝임이 켜져 있고 미결제면 사용료에 더한다(요금제에 반짝임 단가가 없으면 제외 — 서버와 같은 규칙)
  const spkAdd =
    kind === 'REG' && site.spk_yn === 'Y' && !site.spk_pymnt_id ? spkFee : null
  const efctFee = fee?.efct ?? null
  const efctAdd =
    kind === 'REG' && site.efct_cd && !site.efct_pymnt_id ? efctFee : null
  const amount =
    kind === 'SPK'
      ? spkFee
      : kind === 'EFCT'
        ? efctFee
        : fee?.pi_amt == null
          ? null
          : fee.pi_amt + (spkAdd ?? 0) + (efctAdd ?? 0)
  const { term, discount } = feeLabel(fee)
  const paid =
    kind === 'SPK'
      ? !!site.spk_pymnt_id
      : kind === 'EFCT'
        ? !!site.efct_pymnt_id
        : !!site.pymnt_id
  const addonPayable =
    (SPK_PAYABLE_STS as readonly string[]).includes(site.site_sts_cd) &&
    (site.site_sts_cd !== 'APPLYING' || !!site.pymnt_id)
  const payable =
    kind === 'SPK'
      ? addonPayable && site.spk_yn === 'Y'
      : kind === 'EFCT'
        ? addonPayable && !!site.efct_cd
        : (PAYABLE_STS as readonly string[]).includes(site.site_sts_cd)
  // 요금표에 해당 요금제가 있고 단가 0 일 때만 "불필요" — 조회 중·조회 실패는 금액 미상으로 두고 버튼 유지(서버 prepare 가 최종 판정)
  const notRequired =
    site.own_site_yn === 'Y' ||
    (amount != null && !(amount > 0)) ||
    (kind === 'SPK' && fees != null && spkFee == null) ||
    (kind === 'EFCT' && fees != null && efctFee == null)

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
        <dd>
          {tp(site.plan_cd)}
          {site.spk_yn === 'Y' ? '++' : ''}
          {term ? ` · ${term}` : ''}
        </dd>
        {(kind === 'SPK' || spkAdd != null) && (
          <>
            <dt className="text-muted-foreground">{t('spk')}</dt>
            <dd>✨ {spkFee == null ? '…' : `${spkFee} Pi`}</dd>
          </>
        )}
        {(kind === 'EFCT' || efctAdd != null) && site.efct_cd && (
          <>
            <dt className="text-muted-foreground">{t('efct')}</dt>
            <dd>
              {EFCT_ICON[site.efct_cd]} {te(site.efct_cd)}{' '}
              {efctFee == null ? '…' : `${efctFee} Pi`}
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('amount')}</dt>
        <dd className="text-lg font-semibold">
          {amount == null ? '…' : `${amount} Pi`}
          {kind === 'REG' && discount && (
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              {discount}
            </span>
          )}
        </dd>
      </dl>

      {paid ? (
        <p className="rounded bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
          {kind === 'SPK'
            ? t('spkAlreadyPaid')
            : kind === 'EFCT'
              ? t('efctAlreadyPaid')
              : t('alreadyPaid', { at: site.pay_dtm ?? '' })}
        </p>
      ) : notRequired ? (
        <p className="text-muted-foreground text-sm">{t('notRequired')}</p>
      ) : !payable ? (
        <p className="text-muted-foreground text-sm">{t('notPayable')}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('intro')}</p>
          <SitePayButton
            site={site}
            kind={kind}
            amount={amount}
            onPaid={() => void load()}
          />
        </>
      )}

      <Link className="btn w-fit" href="/me">
        {t('backToMe')}
      </Link>
    </div>
  )
}

// 빈 자리 안내 — 메인 버블의 가상 샘플(비어 있는 광고 자리)을 누르면 오는 화면. /slot?plan=<PLAN_CD>
//  요금제 콤보(남은 슬롯이 있는 요금제만)와 "등록 → Pi 결제 → 자동 사용 시작 → 사용 기간 동안 노출" 순서를 안내한 뒤 /my 등록으로 보낸다.
//  가격·통화는 표기하지 않는다(유료 노출 판매는 PRD §9 #2 회신 전 — 어휘·가격 레드라인 A-5). 서버는 세션을 보지 않는다(redirect 금지)
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { PlanSelect } from '@/components/plan-select'
import { getPlanRemaining } from '@/lib/payments'
import { APPLY_PLAN_CD, type ApplyPlanCd } from '@/lib/site'

// 남은 슬롯 조회 실패(DB 미설정 등)엔 수량 없이 5종 전부 노출 — 안내 화면이 비지 않게
async function loadPlans() {
  try {
    const r = await getPlanRemaining()
    return APPLY_PLAN_CD.filter((p) => r[p] > 0).map((cd) => ({
      cd,
      remaining: r[cd] as number | null,
    }))
  } catch (e) {
    console.error('[ad] plan remaining', e)
    return APPLY_PLAN_CD.map((cd) => ({ cd, remaining: null }))
  }
}

export default async function AdPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ plan?: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const { plan: raw } = await searchParams
  const plans = await loadPlans()
  // 쿼리 문자열은 신뢰하지 않는다 — 노출 가능한 요금제가 아니면 첫 요금제(가장 큰 자리)로
  const plan: ApplyPlanCd | null = plans.some((p) => p.cd === raw)
    ? (raw as ApplyPlanCd)
    : (plans[0]?.cd ?? null)
  const t = await getTranslations('ad')

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p>{t('lead')}</p>
      {plan ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-muted-foreground" htmlFor="ad-plan">
            {t('planLabel')}
          </label>
          <PlanSelect plans={plans} value={plan} />
          <span className="text-muted-foreground text-xs">{t('planHint')}</span>
        </div>
      ) : (
        <p className="text-sm">{t('full')}</p>
      )}
      <ol className="card flex flex-col gap-2 text-sm">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li className="text-muted-foreground">{t('step3')}</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        {plan && (
          <Link href="/my" className="btn btn-primary">
            {t('cta')}
          </Link>
        )}
        <Link href="/" className="btn">
          {t('back')}
        </Link>
      </div>
    </div>
  )
}

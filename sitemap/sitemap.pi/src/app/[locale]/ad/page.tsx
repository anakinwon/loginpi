// 빈 자리 안내 — 메인 버블의 가상 샘플(비어 있는 광고 자리)을 누르면 오는 화면. /ad?plan=<PLAN_CD>
//  샘플 자리의 요금제 이름을 보여주고 "사이트 등록(무료) → 심사 → 유료 노출(준비 중)" 순서로 안내한 뒤 /me 등록으로 보낸다.
//  가격·통화는 표기하지 않는다(유료 노출 판매는 PRD §9 #2 회신 전 — 어휘·가격 레드라인 A-5). 서버는 세션을 보지 않는다(redirect 금지)
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { PLAN_CD, type PlanCd } from '@/lib/site'

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
  // 허용 코드 외 값은 무시(무료 NONE 으로 표시) — 쿼리 문자열은 신뢰하지 않는다
  const plan: PlanCd = PLAN_CD.includes(raw as PlanCd)
    ? (raw as PlanCd)
    : 'NONE'
  const t = await getTranslations('ad')
  const tp = await getTranslations('plan')

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p>{t('lead')}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">{t('planLabel')}</span> ·{' '}
        <strong>{tp(plan)}</strong>
      </p>
      <ol className="card flex flex-col gap-2 text-sm">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li className="text-muted-foreground">{t('step3')}</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Link href="/me" className="btn btn-primary">
          {t('cta')}
        </Link>
        <Link href="/" className="btn">
          {t('back')}
        </Link>
      </div>
    </div>
  )
}

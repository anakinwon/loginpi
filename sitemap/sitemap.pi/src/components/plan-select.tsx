'use client'
// 빈 버블 안내(/ad) 요금제 콤보 — 남은 슬롯이 있는 요금제만 받아 표시, 바꾸면 /ad?plan= 으로 교체 이동(서버가 다시 그린다)
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import type { ApplyPlanCd } from '@/lib/site'

export function PlanSelect({
  plans,
  value,
}: {
  plans: { cd: ApplyPlanCd; remaining: number | null }[]
  value: ApplyPlanCd
}) {
  const t = useTranslations('ad')
  const tp = useTranslations('plan')
  const router = useRouter()
  return (
    <select
      id="ad-plan"
      className="input w-auto"
      value={value}
      onChange={(e) => router.replace(`/ad?plan=${e.target.value}`)}
    >
      {plans.map((p) => (
        <option key={p.cd} value={p.cd}>
          {tp(p.cd)}
          {p.remaining == null
            ? ''
            : ` (${t('remaining', { n: p.remaining })})`}
        </option>
      ))}
    </select>
  )
}

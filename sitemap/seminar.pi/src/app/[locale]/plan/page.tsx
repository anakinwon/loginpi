// 개최자 요금제(/plan) — 무료 월 1시간·월간·연간 이용권, 결제는 Pi(시세 환산 견적). 비로그인도 가격표 공개(redirect 없음)
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { PlanBoard } from '@/components/plan/plan-board'

export default function PlanPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('plan')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <PlanBoard />
    </div>
  )
}

// 연결 요금제 — /plan : 현재 요금제·남은 기간·AI 남은 횟수, 요금표(FREE·D1·D2·D3), 업그레이드·결제(Pi). 서버는 세션을 보지 않는다(redirect 금지) — 로그인·연결 선택은 클라이언트 PlanBoard
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PlanBoard } from '@/components/plan/plan-board'

export default async function PlanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('plan')
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      <PlanBoard />
    </div>
  )
}

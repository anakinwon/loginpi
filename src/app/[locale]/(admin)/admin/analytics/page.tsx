import { getTranslations } from 'next-intl/server'
import { AnalyticsHub } from '@/components/admin/analytics/analytics-hub'

export async function generateMetadata() {
  const t = await getTranslations('adminAnalytics')
  return { title: `${t('pageTitle')} — Admin` }
}

// 통합 분석 페이지 (Phase 22) — 매출·주문·접속/사용·퍼포먼스 4탭 허브
export default async function AnalyticsPage() {
  const t = await getTranslations('adminAnalytics')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('pageTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('pageSubtitle')}</p>
      </div>
      <AnalyticsHub />
    </div>
  )
}

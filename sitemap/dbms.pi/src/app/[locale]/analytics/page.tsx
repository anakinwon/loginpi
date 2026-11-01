// dbms.pi 분석·레이크(PRD 12절 8) — 서버는 locale 만 설정, 조회·로그인은 클라이언트(AnalyticsView, redirect 금지)
import { setRequestLocale } from 'next-intl/server'
import { Suspense, use } from 'react'
import { AnalyticsView } from '@/components/analytics/analytics-view'

export default function AnalyticsPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  // useSearchParams(?link=) 사용 — Suspense 경계 필요
  return (
    <Suspense>
      <AnalyticsView />
    </Suspense>
  )
}

import { AnalyticsHub } from '@/components/admin/analytics/analytics-hub'

export async function generateMetadata() {
  return { title: '통합 분석 — Admin' }
}

// 통합 분석 페이지 (Phase 22) — 매출·주문·접속/사용·퍼포먼스 4탭 허브
export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📊 통합 분석</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          매출·주문·접속/사용·퍼포먼스를 한곳에서. 활성 사용자(북극성) 최우선.
        </p>
      </div>
      <AnalyticsHub />
    </div>
  )
}

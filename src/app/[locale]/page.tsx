import { StatsDashboard } from '@/components/admin/stats/stats-dashboard'
import { AccountIntegrationSection } from '@/components/account-integration-section'

export const metadata = { title: '통계 대시보드' }

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">통계 대시보드</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          활성 사용자 · 매출 통계 (일별 집계 기반)
        </p>
      </div>
      <StatsDashboard />
      <AccountIntegrationSection />
    </div>
  )
}

import { getTranslations } from 'next-intl/server'
import { MonitorDashboard } from '@/components/admin/monitor/monitor-dashboard'

export async function generateMetadata() {
  const t = await getTranslations('adminOps')
  return { title: t('monitor.metaTitle') }
}

// 실시간 시스템 모니터링 (PRD_22_MONITOR) — 관리자 전용.
// 권한·클라이언트 게이트는 (admin)/layout.tsx가 처리하므로 페이지는 대시보드만 렌더.
export default async function MonitorPage() {
  const t = await getTranslations('adminOps')
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">{t('monitor.pageTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('monitor.pageDesc')}</p>
      </div>
      <MonitorDashboard />
    </div>
  )
}

import { MonitorDashboard } from '@/components/admin/monitor/monitor-dashboard'

export const metadata = { title: '실시간 모니터링' }

// 실시간 시스템 모니터링 (PRD_22_MONITOR) — 관리자 전용.
// 권한·클라이언트 게이트는 (admin)/layout.tsx가 처리하므로 페이지는 대시보드만 렌더.
export default function MonitorPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">📡 실시간 시스템 모니터링</h1>
        <p className="text-muted-foreground text-sm">
          시스템 헬스·Pi 결제·주문·트래픽을 실시간 점검 (5초 자동 갱신)
        </p>
      </div>
      <MonitorDashboard />
    </div>
  )
}

import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/lib/auth-check'
import { AdminDashboardStats } from '@/components/admin/admin-dashboard-stats'

// 관리자 대시보드 — 통계 카드는 클라이언트 fetch(AdminDashboardStats)로 전환
// ① SSR 4쿼리 제거 → 페이지 골격 즉시 표시 ② Pi Browser(쿠키 없음)에서 0 표시되던 버그 해결
export default async function AdminDashboard() {
  const [user, t] = await Promise.all([
    getSessionUser(),
    getTranslations('admin.dashboard'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('greeting', {
            name: user?.display_name ?? '',
            role: user?.role ?? '',
          })}
        </p>
      </div>

      <AdminDashboardStats />
    </div>
  )
}

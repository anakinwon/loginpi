'use client'

import { useTranslations } from 'next-intl'
import { usePiAuth } from '@/components/pi-auth-provider'
import { StatsDashboard } from '@/components/admin/stats/stats-dashboard'

// 홈 공개 대시보드 — 메인넷 심사 절제 원칙(2026-07-17 마스터):
//   공개(게스트·일반 사용자) = '유리 지표'인 커뮤니티 활성(활성 사용자) 섹션만(scope=public).
//   관리자(ADMIN/MASTER) 세션이면 매출·통합분석까지 조건부 개방(scope=full).
// 권한 판별은 표시 게이팅일 뿐 — 데이터 보호는 stats API의 서버 마스킹·게이트가 정본이라
// 클라이언트 role 위조로 얻을 수 있는 것은 이미 공개된 집계뿐이다.
export function HomeStats() {
  const t = useTranslations('adminStats')
  const { user } = usePiAuth()
  const isAdminViewer = user?.role === 'ADMIN' || user?.role === 'MASTER'

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{t('homeTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isAdminViewer ? t('subtitle') : t('publicSubtitle')}
        </p>
      </div>

      <StatsDashboard scope={isAdminViewer ? 'full' : 'public'} />
    </>
  )
}

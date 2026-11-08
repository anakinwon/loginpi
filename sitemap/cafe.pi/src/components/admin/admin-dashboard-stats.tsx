'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { readCache, writeCache } from '@/lib/client-cache'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// 관리자 대시보드 사용자 연동 통계 — 클라이언트 fetch (SSR 4쿼리 제거 → 페이지 즉시 표시)
// piFetch 이중 경로(쿠키 + X-Pi-Token)로 Pi Browser에서 통계가 0으로 표시되던 문제 해결
// localStorage SWR: 재방문 시 캐시 즉시 표시 후 백그라운드 갱신

interface DashboardStats {
  total: number
  piOnly: number
  googleOnly: number
  linked: number
}

const CACHE_KEY = 'admin_dashboard_stats'
const CACHE_MAX_AGE_MS = 5 * 60_000

export function AdminDashboardStats() {
  const t = useTranslations('admin.dashboard')
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    let cancelled = false

    // 1) 캐시 즉시 표시 (SWR)
    const cached = readCache<DashboardStats>(CACHE_KEY, CACHE_MAX_AGE_MS)
    if (cached) setStats(cached)

    // 2) 백그라운드 재검증
    void (async () => {
      const res = await piFetch('/api/admin/dashboard').catch(() => null)
      if (cancelled || !res?.ok) return
      const data = (await res.json()) as DashboardStats
      if (cancelled) return
      setStats(data)
      writeCache(CACHE_KEY, data)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const cards = [
    { label: t('totalUsers'), value: stats?.total, desc: t('totalUsersDesc') },
    { label: t('piOnly'), value: stats?.piOnly, desc: t('piOnlyDesc') },
    {
      label: t('googleOnly'),
      value: stats?.googleOnly,
      desc: t('googleOnlyDesc'),
    },
    { label: t('linked'), value: stats?.linked, desc: t('linkedDesc') },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ label, value, desc }) => (
        <Card key={label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {value == null ? (
              <div className="bg-muted h-9 w-16 animate-pulse rounded" />
            ) : (
              <p className="text-3xl font-bold">{value}</p>
            )}
            <p className="text-muted-foreground mt-1 text-xs">{desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

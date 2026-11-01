// dbms.pi 모니터링 센터(PRD 12절 4) — 서버는 locale 만 설정, 조회·로그인은 클라이언트(MonitorView, redirect 금지)
import { setRequestLocale } from 'next-intl/server'
import { Suspense, use } from 'react'
import { MonitorView } from '@/components/monitor/monitor-view'

export default function MonitorPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  // useSearchParams(?link=) 사용 — Suspense 경계 필요
  return (
    <Suspense>
      <MonitorView />
    </Suspense>
  )
}

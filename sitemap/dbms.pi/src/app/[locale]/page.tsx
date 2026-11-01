// dbms.pi 첫 화면 = 모니터링 관문(마스터 지시 2026-11-02 "첫페이지는 모니터링으로") — redirect 없이 같은 보드를 그대로 그린다(Pi Browser 루프 방지)
//  위 = Google 연동 전 Pi 사용자에게만 6자리 연동 코드 안내(HomeLinkPrompt, 로그인 전·연동 후엔 아무것도 안 그림), 아래 = MonitorView(자체 로그인 게이트)
import { setRequestLocale } from 'next-intl/server'
import { Suspense, use } from 'react'
import { HomeLinkPrompt } from '@/components/home-gate'
import { MonitorView } from '@/components/monitor/monitor-view'

export default function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  setRequestLocale(use(params).locale)
  // MonitorView 가 useSearchParams(?link=) 사용 — Suspense 경계 필요
  return (
    <div className="flex w-full flex-col gap-4">
      <HomeLinkPrompt />
      <Suspense>
        <MonitorView />
      </Suspense>
    </div>
  )
}

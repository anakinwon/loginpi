// 분류체계 화면 공통 레이아웃 — 로그인 게이트(미로그인은 서버 redirect 대신 클라이언트에서 로그인 유도) + 상단 헤더(SiteHeader — 우상단 언어 콤보·π 시세칩, 로그인 전에도 표시) + 하단 고정 메뉴
//  틀(#area-scroll) = 상단 헤더 아래(--area-head-h)부터 화면 맨 아래까지 꽉, 내용은 틀 안에서 스크롤 — 모든 화면 100%(마스터 지시 2026-10-18)
//  하단 메뉴 = 본문 위에 뜨는 플로팅(마스터 2026-11-12) → 틀 아래 여백 = 메뉴 높이(--area-nav-h, 메뉴가 실제 높이를 알림) : 본문은 메뉴 뒤로 지나가고 끝 내용만 메뉴 위로 올라옴
import LoginGate from '../../login-gate'
import { SiteHeader } from '@/components/site-header'
import AreaNav from './area-nav'

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <LoginGate>
        <div id="area-scroll" className="fixed inset-x-0 overflow-auto overscroll-contain" style={{ top: 'var(--area-head-h, 3rem)', bottom: 0, paddingBottom: 'var(--area-nav-h, 7rem)' }}>
          {children}
        </div>
        <AreaNav />
      </LoginGate>
    </>
  )
}

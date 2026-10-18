// 분류체계 화면 공통 레이아웃 — 로그인 게이트(미로그인은 서버 redirect 대신 클라이언트에서 로그인 유도) + 하단 고정 메뉴
//  틀(#area-scroll) = 화면 위 끝부터 하단 메뉴 바로 위(--area-nav-h, 메뉴가 실제 높이를 알림)까지 꽉, 내용은 틀 안에서 스크롤 — 모든 화면 100%(마스터 지시 2026-10-18)
import LoginGate from '../../login-gate'
import AreaNav from './area-nav'

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <LoginGate>
      <div id="area-scroll" className="fixed inset-x-0 top-0 overflow-auto overscroll-contain" style={{ bottom: 'var(--area-nav-h, 7rem)' }}>
        {children}
      </div>
      <AreaNav />
    </LoginGate>
  )
}

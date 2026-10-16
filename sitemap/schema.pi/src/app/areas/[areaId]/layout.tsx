// 분류체계 화면 공통 레이아웃 — 로그인 게이트(미로그인은 서버 redirect 대신 클라이언트에서 로그인 유도) + 하단 고정 메뉴
//  pb-28 : 고정 메뉴(서브 탭 포함) 높이만큼 본문 하단 여백(마지막 행이 메뉴에 가리지 않게)
import LoginGate from '../../login-gate'
import AreaNav from './area-nav'

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <LoginGate>
      <div className="pb-28">{children}</div>
      <AreaNav />
    </LoginGate>
  )
}

// 분류체계 화면 공통 레이아웃 — 로그인 게이트(미로그인은 서버 redirect 대신 클라이언트에서 로그인 유도)
import LoginGate from '../../login-gate'

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return <LoginGate>{children}</LoginGate>
}

// schema.pi 첫 화면 — 로그인 게이트 뒤에 내 분류체계 목록·선택, 새 분류체계 생성
import AreaHome from './area-home'
import DevUserSwitch from './dev-user-switch'
import LoginGate, { AuthStatus } from './login-gate'

export default function Home() {
  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">schema.pi</h1>
          <p className="mt-1 text-sm text-gray-600">데이터 표준사전 메타시스템</p>
        </div>
        <AuthStatus />
      </div>
      <DevUserSwitch />
      <LoginGate>
        <AreaHome />
      </LoginGate>
    </main>
  )
}

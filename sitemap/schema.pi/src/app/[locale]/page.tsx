// schema.pi 첫 화면 — 로그인 전 : 소개·흐름·역할·요금제(Intro) + 로그인(LoginGate) / 로그인 후 : 마지막 선택 분류체계 대시보드(Dashboard, 2026-10-21)
import Dashboard from './dashboard'
import DevUserSwitch from './dev-user-switch'
import Intro from './intro'
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
      {/* 로그인 상자를 소개보다 위에 — 모바일(Pi Browser)에서 스크롤 없이 바로 로그인 */}
      <LoginGate>
        <Dashboard />
      </LoginGate>
      <Intro />
    </main>
  )
}

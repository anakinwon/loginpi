// schema.pi 첫 화면 — 내 분류체계 목록·선택, 새 분류체계 생성
import AreaHome from './area-home'
import DevUserSwitch from './dev-user-switch'

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold">schema.pi</h1>
      <p className="mt-1 text-sm text-gray-600">데이터 표준사전 메타시스템</p>
      <DevUserSwitch />
      <AreaHome />
    </main>
  )
}

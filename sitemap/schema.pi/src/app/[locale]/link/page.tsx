// 계정 연동 — /link. Pi Browser(Pi 세션)는 연동 코드 발급, 일반 브라우저(Google 세션·미연동)는 코드 입력, 연동 완료면 상태 표시.
// 서버는 세션을 보지 않는다(redirect 금지) — 분기는 클라이언트 LinkPanel(useAppUser)
import Link from 'next/link'
import { LinkPanel } from '../google-auth'

export default function LinkPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold">계정 연동</h1>
      <p className="text-sm text-gray-600">
        Pi Browser 의 Pi 계정과 일반 브라우저의 Google 계정을 같은 사용자로 연결합니다. 연동 뒤에는 PC 에서 Google 로그인만으로 작업할 수 있습니다.
      </p>
      <LinkPanel />
      <Link href="/" className="text-sm underline">
        ← 홈
      </Link>
    </main>
  )
}

'use client'
// 클라이언트 로그인 게이트 — 서버는 redirect 하지 않고(Pi Browser 무한 루프 방지) 여기서 로그인 유도.
// 철칙 : UA 로 Pi Browser 를 판정하지 않는다. window.Pi.authenticate() 성공(provider 의 user)만 신뢰
import { usePiAuth } from '@pi/auth/client'

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, signIn, error } = usePiAuth()
  if (user) return <>{children}</>
  if (isLoading) return <p className="text-sm text-gray-600">로그인 확인 중…</p>
  return (
    <div className="mt-6 flex flex-col items-start gap-2 rounded border border-gray-200 p-4">
      <p className="text-sm">로그인이 필요합니다. Pi Browser 에서 열어 Pi 계정으로 로그인하십시오.</p>
      <button type="button" className="rounded bg-black px-3 py-1.5 text-sm text-white" onClick={() => void signIn()}>
        Pi 계정으로 로그인
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// 헤더 표시용 — 로그인 사용자명·로그아웃
export function AuthStatus() {
  const { user, signOut } = usePiAuth()
  if (!user) return null
  return (
    <span className="flex items-center gap-2 text-sm text-gray-600">
      {user.username ?? user.displayName}
      <button type="button" className="underline" onClick={() => void signOut()}>
        로그아웃
      </button>
    </span>
  )
}

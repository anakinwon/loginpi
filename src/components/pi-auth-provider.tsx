'use client'

import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PiSessionUser } from '@/types/pi-session'

export type { PiSessionUser }

interface PiAuthContextValue {
  user: PiSessionUser | null
  piAccessToken: string | null
  isLoading: boolean
  isInPiBrowser: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  devLogin: () => Promise<void>
  error: string | null
}

const PiAuthContext = createContext<PiAuthContextValue | null>(null)

// 오픈 리다이렉트 방지: 같은 origin의 상대 경로만 허용
// '//' 로 시작하면 프로토콜 상대 URL (//evil.com), '/\' 로 시작하면 스킴 우회 시도
function isSafeNext(next: string | null): next is string {
  return !!next && /^\/(?!\/)/.test(next) && !next.startsWith('/\\')
}

function detectSandbox(): boolean {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  }
  return process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'
}

async function onIncompletePayment(payment: PaymentDTO) {
  try {
    if (!payment.status.developer_approved) {
      await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.identifier }),
      })
    } else if (!payment.status.developer_completed && payment.transaction?.txid) {
      await fetch('/api/payments/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.identifier, txid: payment.transaction.txid }),
      })
    }
  } catch {
    console.error('미완료 결제 복구 실패:', payment.identifier)
  }
}

// useSearchParams는 Suspense 경계 안에서만 안전하게 사용 가능.
// 이 컴포넌트는 UI 없이 next 파라미터 변경만 감지해 signIn을 재트리거.
//
// 문제: Next.js Link 탐색 시 SPA 방식으로 URL만 바뀌고 PiAuthProvider는 언마운트되지 않음.
// 따라서 useEffect([signIn])은 재실행되지 않아 signIn()이 호출되지 않음.
// 해결: useSearchParams()로 searchParams 변화를 React 반응형으로 감지해 signIn 재호출.
function SearchParamsWatcher({ signIn }: { signIn: () => Promise<void> }) {
  const searchParams = useSearchParams()
  // searchParams 객체가 아닌 next 문자열 값을 의존성으로 사용.
  // router.refresh() 후 Next.js가 같은 내용이어도 새 객체를 반환하면
  // [searchParams, signIn] 의존성은 effect를 반복 실행해 signIn 무한 루프 발생.
  const next = searchParams.get('next')

  useEffect(() => {
    if (!isSafeNext(next) || typeof window === 'undefined' || !window.Pi) return
    signIn()
  }, [next, signIn])

  return null
}

export function PiAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  const [piAccessToken, setPiAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // router를 ref로 관리: router.refresh() 후 router 참조가 바뀌어도 signIn 콜백 참조는 안정 유지
  // router가 useCallback 의존성에 있으면 refresh() → 새 router → signIn 재생성 → useEffect 재실행 → 무한루프
  const routerRef = useRef(router)
  useEffect(() => { routerRef.current = router }, [router])

  // 동시 호출 방지: signIn이 실행 중이면 중복 호출 무시
  const isSigningInRef = useRef(false)

  const signIn = useCallback(async () => {
    if (!window.Pi) {
      setIsInPiBrowser(false)
      setIsLoading(false)
      return
    }
    if (isSigningInRef.current) return
    isSigningInRef.current = true
    setIsLoading(true)
    setError(null)
    try {
      await Promise.resolve(
        window.Pi.init({ version: '2.0', sandbox: detectSandbox() })
      )

      // Pi.authenticate()가 일반 브라우저에서 pending 상태로 멈출 수 있으므로 5초 타임아웃
      const auth = await Promise.race([
        window.Pi.authenticate(['username', 'wallet_address', 'payments'], onIncompletePayment),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ])

      setIsInPiBrowser(true)
      setPiAccessToken(auth.accessToken)

      // 기존 세션 쿠키 확인 (이미 로그인된 경우 추가 POST 불필요)
      const checkRes = await fetch('/api/auth/pi', { credentials: 'include' })
      const { user: existing } = (await checkRes.json()) as { user: PiSessionUser | null }
      const rawNext = new URLSearchParams(window.location.search).get('next')
      const next = isSafeNext(rawNext) ? rawNext : null
      if (existing) {
        setUser(existing)
        if (next) {
          // 쿠키 있음 + next 파라미터 → 목적지로 바로 이동 (전체 페이지 이동으로 쿠키 전달 보장)
          window.location.assign(next)
          return
        }
        routerRef.current.refresh()
        return
      }

      // 세션 없음 → next 파라미터 유무로 분기
      if (next) {
        // 보호 페이지에서 리다이렉트된 경우:
        // fetch() Set-Cookie가 WebView에 저장 안 되는 문제를 form POST로 우회
        // top-level navigation의 Set-Cookie는 항상 저장됨
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = '/api/auth/pi-redirect'
        form.style.display = 'none'
        ;([
          ['accessToken', auth.accessToken],
          ['to', next],
        ] as [string, string][]).forEach(([name, value]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = name
          input.value = value
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
        return
        // form.submit() → 페이지 이동, 이후 코드 실행 안 됨
      }

      // 홈 등 직접 접근: 기존 fetch 방식 (React 상태 갱신)
      // 쿠키 미저장 시 보호 페이지 이동 시점에 form POST로 재처리됨
      const res = await fetch('/api/auth/pi', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: auth.accessToken,
          walletAddress: auth.user.wallet_address ?? null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? '서버 인증 실패')
      }
      const data = (await res.json()) as { user: PiSessionUser }
      setUser(data.user)
      routerRef.current.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다'
      if (msg !== 'timeout') setError(msg)
      setIsInPiBrowser(false)
    } finally {
      setIsLoading(false)
      isSigningInRef.current = false
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/pi', { method: 'DELETE', credentials: 'include' })
    setUser(null)
    setPiAccessToken(null)
    routerRef.current.refresh()
  }, [])

  const devLogin = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/dev', { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? '개발 로그인 실패')
      }
      const data = (await res.json()) as { user: PiSessionUser }
      setUser(data.user)
      routerRef.current.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '개발 로그인 실패')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 초기 마운트 시 Pi SDK 인증 (next 파라미터 없는 경우만 — next 있으면 SearchParamsWatcher가 처리)
  useEffect(() => {
    const hasNext = new URLSearchParams(window.location.search).has('next')
    if (typeof window !== 'undefined' && window.Pi && !hasNext) {
      signIn()
    } else if (!window.Pi) {
      // Pi SDK 없음 → 일반 브라우저 확정, 기존 세션만 복원
      setIsInPiBrowser(false)
      fetch('/api/auth/pi', { credentials: 'include' })
        .then((res) => res.json())
        .then((data: { user: PiSessionUser | null }) => {
          if (data.user) setUser(data.user)
        })
        .catch(() => {})
        .finally(() => setIsLoading(false))
    }
    // hasNext && window.Pi 인 경우: SearchParamsWatcher의 effect가 처리
  }, [signIn])

  return (
    <PiAuthContext.Provider
      value={{ user, piAccessToken, isLoading, isInPiBrowser, signIn, signOut, devLogin, error }}
    >
      {/* SearchParamsWatcher: next 파라미터 변경 감지용 (UI 없음, Suspense 필수) */}
      <Suspense fallback={null}>
        <SearchParamsWatcher signIn={signIn} />
      </Suspense>
      {children}
    </PiAuthContext.Provider>
  )
}

export function usePiAuth(): PiAuthContextValue {
  const ctx = useContext(PiAuthContext)
  if (!ctx) {
    throw new Error('usePiAuth는 PiAuthProvider 내부에서 사용해야 합니다')
  }
  return ctx
}

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
import { setPiToken, clearPiToken } from '@/lib/pi-fetch'
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
  updateUser: (patch: Partial<PiSessionUser>) => void
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
    } else if (
      !payment.status.developer_completed &&
      payment.transaction?.txid
    ) {
      await fetch('/api/payments/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payment.identifier,
          txid: payment.transaction.txid,
        }),
      })
    }
  } catch {
    console.error('미완료 결제 복구 실패:', payment.identifier)
  }
}

// useSearchParams는 Suspense 경계 안에서만 안전하게 사용 가능.
// piSdkReady: SDK 로드 완료 전에는 signIn 호출 안 함 (비동기 afterInteractive 로드 대응)
function SearchParamsWatcher({
  signIn,
  piSdkReady,
}: {
  signIn: () => Promise<void>
  piSdkReady: boolean
}) {
  const searchParams = useSearchParams()
  // searchParams 객체가 아닌 next 문자열 값을 의존성으로 사용.
  // router.refresh() 후 Next.js가 새 객체를 반환하면 무한 루프 발생하므로 문자열 추출 필수.
  const next = searchParams.get('next')

  useEffect(() => {
    if (!isSafeNext(next) || !piSdkReady) return
    signIn()
  }, [next, signIn, piSdkReady])

  return null
}

export function PiAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  const [piAccessToken, setPiAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pi SDK 로드 완료 여부.
  // afterInteractive Script의 onLoad → 'pi-sdk-loaded' 이벤트를 수신해 true로 전환.
  // 하이드레이션 시점에 window.Pi가 이미 존재하면 즉시 true (캐시된 SDK).
  const [piSdkReady, setPiSdkReady] = useState(
    () => typeof window !== 'undefined' && !!window.Pi,
  )

  const router = useRouter()

  // router를 ref로 관리: router.refresh() 후 router 참조가 바뀌어도 signIn 콜백 참조는 안정 유지
  // router가 useCallback 의존성에 있으면 refresh() → 새 router → signIn 재생성 → useEffect 재실행 → 무한루프
  const routerRef = useRef(router)
  useEffect(() => {
    routerRef.current = router
  }, [router])

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
        window.Pi.init({ version: '2.0', sandbox: detectSandbox() }),
      )

      // Pi.authenticate()가 일반 브라우저에서 pending 상태로 멈출 수 있으므로 5초 타임아웃
      const auth = await Promise.race([
        window.Pi.authenticate(
          ['username', 'wallet_address', 'payments'],
          onIncompletePayment,
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000),
        ),
      ])

      setIsInPiBrowser(true)
      setPiAccessToken(auth.accessToken)

      // 기존 세션 쿠키 확인 (이미 로그인된 경우 추가 POST 불필요)
      const checkRes = await fetch('/api/auth/pi', { credentials: 'include' })
      const { user: existing } = (await checkRes.json()) as {
        user: PiSessionUser | null
      }
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

      // 세션 없음 → 서버 인증 + 세션 토큰 발급.
      // Pi Browser는 쿠키가 저장되지 않으므로 응답의 token을 localStorage에 보관하고,
      // 이후 모든 인증 요청에 X-Pi-Token 헤더로 전달한다(piFetch).
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
      const data = (await res.json()) as { user: PiSessionUser; token?: string }
      if (data.token) setPiToken(data.token)
      setUser(data.user)

      if (next) {
        // 목적지로 클라이언트 라우팅(풀 리로드 없음 → 무한 루프 불가).
        // 보호 페이지가 쿠키로 신원을 못 찾으면(Pi Browser) 클라이언트 게이트가
        // X-Pi-Token 헤더로 데이터를 로드한다.
        routerRef.current.push(next)
      } else {
        routerRef.current.refresh()
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다'
      if (msg !== 'timeout') setError(msg)
      setIsInPiBrowser(false)
    } finally {
      setIsLoading(false)
      isSigningInRef.current = false
    }
  }, [])

  const updateUser = useCallback((patch: Partial<PiSessionUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/pi', { method: 'DELETE', credentials: 'include' })
    clearPiToken()
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

  // Pi SDK 비동기 로드 감지.
  // locale layout의 afterInteractive Script onLoad → 'pi-sdk-loaded' 이벤트를 여기서 수신.
  // Pi Browser에서 SDK는 캐시되어 있어 거의 즉시 로드됨.
  // 3초 타임아웃: 일반 브라우저나 CDN 접근 불가 환경에서 무한 대기 방지.
  useEffect(() => {
    if (piSdkReady) return

    const onLoad = () => setPiSdkReady(true)
    window.addEventListener('pi-sdk-loaded', onLoad, { once: true })

    const fallback = setTimeout(() => {
      window.removeEventListener('pi-sdk-loaded', onLoad)
      if (!window.Pi) {
        // Pi SDK 미로드 → 일반 브라우저: 기존 세션만 복원
        setIsInPiBrowser(false)
        fetch('/api/auth/pi', { credentials: 'include' })
          .then((r) => r.json())
          .then((data: { user: PiSessionUser | null }) => {
            if (data.user) setUser(data.user)
          })
          .catch(() => {})
          .finally(() => setIsLoading(false))
      }
      // window.Pi 있음: sdk-loaded 이벤트가 이미 setPiSdkReady(true) 실행했을 것이므로 여기까지 안 옴
    }, 3000)

    return () => {
      window.removeEventListener('pi-sdk-loaded', onLoad)
      clearTimeout(fallback)
    }
  }, [piSdkReady])

  // Pi SDK 준비 완료 시 인증 초기화 (next 파라미터 없는 경우만).
  // piSdkReady가 dep에 포함되어야 afterInteractive 로드 후 이 effect가 재실행됨.
  useEffect(() => {
    if (!piSdkReady) return
    const hasNext = new URLSearchParams(window.location.search).has('next')
    if (!hasNext) signIn()
    // hasNext인 경우: SearchParamsWatcher가 piSdkReady dep으로 재실행되어 처리
  }, [signIn, piSdkReady])

  return (
    <PiAuthContext.Provider
      value={{
        user,
        piAccessToken,
        isLoading,
        isInPiBrowser,
        signIn,
        signOut,
        devLogin,
        updateUser,
        error,
      }}
    >
      {/* SearchParamsWatcher: SPA 탐색 시 next 파라미터 변경을 감지해 signIn 재호출 (UI 없음) */}
      <Suspense fallback={null}>
        <SearchParamsWatcher signIn={signIn} piSdkReady={piSdkReady} />
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

'use client'

// @pi/auth/client — Pi 인증 Context Provider. 출처: cafe.pi src/components/pi-auth-provider.tsx
// (cafe 전용 devLogin·로그인 위치 저장·미완료 결제 approve/complete 제외 — 결제 복구는 onIncompletePayment 주입)
// ⚠️ 철칙: signIn 가드는 `if (!window.Pi)`만. UA로 Pi Browser를 판정/사전 차단하지 않는다(2026-06-26 사고).
//    Pi SDK는 일반 브라우저에도 window.Pi를 주입하므로, authenticate() 성공만으로 isInPiBrowser를 판정한다.
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
import { setPiToken, clearPiToken } from './pi-fetch'
import { safeNext } from './safe-next'
import type { PiSessionUser } from './types'
import './pi-sdk'

export type { PiSessionUser }

const AUTH_PATH = '/api/auth/pi'
const SCOPES = ['username', 'wallet_address', 'payments']
const AUTH_TIMEOUT_MS = 20_000 // 무거운 화면 진입 시 authenticate 지연 대비
const SDK_WAIT_MS = 3_000 // SDK 미로드(일반 브라우저·CDN 차단) 무한 대기 방지

interface PiAuthContextValue {
  user: PiSessionUser | null
  piAccessToken: string | null
  isLoading: boolean
  isInPiBrowser: boolean
  // silent=true: 라우터 refresh/이동 없이 재인증만(결제 직전 세션 복구용). 인증된 user 반환
  signIn: (opts?: { silent?: boolean }) => Promise<PiSessionUser | null>
  signOut: () => Promise<void>
  updateUser: (patch: Partial<PiSessionUser>) => void
  error: string | null
}

const PiAuthContext = createContext<PiAuthContextValue | null>(null)

// 오픈 리다이렉트 방지: 같은 origin 경로만(URL 파서 정규화 결과 사용) — safe-next.ts
const safeNextHere = (next: string | null) =>
  safeNext(next, window.location.origin)

function detectSandbox(): boolean {
  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  return process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'
}

// useSearchParams는 Suspense 경계 안에서만 안전. next 문자열을 의존성으로(객체 의존 시 refresh 무한 루프)
function SearchParamsWatcher({
  signIn,
  piSdkReady,
}: {
  signIn: (opts?: { silent?: boolean }) => Promise<PiSessionUser | null>
  piSdkReady: boolean
}) {
  const next = useSearchParams().get('next')
  useEffect(() => {
    if (!safeNextHere(next) || !piSdkReady) return
    void signIn()
  }, [next, signIn, piSdkReady])
  return null
}

export function PiAuthProvider({
  children,
  onIncompletePayment,
}: {
  children: React.ReactNode
  // authenticate 중 발견된 미완료 결제 복구(@pi/payments 도입 시 approve/complete 연결). 기본 no-op
  onIncompletePayment?: (payment: PaymentDTO) => void
}) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  const [piAccessToken, setPiAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 하이드레이션 시점에 SDK가 이미 있으면 즉시 true, 아니면 'pi-sdk-loaded' 이벤트로 전환
  const [piSdkReady, setPiSdkReady] = useState(
    () => typeof window !== 'undefined' && !!window.Pi,
  )

  const router = useRouter()
  // router·콜백을 ref로 — signIn 참조 안정(의존성 변경 → signIn 재생성 → effect 재실행 무한 루프 방지)
  const routerRef = useRef(router)
  const incompleteRef = useRef(onIncompletePayment)
  useEffect(() => {
    routerRef.current = router
    incompleteRef.current = onIncompletePayment
  }, [router, onIncompletePayment])

  const isSigningInRef = useRef(false)

  const signIn = useCallback(
    async (opts?: { silent?: boolean }): Promise<PiSessionUser | null> => {
      // 가드는 window.Pi 존재만 — UA 사전 차단 금지. 성공 여부로만 isInPiBrowser 판정
      if (!window.Pi) {
        setIsInPiBrowser(false)
        setIsLoading(false)
        return null
      }
      if (isSigningInRef.current) return null
      isSigningInRef.current = true
      setIsLoading(true)
      setError(null)
      try {
        await Promise.resolve(
          window.Pi.init({ version: '2.0', sandbox: detectSandbox() }),
        )
        const auth = await Promise.race([
          window.Pi.authenticate(SCOPES, (p) => incompleteRef.current?.(p)),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), AUTH_TIMEOUT_MS),
          ),
        ])

        setIsInPiBrowser(true)
        setPiAccessToken(auth.accessToken)

        // 기존 세션 쿠키 확인(이미 로그인된 경우 POST 불필요)
        const checkRes = await fetch(AUTH_PATH, { credentials: 'include' })
        const { user: existing } = (await checkRes.json()) as {
          user: PiSessionUser | null
        }
        const next = safeNextHere(
          new URLSearchParams(window.location.search).get('next'),
        )
        if (existing) {
          setUser(existing)
          if (!opts?.silent) {
            if (next) {
              window.location.assign(next) // 쿠키 전달 보장 위해 전체 페이지 이동
              return existing
            }
            routerRef.current.refresh()
          }
          return existing
        }

        // 세션 없음 → 서버 인증 + 토큰 발급. Pi Browser는 쿠키 미저장이므로 token을 localStorage에 보관
        const res = await fetch(AUTH_PATH, {
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
        const data = (await res.json()) as {
          user: PiSessionUser
          token?: string
        }
        if (data.token) setPiToken(data.token)
        setUser(data.user)

        if (!opts?.silent) {
          // 클라이언트 라우팅(풀 리로드 없음 → 무한 루프 불가). 보호 페이지는 클라이언트 게이트가 헤더로 로드
          if (next) routerRef.current.push(next)
          else routerRef.current.refresh()
        }
        return data.user
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다'
        if (msg !== 'timeout') setError(msg)
        setIsInPiBrowser(false)
        return null
      } finally {
        setIsLoading(false)
        isSigningInRef.current = false
      }
    },
    [],
  )

  const updateUser = useCallback((patch: Partial<PiSessionUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const signOut = useCallback(async () => {
    await fetch(AUTH_PATH, { method: 'DELETE', credentials: 'include' })
    clearPiToken()
    setUser(null)
    setPiAccessToken(null)
    routerRef.current.refresh()
  }, [])

  // 마운트 즉시 기존 쿠키 세션 복원(window.Pi 유무 무관). 일반 브라우저는 X-Pi-Token 없이 쿠키만 보낸다
  useEffect(() => {
    let cancelled = false
    fetch(AUTH_PATH, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data: { user: PiSessionUser | null }) => {
        if (cancelled) return
        if (data.user) setUser((prev) => prev ?? data.user) // signIn이 먼저 채웠으면 유지
        setIsLoading(false) // user 유무 무관 해제(비로그인+SDK 로드 조합 isLoading 고착 방지)
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Pi SDK 비동기 로드 감지 — PiSdkScript onLoad가 'pi-sdk-loaded' 이벤트를 보낸다
  useEffect(() => {
    if (piSdkReady) return
    const onLoad = () => setPiSdkReady(true)
    window.addEventListener('pi-sdk-loaded', onLoad, { once: true })
    const fallback = setTimeout(() => {
      window.removeEventListener('pi-sdk-loaded', onLoad)
      if (!window.Pi) {
        setIsInPiBrowser(false)
        setIsLoading(false)
      }
    }, SDK_WAIT_MS)
    return () => {
      window.removeEventListener('pi-sdk-loaded', onLoad)
      clearTimeout(fallback)
    }
  }, [piSdkReady])

  // SDK 준비 시 인증 시도(next 파라미터 있으면 SearchParamsWatcher가 처리)
  useEffect(() => {
    if (!piSdkReady) return
    const hasNext = new URLSearchParams(window.location.search).has('next')
    if (!hasNext) void signIn()
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
        updateUser,
        error,
      }}
    >
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

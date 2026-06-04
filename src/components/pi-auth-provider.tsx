'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { PiSessionUser } from '@/types/pi-session'

export type { PiSessionUser }

interface PiAuthContextValue {
  user: PiSessionUser | null
  isLoading: boolean
  isInPiBrowser: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  devLogin: () => Promise<void>
  error: string | null
}

const PiAuthContext = createContext<PiAuthContextValue | null>(null)

function detectPiBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /PiBrowser/i.test(navigator.userAgent)
}

// localhost는 항상 sandbox — 개발 환경에서 Pi.init({ sandbox: false })를 넘기면
// Pi App Studio "Verify My App"이 Pi.authenticate 호출을 감지하지 못함
function detectSandbox(): boolean {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  }
  return process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'
}

export function PiAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    if (!window.Pi) {
      setError('Pi SDK가 로드되지 않았습니다')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      await Promise.resolve(
        window.Pi.init({ version: '2.0', sandbox: detectSandbox() })
      )

      const auth = await window.Pi.authenticate(
        ['username', 'wallet_address'],
        (payment) => {
          console.warn('미완료 Pi 결제 발견:', payment.identifier)
        }
      )

      const res = await fetch('/api/auth/pi', {
        method: 'POST',
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/pi', { method: 'DELETE' })
    setUser(null)
  }, [])

  // 개발 환경 전용: Pi.authenticate 없이 mock admin 세션 생성
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '개발 로그인 실패')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const inPi = detectPiBrowser()
    setIsInPiBrowser(inPi)

    if (inPi) {
      // Pi Browser: 즉시 Pi.authenticate 실행
      // GET 세션 복원을 기다리면 "Verify My App"이 Pi.authenticate 호출을 감지하지 못함
      signIn()
    } else {
      // 일반 브라우저: 서명된 세션 쿠키로 상태 복원만 시도
      fetch('/api/auth/pi')
        .then((res) => res.json())
        .then((data: { user: PiSessionUser | null }) => {
          if (data.user) setUser(data.user)
        })
        .catch(() => {})
    }
  }, [signIn])

  return (
    <PiAuthContext.Provider
      value={{ user, isLoading, isInPiBrowser, signIn, signOut, devLogin, error }}
    >
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

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
  const ua = navigator.userAgent
  // Pi Browser UA 패턴 — 여러 버전/형태 커버
  return (
    /PiBrowser/i.test(ua) ||
    /Pi Network/i.test(ua) ||
    /PiApp/i.test(ua) ||
    /MinePI/i.test(ua)
  )
}

function detectSandbox(): boolean {
  if (typeof window !== 'undefined') {
    const { hostname } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  }
  return process.env.NEXT_PUBLIC_PI_SANDBOX === 'true'
}

export function PiAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  // 초기 true: 클라이언트 초기화 전까지는 "로딩 중"으로 처리 → flash 방지
  const [isLoading, setIsLoading] = useState(true)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    if (!window.Pi) {
      setError('Pi SDK가 로드되지 않았습니다')
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      await Promise.resolve(
        window.Pi.init({ version: '2.0', sandbox: detectSandbox() })
      )

      const auth = await window.Pi.authenticate(
        ['username', 'wallet_address', 'payments'],
        async (payment: PaymentDTO) => {
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
      )

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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/pi', { method: 'DELETE', credentials: 'include' })
    setUser(null)
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
      // Pi Browser: Pi.authenticate 즉시 실행 (signIn 내부에서 isLoading 관리)
      signIn()
    } else {
      // 일반 브라우저: 쿠키 복원 후 isLoading false
      fetch('/api/auth/pi', { credentials: 'include' })
        .then((res) => res.json())
        .then((data: { user: PiSessionUser | null }) => {
          if (data.user) setUser(data.user)
        })
        .catch(() => {})
        .finally(() => setIsLoading(false))
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

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
  // Pi.authenticate()로 받은 accessToken — 쿠키 저장 실패 시 폴백 인증에 사용
  piAccessToken: string | null
  isLoading: boolean
  isInPiBrowser: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  devLogin: () => Promise<void>
  error: string | null
}

const PiAuthContext = createContext<PiAuthContextValue | null>(null)

function detectPiBrowser(): boolean {
  if (typeof window === 'undefined') return false
  // Pi SDK 전역 객체가 있으면 Pi Browser 확실 (UA 패턴보다 신뢰도 높음)
  if ('Pi' in window && window.Pi) return true
  const ua = navigator.userAgent
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
  const [piAccessToken, setPiAccessToken] = useState<string | null>(null)
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

      // accessToken을 state에 저장 — WebView 쿠키 저장 실패 시 폴백 인증에 사용
      setPiAccessToken(auth.accessToken)

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
    setPiAccessToken(null)
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
      signIn()
    } else {
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
      value={{ user, piAccessToken, isLoading, isInPiBrowser, signIn, signOut, devLogin, error }}
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

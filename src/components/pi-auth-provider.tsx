'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
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

export function PiAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PiSessionUser | null>(null)
  const [piAccessToken, setPiAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isInPiBrowser, setIsInPiBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const signIn = useCallback(async () => {
    if (!window.Pi) {
      // Pi SDK 없음 → 확실히 일반 브라우저
      setIsInPiBrowser(false)
      setIsLoading(false)
      return
    }
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

      // 인증 성공 → Pi Browser 확정
      setIsInPiBrowser(true)
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
      // 쿠키 발급 후 서버 컴포넌트(Header) 재실행 → showAdmin 즉시 반영
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Pi 인증 중 오류가 발생했습니다'
      // 타임아웃은 일반 브라우저 판단 — 에러 메시지 표시 안 함
      if (msg !== 'timeout') setError(msg)
      // 인증 실패 → 일반 브라우저로 확정
      setIsInPiBrowser(false)
    } finally {
      setIsLoading(false)
    }
  }, [router])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/pi', { method: 'DELETE', credentials: 'include' })
    setUser(null)
    setPiAccessToken(null)
    // 쿠키 삭제 후 서버 컴포넌트 재실행 → showAdmin 즉시 제거
    router.refresh()
  }, [router])

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
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '개발 로그인 실패')
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.Pi) {
      // Pi SDK가 있음 → signIn() 시도
      // 성공: isInPiBrowser=true / 실패·타임아웃: isInPiBrowser=false
      signIn()
    } else {
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

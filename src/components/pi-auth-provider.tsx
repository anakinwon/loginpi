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
  error: string | null
}

const PiAuthContext = createContext<PiAuthContextValue | null>(null)

function detectPiBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /PiBrowser/i.test(navigator.userAgent)
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
        window.Pi.init({
          version: '2.0',
          sandbox: process.env.NEXT_PUBLIC_PI_SANDBOX === 'true',
        })
      )

      const auth = await window.Pi.authenticate(['username'], (payment) => {
        console.warn('미완료 Pi 결제 발견:', payment.identifier)
      })

      const res = await fetch('/api/auth/pi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: auth.accessToken }),
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

  // 마운트 시 기존 서명된 세션 복원. 세션 없고 Pi Browser이면 자동 인증
  useEffect(() => {
    const inPi = detectPiBrowser()
    setIsInPiBrowser(inPi)

    fetch('/api/auth/pi')
      .then((res) => res.json())
      .then((data: { user: PiSessionUser | null }) => {
        if (data.user) {
          setUser(data.user)
        } else if (inPi) {
          signIn()
        }
      })
      .catch(() => {
        if (inPi) signIn()
      })
  }, [signIn])

  return (
    <PiAuthContext.Provider
      value={{ user, isLoading, isInPiBrowser, signIn, signOut, error }}
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

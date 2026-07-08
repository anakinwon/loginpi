'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { consumePiOAuthState, startPiOAuth } from '@/lib/pi-oauth'
import { env } from '@/env'

// Pi Sign-In(OAuth implicit) 콜백 — accounts.pinet.com 인가 후 도착 지점.
// 토큰은 URL 프래그먼트(#access_token=…)로 오므로 클라이언트에서만 읽을 수 있다(서버 미전달).
// 검증·세션 발급은 기존 /api/auth/pi POST(/v2/me 검증 → HMAC 세션)를 그대로 재사용.
// 일반 브라우저는 쿠키 세션이 동작하지만, 기존 인프라와의 일관성을 위해
// 응답 token을 localStorage(pi_token)에도 저장한다(piFetch X-Pi-Token 경로 공용).
export default function PiOAuthCallbackPage() {
  const t = useTranslations('piOAuth')
  const locale = useLocale()
  const [error, setError] = useState<string | null>(null)
  const nextRef = useRef('/')
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function run() {
      // 1. 프래그먼트 파싱 (# 이후를 쿼리 형식으로)
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const oauthError = frag.get('error')
      const accessToken = frag.get('access_token')
      const state = frag.get('state')

      // 2. CSRF state 검증 — 시작 시 저장한 값과 정확히 일치해야 함 (1회성·10분 만료)
      const pending = consumePiOAuthState()
      if (pending?.next) nextRef.current = pending.next

      if (oauthError) {
        console.warn('[pi-oauth] 인가 서버 오류:', oauthError)
        setError(t('failed'))
        return
      }
      if (!accessToken || !pending || state !== pending.state) {
        // 진단용 상세(사용자 비노출): 토큰/저장 state/에코 state 존재 여부
        console.warn('[pi-oauth] state 검증 실패:', {
          hasToken: !!accessToken,
          hasPending: !!pending,
          stateEchoed: !!state,
        })
        setError(t('stateMismatch'))
        return
      }

      // 3. 서버 검증 + 세션 발급 (기존 Pi 인증 경로 재사용)
      try {
        const res = await fetch('/api/auth/pi', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        })
        const data = (await res.json()) as { token?: string; error?: string }
        if (!res.ok) throw new Error(data.error)
        if (data.token) {
          try {
            localStorage.setItem('pi_token', data.token)
          } catch {
            // 쿠키 세션만으로도 동작 (일반 브라우저)
          }
        }
        // 4. 원래 경로로 복귀 — 전체 리로드로 프로바이더 세션 재초기화
        window.location.replace(nextRef.current)
      } catch {
        setError(t('failed'))
      }
    }
    void run()
  }, [t])

  // 재시도 — 콜백 페이지에서 곧바로 인가 플로우 재시작 (state 재발급)
  function retry() {
    const clientId = env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID
    if (clientId) startPiOAuth(clientId, nextRef.current)
    else window.location.replace(`/${locale}`)
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      {error ? (
        <>
          <p className="text-destructive text-sm font-medium">{error}</p>
          <div className="flex gap-2">
            <button
              onClick={retry}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              {t('retry')}
            </button>
            <a
              href="/"
              className="border-input hover:bg-muted rounded-md border px-4 py-2 text-sm"
            >
              {t('backHome')}
            </a>
          </div>
        </>
      ) : (
        <>
          <span
            className="text-primary animate-pulse font-serif text-3xl italic"
            aria-hidden="true"
          >
            π
          </span>
          <p className="text-muted-foreground text-sm">{t('signingIn')}</p>
        </>
      )}
    </div>
  )
}

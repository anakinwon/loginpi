'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PI_OAUTH_NEXT_KEY, PI_OAUTH_STATE_KEY } from '@/lib/pi-oauth'

// Pi Sign-In(OAuth implicit) 콜백 — accounts.pinet.com 인가 후 도착 지점.
// 토큰은 URL 프래그먼트(#access_token=…)로 오므로 클라이언트에서만 읽을 수 있다(서버 미전달).
// 검증·세션 발급은 기존 /api/auth/pi POST(/v2/me 검증 → HMAC 세션)를 그대로 재사용.
// 일반 브라우저는 쿠키 세션이 동작하지만, 기존 인프라와의 일관성을 위해
// 응답 token을 localStorage(pi_token)에도 저장한다(piFetch X-Pi-Token 경로 공용).
export default function PiOAuthCallbackPage() {
  const t = useTranslations('piOAuth')
  const [error, setError] = useState<string | null>(null)
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

      // 2. CSRF state 검증 — 시작 시 저장한 값과 정확히 일치해야 함
      let savedState: string | null = null
      let nextPath = '/'
      try {
        savedState = sessionStorage.getItem(PI_OAUTH_STATE_KEY)
        nextPath = sessionStorage.getItem(PI_OAUTH_NEXT_KEY) || '/'
        sessionStorage.removeItem(PI_OAUTH_STATE_KEY)
        sessionStorage.removeItem(PI_OAUTH_NEXT_KEY)
      } catch {
        // 접근 불가 시 아래 불일치 처리로 수렴
      }

      if (oauthError) {
        setError(t('failed'))
        return
      }
      if (!accessToken || !savedState || state !== savedState) {
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
        window.location.replace(nextPath)
      } catch {
        setError(t('failed'))
      }
    }
    void run()
  }, [t])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      {error ? (
        <>
          <p className="text-destructive text-sm font-medium">{error}</p>
          <div className="flex gap-2">
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

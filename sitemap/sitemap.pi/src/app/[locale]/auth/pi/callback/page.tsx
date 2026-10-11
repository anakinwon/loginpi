'use client'

// Pi Sign-In(OAuth implicit) 콜백 — accounts.pinet.com 인가 후 도착 지점. cafe.pi 콜백과 같은 절차(@pi/auth/client 헬퍼 공용).
//  토큰은 URL 프래그먼트(#access_token=…)라 클라이언트에서만 읽는다 → 기존 /api/auth/pi POST(/v2/me 검증 → HMAC 세션) 재사용,
//  응답 token 은 localStorage(pi_token)에도 저장(piFetch X-Pi-Token 경로 공용).
//  재마운트 내성: 1회 실행 가드는 모듈 변수, state 는 peek(비소거)로 검증하고 세션 발급 성공 후에만 clear(cafe.pi 2026-07-08 교훈)
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  clearPiOAuthState,
  peekPiOAuthState,
  startPiOAuth,
} from '@pi/auth/client'
import { env } from '@/env'

let oauthHandled = false

export default function PiOAuthCallbackPage() {
  const t = useTranslations('piOAuth')
  const locale = useLocale()
  const [error, setError] = useState<string | null>(null)
  const nextRef = useRef('/')

  useEffect(() => {
    if (oauthHandled) return
    oauthHandled = true

    async function run() {
      const frag = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const oauthError = frag.get('error')
      const accessToken = frag.get('access_token')
      const state = frag.get('state')

      // CSRF state — 시작 시 저장한 값과 정확히 일치(10분 만료)
      const pending = peekPiOAuthState()
      if (pending?.next) nextRef.current = pending.next

      if (oauthError) {
        console.warn('[pi-oauth] 인가 서버 오류:', oauthError)
        oauthHandled = false
        setError(t('failed'))
        return
      }
      if (!accessToken || !pending || state !== pending.state) {
        console.warn('[pi-oauth] state 검증 실패:', {
          hasToken: !!accessToken,
          hasPending: !!pending,
          stateEchoed: !!state,
        })
        oauthHandled = false
        setError(t('stateMismatch'))
        return
      }

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
            // 저장소 차단 — 일반 브라우저는 쿠키 세션만으로 동작
          }
        }
        // 성공 시에만 state 소거 → 원래 경로로 전체 리로드(세션 재초기화)
        clearPiOAuthState()
        window.location.replace(nextRef.current)
      } catch {
        oauthHandled = false
        setError(t('failed'))
      }
    }
    void run()
  }, [t])

  function retry() {
    const clientId = env.NEXT_PUBLIC_PI_OAUTH_CLIENT_ID
    if (clientId) startPiOAuth(clientId, nextRef.current)
    else window.location.replace(`/${locale}`)
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
      {error ? (
        <>
          <p className="text-destructive text-sm font-medium" role="alert">
            {error}
          </p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={retry}>
              {t('retry')}
            </button>
            {/* 풀 리로드 복귀 — 새 세션이 앱 전체에 반영되게 */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn">
              {t('backHome')}
            </a>
          </div>
        </>
      ) : (
        <>
          <span
            className="animate-pulse font-serif text-3xl italic"
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

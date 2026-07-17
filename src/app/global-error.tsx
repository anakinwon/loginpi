'use client'

import { useEffect, useState } from 'react'

// 루트/로케일 레이아웃 자체가 실패한 최후의 경우 — 프로바이더·Tailwind 없이 자체 html/body + 인라인 스타일.
// (정상 런타임 오류는 [locale]/error.tsx가 처리)
//
// 자가 회복: 배포 직후 구버전 클라이언트(stale chunk/RSC 불일치)가 라우터 갱신 시 레이아웃째
// 붕괴하는 사례(2026-07-17 로그아웃 사고)는 전체 새로고침 한 번으로 해소된다.
// sessionStorage 가드로 60초 내 재발 시엔 자동 새로고침을 멈추고 수동 UI를 보여 루프를 방지.
const RELOAD_GUARD_KEY = 'ge_auto_reload_ts'
const RELOAD_GUARD_MS = 60_000

// reset()은 같은 stale 번들로 재렌더할 뿐이라 이 실패 계층에선 무의미 — 전체 새로고침만 제공
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  const [autoReloading, setAutoReloading] = useState(false)

  useEffect(() => {
    console.error('[global error]', error)
    try {
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
      if (Date.now() - last > RELOAD_GUARD_MS) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
        setAutoReloading(true)
        window.location.reload()
      }
    } catch {
      // sessionStorage 불가(프라이버시 모드 등) — 루프 위험이 있어 자동 새로고침 생략
    }
  }, [error])

  return (
    <html lang="ko">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          margin: 0,
          textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
            {autoReloading
              ? '새로고침 중… / Reloading…'
              : '문제가 발생했습니다 / Something went wrong'}
          </h1>
          {!autoReloading && (
            <>
              <p
                style={{
                  color: '#666',
                  marginTop: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.
                <br />
                Something went wrong. Please try again shortly.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #ccc',
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                다시 시도 / Retry
              </button>
            </>
          )}
        </div>
      </body>
    </html>
  )
}

'use client'

// 루트/로케일 레이아웃 자체가 실패한 최후의 경우 — 프로바이더·Tailwind 없이 자체 html/body + 인라인 스타일.
// (정상 런타임 오류는 [locale]/error.tsx가 처리)
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
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
            문제가 발생했습니다 / Something went wrong
          </h1>
          <p
            style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}
          >
            일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.
            <br />
            Something went wrong. Please try again shortly.
          </p>
          <button
            onClick={() => reset()}
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
        </div>
      </body>
    </html>
  )
}

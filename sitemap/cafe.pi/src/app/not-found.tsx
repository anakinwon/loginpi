// 루트 not-found — 로케일에 매칭되지 않는 경로의 최후 폴백.
// 루트 layout이 pass-through(html/body 없음)라 자체 html/body 제공. 대부분 404는 [locale]/not-found가 처리.
export default function RootNotFound() {
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
          <p style={{ fontSize: '3rem', fontWeight: 700, margin: 0 }}>404</p>
          <h1
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              marginTop: '0.5rem',
            }}
          >
            페이지를 찾을 수 없습니다 / Page not found
          </h1>
          <p
            style={{ color: '#666', marginTop: '0.5rem', fontSize: '0.875rem' }}
          >
            요청하신 페이지가 없거나 이동되었어요. / Page not found.
          </p>
          {/* 루트 폴백은 라우터 컨텍스트 밖(자체 html/body) — 풀 리로드 <a>가 의도된 동작 */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              background: '#000',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            홈으로 / Home
          </a>
        </div>
      </body>
    </html>
  )
}

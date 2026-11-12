// 루트 404 — 루트 layout 이 <html> 없이 children 만 넘기므로(next-intl 패턴) [locale] 밖에서 걸린 404 는 여기서 html·body 를 직접 그린다(@pi/i18n 표준 8절 3단계)
export default function RootNotFound() {
  return (
    <html lang="ko">
      <body style={{ margin: 0, minHeight: '100vh', padding: 24, background: '#f5f6f8', color: '#101828', fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>404</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14 }}>
          <a href="/" style={{ color: '#2b4c86', borderRadius: 6, textUnderlineOffset: 3 }}>
            Home
          </a>
        </p>
      </body>
    </html>
  )
}

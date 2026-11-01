// 루트 404 — 루트 layout 이 <html> 없이 children 만 넘기므로(next-intl 패턴) [locale] 밖에서 걸린 404 는 여기서 html·body 를 직접 그린다(@pi/i18n 표준 8절 3단계)
export default function RootNotFound() {
  return (
    <html lang="ko">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1>404</h1>
        <p>
          <a href="/">Home</a>
        </p>
      </body>
    </html>
  )
}

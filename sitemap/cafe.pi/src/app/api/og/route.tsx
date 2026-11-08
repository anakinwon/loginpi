import { ImageResponse } from 'next/og'

// 공유 링크 미리보기(OG/Twitter)용 1200×630 브랜드 카드.
// /api 경로라 next-intl 미들웨어 제외 → locale 리다이렉트 없이 안전하게 서빙.
// Satori는 기본 폰트가 라틴이라(한글 글리프 미포함) 카드 문구는 영문 + CSS 도형만 사용.
// Bean = 카페빈(☕) 브랜드 톤: 다크 배경 + 따뜻한 원두색 악센트.
// 온디맨드 생성(공유/크롤 시 호출, Vercel CDN 캐시) — 빌드 prerender 비의존.
export function GET() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: '#1c1917',
        padding: '90px',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        {/* 카페빈 악센트 (이미지/이모지 대신 CSS 도형 — 폰트 의존 없음) */}
        <div
          style={{
            width: '104px',
            height: '104px',
            borderRadius: '9999px',
            background: '#c8895a',
            display: 'flex',
          }}
        />
        <div style={{ fontSize: '92px', fontWeight: 800, color: '#fafaf9' }}>
          CafePi
        </div>
      </div>
      <div style={{ marginTop: '36px', fontSize: '44px', color: '#e7e5e4' }}>
        Pi Community Cafe &amp; Marketplace
      </div>
      <div style={{ marginTop: '14px', fontSize: '30px', color: '#a8a29e' }}>
        Chat, connect and trade with Pi
      </div>
      <div
        style={{
          marginTop: '52px',
          height: '8px',
          width: '220px',
          borderRadius: '9999px',
          background: '#c8895a',
          display: 'flex',
        }}
      />
    </div>,
    { width: 1200, height: 630 },
  )
}

// schema.pi 루트 레이아웃 — 전역 스타일·문서 언어(ko)·Pi SDK 로드·세션 Provider(Google NextAuth + Pi @pi/auth, 미완료 결제 복구 PiAuthRoot)
import type { Metadata } from 'next'
import { SessionProvider } from 'next-auth/react'
import { PiSdkScript } from '@pi/auth/client'
import { PiAuthRoot } from './pi-auth-root'
import './globals.css'

export const metadata: Metadata = {
  title: 'schema.pi',
  description: '데이터 표준사전 메타시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <PiSdkScript />
        {/* Google 미설정 환경은 /api/auth/* 가 404 라 세션 null — Pi 로그인만 동작 */}
        <SessionProvider>
          <PiAuthRoot>{children}</PiAuthRoot>
        </SessionProvider>
      </body>
    </html>
  )
}

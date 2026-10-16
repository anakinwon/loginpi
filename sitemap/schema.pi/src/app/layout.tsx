// schema.pi 루트 레이아웃 — 전역 스타일·문서 언어(ko)·Pi SDK 로드·Pi 세션 Provider(@pi/auth)
import type { Metadata } from 'next'
import { PiAuthProvider, PiSdkScript } from '@pi/auth/client'
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
        <PiAuthProvider>{children}</PiAuthProvider>
      </body>
    </html>
  )
}

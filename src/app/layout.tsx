import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import './globals.css'
import { auth } from '@/auth'
import { ThemeProvider } from '@/components/theme-provider'
import { PiAuthProvider } from '@/components/pi-auth-provider'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Next.js Starter Kit',
  description: 'Next.js 15 + Tailwind CSS v4 + shadcn/ui 스타터킷',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // 서버에서 미리 세션을 가져와 SessionProvider에 전달 → 클라이언트 로딩 플래시 방지
  const session = await auth()

  return (
    <html lang='ko' suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <SessionProvider session={session}>
          <ThemeProvider
            attribute='class'
            defaultTheme='system'
            enableSystem
            disableTransitionOnChange
          >
            <PiAuthProvider>
              <Header />
              <main className='flex-1'>{children}</main>
              <Footer />
              <Toaster richColors />
            </PiAuthProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  )
}

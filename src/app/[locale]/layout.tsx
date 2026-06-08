import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import '../globals.css'
import 'flag-icons/css/flag-icons.min.css'
import { auth } from '@/auth'
import { ThemeProvider } from '@/components/theme-provider'
import { PiAuthProvider } from '@/components/pi-auth-provider'
import { PiSdkScript } from '@/components/pi-sdk-script'
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
  description: 'Next.js 16 + Tailwind CSS v4 + shadcn/ui 스타터킷',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await auth()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* onLoad는 이벤트 핸들러이므로 Client Component(PiSdkScript)로 분리 */}
      <PiSdkScript />
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
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
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

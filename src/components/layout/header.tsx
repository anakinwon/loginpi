import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { GoogleLoginButton } from '@/components/google-login-button'
import { PiLoginButton } from '@/components/pi-login-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { BrowserName } from '@/components/layout/browser-name'
import { LanguageSwitcher } from '@/components/layout/language-switcher'
import { PiPriceChip } from '@/components/layout/pi-price-chip'
import { PiAdminLink } from '@/components/layout/pi-admin-link'

export async function Header() {
  const user = await getSessionUser()
  const showAdmin = isAdmin(user)
  const locale = await getLocale()
  const t = await getTranslations('header')

  return (
    <header className='bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm'>
      <div className='mx-auto flex h-14 max-w-5xl items-center justify-between px-4'>
        <Link href='/' className='text-foreground font-semibold tracking-tight'>
          <BrowserName />
        </Link>
        <nav className='flex items-center gap-3'>
          <Link
            href='/board'
            className='text-muted-foreground hover:text-foreground text-sm transition-colors'
          >
            {t('board')}
          </Link>
          {showAdmin && (
            <Link
              href='/admin'
              className='text-muted-foreground hover:text-foreground text-sm transition-colors'
            >
              {t('admin')}
            </Link>
          )}
          {/* Pi Browser: 서버 컴포넌트 갱신 타이밍과 무관하게 클라이언트에서 즉시 표시 */}
          <PiAdminLink />
          <GoogleLoginButton />
          <PiLoginButton />
          <ThemeToggle />
          <LanguageSwitcher locale={locale} />
          <PiPriceChip locale={locale} />
        </nav>
      </div>
    </header>
  )
}

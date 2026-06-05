import Link from 'next/link'
import { GoogleLoginButton } from '@/components/google-login-button'
import { PiLoginButton } from '@/components/pi-login-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

export async function Header() {
  const user = await getSessionUser()
  const showAdmin = isAdmin(user)

  return (
    <header className='bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm'>
      <div className='mx-auto flex h-14 max-w-5xl items-center justify-between px-4'>
        <Link href='/' className='text-foreground font-semibold tracking-tight'>
          Next.js Starter Kit
        </Link>
        <nav className='flex items-center gap-3'>
          <Link
            href='/board'
            className='text-muted-foreground hover:text-foreground text-sm transition-colors'
          >
            게시판
          </Link>
          {showAdmin && (
            <Link
              href='/admin'
              className='text-muted-foreground hover:text-foreground text-sm transition-colors'
            >
              Admin
            </Link>
          )}
          <GoogleLoginButton />
          <PiLoginButton />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

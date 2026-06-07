import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { PiAdminLink } from '@/components/layout/pi-admin-link'

export async function Footer() {
  const user = await getSessionUser()
  const showAdmin = isAdmin(user)
  const t = await getTranslations('header')

  return (
    <footer className='border-t py-6'>
      <div className='mx-auto max-w-5xl px-4'>
        <div className='flex flex-col items-center gap-3 sm:flex-row sm:justify-between'>
          <p className='text-muted-foreground text-center text-sm sm:text-left'>
            © {new Date().getFullYear()} Next.js Starter Kit. Built with Next.js
            15, Tailwind CSS v4, shadcn/ui.
          </p>
          <div className='flex items-center gap-2'>
            {showAdmin && (
              <Link
                href='/admin'
                className='text-muted-foreground hover:text-foreground text-sm transition-colors'
              >
                {t('admin')}
              </Link>
            )}
            <PiAdminLink />
          </div>
        </div>
      </div>
    </footer>
  )
}

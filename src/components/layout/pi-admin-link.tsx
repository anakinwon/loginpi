'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// Pi Browser 세션에서 role 읽어 admin 링크 표시
// 서버 컴포넌트의 showAdmin이 router.refresh() 타이밍에 의존하는 문제를 보완
export function PiAdminLink() {
  const { user, isInPiBrowser } = usePiAuth()
  const t = useTranslations('header')

  if (!isInPiBrowser) return null
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return null

  return (
    <Link
      href='/admin'
      className='text-muted-foreground hover:text-foreground text-sm transition-colors'
    >
      {t('admin')}
    </Link>
  )
}

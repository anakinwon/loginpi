'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// Pi Browser 전용 마이프로필 링크.
// 서버 컴포넌트에선 쿠키 없이 user=null → 이 컴포넌트가 클라이언트 상태로 보완한다.
export function PiProfileLink() {
  const { user, isInPiBrowser } = usePiAuth()
  const t = useTranslations('header')

  if (!isInPiBrowser) return null
  if (!user) return null

  return (
    <Link
      href="/profile"
      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
    >
      {t('myProfile')}
    </Link>
  )
}

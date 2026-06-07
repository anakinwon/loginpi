'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// Pi Browser 전용 관리자 링크
// next-intl Link(SPA 라우팅) 대신 window.location.assign으로 전체 페이지 이동
// → Pi Browser WebView에서 쿠키가 확실히 전송되어 서버 측 isAdmin() 체크 통과
export function PiAdminLink() {
  const { user, isInPiBrowser } = usePiAuth()
  const t = useTranslations('header')
  const params = useParams()
  const locale = (params.locale as string) ?? 'ko'

  if (!isInPiBrowser) return null
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return null

  function handleClick() {
    window.location.assign(`/${locale}/admin`)
  }

  return (
    <button
      onClick={handleClick}
      className='text-muted-foreground hover:text-foreground text-sm transition-colors'
    >
      {t('admin')}
    </button>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// Pi Browser 전용 관리자 링크.
// 클라이언트 라우팅(router.push)으로 admin 진입 → admin layout이 쿠키로 신원을 못 찾으면
// ClientAdminGate가 렌더된다(무한 루프 없음).
export function PiAdminLink() {
  const { user, isInPiBrowser } = usePiAuth()
  const t = useTranslations('header')
  const router = useRouter()

  if (!isInPiBrowser) return null
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return null

  return (
    <button
      onClick={() => router.push('/admin')}
      className='text-muted-foreground hover:text-foreground text-sm transition-colors'
      title={t('admin')}
    >
      🛡️
    </button>
  )
}

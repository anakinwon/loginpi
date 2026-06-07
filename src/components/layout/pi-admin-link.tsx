'use client'

import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import { usePiAuth } from '@/components/pi-auth-provider'

// Pi Browser 전용 관리자 링크
// fetch() 응답 Set-Cookie가 WebView에 저장 안 되는 문제를 form POST로 우회
// form submit → 서버가 Set-Cookie + 302 리다이렉트 → 브라우저 네이티브 처리로 쿠키 안정적 저장
export function PiAdminLink() {
  const { user, isInPiBrowser, piAccessToken } = usePiAuth()
  const t = useTranslations('header')
  const params = useParams()
  const locale = (params.locale as string) ?? 'ko'

  if (!isInPiBrowser) return null
  if (!user || !piAccessToken || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return null

  return (
    <form method='post' action='/api/auth/pi-redirect' style={{ display: 'inline' }}>
      <input type='hidden' name='accessToken' value={piAccessToken} />
      <input type='hidden' name='to' value={`/${locale}/admin`} />
      <button
        type='submit'
        className='text-muted-foreground hover:text-foreground text-sm transition-colors'
      >
        {t('admin')}
      </button>
    </form>
  )
}

'use client'

// 클라이언트 로그인 게이트 — 서버는 redirect 하지 않고(Pi Browser 무한 루프 방지) 여기서 로그인 유도·재시도.
// signIn 가드는 window.Pi 존재만(UA 판정 금지) — authenticate 성공 여부로만 Pi Browser 판정
import { useTranslations } from 'next-intl'
import { usePiAuth, type PiSessionUser } from '@pi/auth/client'

export function LoginGate({
  children,
}: {
  children: (user: PiSessionUser) => React.ReactNode
}) {
  const t = useTranslations('auth')
  const { user, isLoading, signIn, error } = usePiAuth()

  if (isLoading && !user)
    return <p className="text-muted-foreground text-sm">{t('checking')}</p>
  if (user) return <>{children(user)}</>
  return (
    <div className="card flex flex-col items-start gap-2">
      <p className="text-sm">{t('required')}</p>
      <button className="btn btn-primary" onClick={() => void signIn()}>
        {t('signIn')}
      </button>
      <p className="text-muted-foreground text-xs">{t('openInPiBrowser')}</p>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}

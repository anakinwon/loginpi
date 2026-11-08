'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'

// Stellar 지갑 주소 56자 → 앞 10자 + … + 끝 6자
function truncateAddress(addr: string): string {
  if (addr.length <= 20) return addr
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 개발 환경 + 일반 브라우저 → devLogin 사용 (Pi.authenticate는 Pi Browser 외 resolve 안 됨)
const isDev = process.env.NODE_ENV !== 'production'

export function PiUserCard() {
  const { user, isLoading, isInPiBrowser, signIn, signOut, devLogin, error } =
    usePiAuth()
  const t = useTranslations('userMisc')
  const tc = useTranslations('common')
  const useDevLogin = isDev && !isInPiBrowser

  if (!user) {
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-muted flex flex-wrap items-center gap-6 rounded-xl p-6">
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => (useDevLogin ? devLogin() : signIn())}
              disabled={isLoading}
              className="gap-2"
            >
              <span
                className="font-serif text-base leading-none italic"
                aria-hidden="true"
              >
                π
              </span>
              {isLoading
                ? t('piAuthenticating')
                : useDevLogin
                  ? t('piLoginDev')
                  : t('piLogin')}
            </Button>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <p className="text-muted-foreground text-sm">
            {t('piAutoAuthDesc1')}
            <br />
            {t('piAutoAuthDesc2')}
          </p>
        </div>

        {/* 개발 환경 전용 안내 — 프로덕션 빌드에서는 렌더링 자체가 제거됨 */}
        {isDev && !isInPiBrowser && (
          <p className="text-muted-foreground border-dashed text-xs">
            {t('piDevHint')}
          </p>
        )}
      </div>
    )
  }

  const isDevSession = user.uid.startsWith('dev_')

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">{t('piUserInfo')}</CardTitle>
            {isDevSession && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {t('devSession')}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            {t('logout')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <InfoRow
          label={t('fieldUsername')}
          value={user.username ? `@${user.username}` : tc('noneParen')}
        />
        <InfoRow label="UID" value={user.uid} mono />
        {user.walletAddress ? (
          <InfoRow
            label={t('fieldWalletAddr')}
            value={truncateAddress(user.walletAddress)}
            fullValue={user.walletAddress}
            mono
          />
        ) : (
          <InfoRow label={t('fieldWalletAddr')} value={t('walletNoScope')} />
        )}
        <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">
            {t('grantedScopes')}
          </span>
          <div className="flex flex-wrap gap-1">
            {user.scopesGranted.length > 0 ? (
              user.scopesGranted.map((s) => (
                <span
                  key={s}
                  className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium"
                >
                  {s}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground text-xs">
                {tc('none')}
              </span>
            )}
          </div>
        </div>
        <InfoRow
          label={t('tokenExpiry')}
          value={formatDate(user.tokenValidUntil)}
        />
      </CardContent>
    </Card>
  )
}

function InfoRow({
  label,
  value,
  mono,
  fullValue,
}: {
  label: string
  value: string
  mono?: boolean
  fullValue?: string
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={`break-all${mono ? 'font-mono text-xs' : ''}`}
        title={fullValue}
      >
        {value}
      </span>
    </div>
  )
}

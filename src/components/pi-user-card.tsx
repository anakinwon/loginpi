'use client'

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
                ? 'Pi 인증 중…'
                : useDevLogin
                  ? 'Pi Network로 로그인 (개발 임시)'
                  : 'Pi Network로 로그인'}
            </Button>
            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
          <p className="text-muted-foreground text-sm">
            Pi Browser에서 접속하면 자동으로 인증됩니다.
            <br />
            다른 환경에서는 버튼을 눌러 수동으로 로그인하세요.
          </p>
        </div>

        {/* 개발 환경 전용 안내 — 프로덕션 빌드에서는 렌더링 자체가 제거됨 */}
        {isDev && !isInPiBrowser && (
          <p className="text-muted-foreground border-dashed text-xs">
            개발 환경: 위 버튼은 Pi Browser 없이도 mock admin 세션으로 즉시
            로그인됩니다. 프로덕션 빌드에서는 자동으로 실제 Pi 인증으로
            전환됩니다.
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
            <CardTitle className="text-sm">Pi Network 사용자 정보</CardTitle>
            {isDevSession && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                개발 임시 세션
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <InfoRow
          label="사용자명"
          value={user.username ? `@${user.username}` : '(없음)'}
        />
        <InfoRow label="UID" value={user.uid} mono />
        {user.walletAddress ? (
          <InfoRow
            label="지갑 주소"
            value={truncateAddress(user.walletAddress)}
            fullValue={user.walletAddress}
            mono
          />
        ) : (
          <InfoRow label="지갑 주소" value="(scope 미부여)" />
        )}
        <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">부여된 권한</span>
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
              <span className="text-muted-foreground text-xs">없음</span>
            )}
          </div>
        </div>
        <InfoRow label="토큰 만료" value={formatDate(user.tokenValidUntil)} />
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

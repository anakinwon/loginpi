'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'

// Stellar 지갑 주소 (56자) 앞 10자 + … + 끝 6자로 축약
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

export function PiUserCard() {
  const { user, isLoading, signIn, signOut, error } = usePiAuth()

  if (!user) {
    return (
      <div className='bg-muted flex flex-wrap items-center gap-6 rounded-xl p-6'>
        <div className='flex flex-col gap-2'>
          <Button onClick={signIn} disabled={isLoading} className='gap-2'>
            <span className='font-serif text-base italic leading-none' aria-hidden='true'>
              π
            </span>
            {isLoading ? 'Pi 인증 중…' : 'Pi Network로 로그인'}
          </Button>
          {error && <p className='text-destructive text-xs'>{error}</p>}
        </div>
        <p className='text-muted-foreground text-sm'>
          Pi Browser에서 접속하면 자동으로 인증됩니다.
          <br />
          다른 환경에서는 버튼을 눌러 수동으로 로그인하세요.
        </p>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-sm'>Pi Network 사용자 정보</CardTitle>
          <Button variant='outline' size='sm' onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-2.5'>
        <InfoRow
          label='사용자명'
          value={user.username ? `@${user.username}` : '(없음)'}
        />
        <InfoRow label='UID' value={user.uid} mono />
        {user.walletAddress ? (
          <InfoRow
            label='지갑 주소'
            value={truncateAddress(user.walletAddress)}
            fullValue={user.walletAddress}
            mono
          />
        ) : (
          <InfoRow label='지갑 주소' value='(scope 미부여)' />
        )}
        <div className='grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm'>
          <span className='text-muted-foreground shrink-0'>부여된 권한</span>
          <div className='flex flex-wrap gap-1'>
            {user.scopesGranted.length > 0 ? (
              user.scopesGranted.map((s) => (
                <span
                  key={s}
                  className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'
                >
                  {s}
                </span>
              ))
            ) : (
              <span className='text-muted-foreground text-xs'>없음</span>
            )}
          </div>
        </div>
        <InfoRow label='토큰 만료' value={formatDate(user.tokenValidUntil)} />
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
    <div className='grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm'>
      <span className='text-muted-foreground shrink-0'>{label}</span>
      <span
        className={`break-all${mono ? ' font-mono text-xs' : ''}`}
        title={fullValue}
      >
        {value}
      </span>
    </div>
  )
}

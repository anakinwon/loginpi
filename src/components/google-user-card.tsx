'use client'

import Image from 'next/image'
import { signIn, signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function GoogleUserCard() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground text-center text-sm">로딩 중…</p>
        </CardContent>
      </Card>
    )
  }

  if (!session?.user) {
    return (
      <div className="bg-muted flex flex-wrap items-center gap-6 rounded-xl p-6">
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => signIn('google')}
            variant="outline"
            className="gap-2"
          >
            <GoogleColorIcon />
            Google 계정으로 로그인
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Google 계정으로 간편하게 로그인합니다.
          <br />
          Pi 계정과 별도로 독립적으로 동작합니다.
        </p>
      </div>
    )
  }

  const { user } = session

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Google 계정 정보</CardTitle>
          <Button variant="outline" size="sm" onClick={() => signOut()}>
            로그아웃
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {/* 프로필 이미지 + 이름 */}
        <div className="flex items-center gap-3">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? 'Google 사용자'}
              width={40}
              height={40}
              className="rounded-full"
            />
          ) : (
            <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium">
              {(user.name ?? user.email ?? 'G').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-medium">{user.name ?? '(이름 없음)'}</p>
            <p className="text-muted-foreground text-xs">{user.email}</p>
          </div>
        </div>

        <InfoRow label="이메일" value={user.email ?? '(없음)'} />
        <InfoRow label="사용자 ID" value={user.id} mono />
        <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
          <span className="text-muted-foreground shrink-0">인증 제공자</span>
          <span className="flex items-center gap-1.5">
            <GoogleColorIcon />
            <span>Google</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`break-all${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function GoogleColorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

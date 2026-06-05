'use client'

import { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { usePiAuth } from './pi-auth-provider'

type GenStatus = 'idle' | 'loading' | 'done' | 'error'

export function AccountLinkCard() {
  const { user: piUser, isInPiBrowser } = usePiAuth()
  const { data: googleSession } = useSession()
  const [genStatus, setGenStatus] = useState<GenStatus>('idle')
  const [linkUrl, setLinkUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function generateLinkToken() {
    setGenStatus('loading')
    setLinkUrl('')
    try {
      const res = await fetch('/api/auth/link-start', { method: 'POST' })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? '링크 생성 실패')
      setLinkUrl(data.url)
      setGenStatus('done')
    } catch (err) {
      setGenStatus('error')
      setLinkUrl(err instanceof Error ? err.message : '오류 발생')
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(linkUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bothLoggedIn = !!piUser && !!googleSession?.user
  const alreadyLinked = bothLoggedIn && piUser.userId === googleSession.user.id

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm'>계정 연동</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>

        {/* 연동 현황 */}
        <StatusRow
          label='Pi Network'
          connected={!!piUser}
          value={piUser?.username ? `@${piUser.username}` : undefined}
        />
        <StatusRow
          label='Google'
          connected={!!googleSession?.user}
          value={googleSession?.user?.email ?? undefined}
        />

        <div className='border-t pt-3 space-y-3'>
          {alreadyLinked ? (
            <p className='text-green-600 dark:text-green-400 text-xs font-medium'>
              ✓ 두 계정이 연동되어 있습니다
            </p>
          ) : (
            <>
              {/* 시나리오 안내 */}
              <div className='bg-muted rounded-lg p-3 space-y-2 text-xs text-muted-foreground'>
                {isInPiBrowser ? (
                  <>
                    <p className='font-medium text-foreground'>Pi Browser에서 연동하기</p>
                    <p>아래 버튼으로 연동 링크를 생성하고, 일반 브라우저(PC/휴대폰)에서 열어 Google로 로그인하세요.</p>
                  </>
                ) : (
                  <>
                    <p className='font-medium text-foreground'>일반 브라우저에서 연동하기</p>
                    <p>① Google 로그인 후 아래 버튼으로 연동 링크 생성 → ② 링크를 Pi Browser에서 열면 자동 연동됩니다.</p>
                  </>
                )}
              </div>

              {/* Google 미로그인 시 로그인 유도 (일반 브라우저) */}
              {!isInPiBrowser && !googleSession?.user && (
                <Button
                  variant='outline'
                  size='sm'
                  className='w-full gap-1.5'
                  onClick={() => signIn('google')}
                >
                  Google로 먼저 로그인
                </Button>
              )}

              {/* 연동 링크 생성 버튼 */}
              {(isInPiBrowser ? !!piUser : !!googleSession?.user) && (
                <Button
                  size='sm'
                  className='w-full'
                  disabled={genStatus === 'loading'}
                  onClick={generateLinkToken}
                >
                  {genStatus === 'loading' ? '링크 생성 중…' : '연동 링크 생성'}
                </Button>
              )}

              {/* 생성된 링크 표시 */}
              {genStatus === 'done' && linkUrl && (
                <div className='space-y-2'>
                  <p className='text-xs text-muted-foreground'>
                    아래 링크를{' '}
                    {isInPiBrowser ? '일반 브라우저(PC/폰)' : 'Pi Browser'}에서 열어주세요.
                    <strong className='text-destructive'> 10분 내</strong> 사용 필요.
                  </p>
                  <div className='flex gap-2'>
                    <Input
                      readOnly
                      value={linkUrl}
                      className='text-xs h-8 font-mono'
                    />
                    <Button size='sm' variant='outline' onClick={copyUrl} className='shrink-0 h-8'>
                      {copied ? '✓' : '복사'}
                    </Button>
                  </div>
                </div>
              )}

              {genStatus === 'error' && (
                <p className='text-destructive text-xs'>{linkUrl}</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  label,
  connected,
  value,
}: {
  label: string
  connected: boolean
  value?: string
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span className='text-muted-foreground w-24 shrink-0'>{label}</span>
      <span className='flex-1 truncate text-xs'>{connected ? (value ?? '연결됨') : '—'}</span>
      <span className={`text-xs shrink-0 ${connected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {connected ? '✓ 연결됨' : '미연결'}
      </span>
    </div>
  )
}

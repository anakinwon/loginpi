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
  const [linkProvider, setLinkProvider] = useState<'pi' | 'google' | null>(null)
  const [copied, setCopied] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  async function generateLinkToken() {
    setGenStatus('loading')
    setLinkUrl('')
    setErrMsg('')
    try {
      const res = await fetch('/api/auth/link-start', { method: 'POST' })
      const data = (await res.json()) as {
        url?: string
        provider?: 'pi' | 'google'
        error?: string
      }
      if (!res.ok || !data.url) throw new Error(data.error ?? '링크 생성 실패')
      setLinkUrl(data.url)
      setLinkProvider(data.provider ?? null)
      setGenStatus('done')
    } catch (err) {
      setGenStatus('error')
      setErrMsg(err instanceof Error ? err.message : '오류 발생')
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(linkUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const bothLoggedIn = !!piUser && !!googleSession?.user
  const alreadyLinked = bothLoggedIn && piUser.userId === googleSession.user.id
  const canGenerate = isInPiBrowser ? !!piUser : !!googleSession?.user

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm'>계정 연동</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>

        {/* 연동 현황 */}
        <StatusRow label='Pi Network' connected={!!piUser}
          value={piUser?.username ? `@${piUser.username}` : undefined} />
        <StatusRow label='Google' connected={!!googleSession?.user}
          value={googleSession?.user?.email ?? undefined} />

        <div className='border-t pt-3 space-y-3'>
          {alreadyLinked ? (
            <p className='text-green-600 dark:text-green-400 text-xs font-medium'>
              ✓ 두 계정이 연동되어 있습니다
            </p>

          ) : (
            <>
              {/* 환경별 안내 */}
              <div className='bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1'>
                {isInPiBrowser ? (
                  <>
                    <p className='font-semibold text-foreground'>Pi Browser에서의 연동 순서</p>
                    <p>① 아래 [연동 링크 생성] 클릭</p>
                    <p>② 생성된 링크를 복사</p>
                    <p className='text-amber-600 dark:text-amber-400 font-medium'>
                      ③ 일반 브라우저(PC/Android Chrome 등)에서 링크 열기
                    </p>
                    <p>④ Google로 로그인하면 자동 연동</p>
                  </>
                ) : (
                  <>
                    <p className='font-semibold text-foreground'>일반 브라우저에서의 연동 순서</p>
                    {!googleSession?.user && (
                      <p className='text-amber-600 dark:text-amber-400 font-medium'>
                        먼저 Google로 로그인해주세요
                      </p>
                    )}
                    {googleSession?.user && (
                      <>
                        <p>① 아래 [연동 링크 생성] 클릭</p>
                        <p>② 생성된 링크를 복사</p>
                        <p className='text-amber-600 dark:text-amber-400 font-medium'>
                          ③ Pi Browser에서 링크 열기
                        </p>
                        <p>④ Pi 자동 로그인 후 자동 연동</p>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Google 미로그인 시 로그인 유도 */}
              {!isInPiBrowser && !googleSession?.user && (
                <Button variant='outline' size='sm' className='w-full gap-1.5'
                  onClick={() => signIn('google')}>
                  Google로 먼저 로그인
                </Button>
              )}

              {/* 연동 링크 생성 버튼 */}
              {canGenerate && (
                <Button size='sm' className='w-full'
                  disabled={genStatus === 'loading'}
                  onClick={generateLinkToken}>
                  {genStatus === 'loading' ? '링크 생성 중…' : '연동 링크 생성'}
                </Button>
              )}

              {/* 생성된 링크 + 어느 브라우저에서 열지 명시 */}
              {genStatus === 'done' && linkUrl && (
                <div className='space-y-2'>
                  <div className='rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-2 text-xs'>
                    <p className='font-semibold text-amber-800 dark:text-amber-300'>
                      ⚠ 아래 링크를{' '}
                      {linkProvider === 'pi'
                        ? '일반 브라우저(Chrome, Safari 등)'
                        : 'Pi Browser'}
                      에서 열어주세요
                    </p>
                    <p className='text-amber-700 dark:text-amber-400 mt-0.5'>
                      {linkProvider === 'pi'
                        ? 'Pi Browser에서 열면 작동하지 않습니다.'
                        : '일반 브라우저에서 열면 작동하지 않습니다.'}
                    </p>
                  </div>
                  <div className='flex gap-2'>
                    <Input readOnly value={linkUrl}
                      className='text-xs h-8 font-mono' />
                    <Button size='sm' variant='outline' onClick={copyUrl}
                      className='shrink-0 h-8'>
                      {copied ? '✓' : '복사'}
                    </Button>
                  </div>
                  <p className='text-muted-foreground text-xs text-right'>
                    10분 내 사용 필요
                  </p>
                </div>
              )}

              {genStatus === 'error' && (
                <p className='text-destructive text-xs'>{errMsg}</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({ label, connected, value }: {
  label: string; connected: boolean; value?: string
}) {
  return (
    <div className='flex items-center justify-between gap-2 text-sm'>
      <span className='text-muted-foreground w-24 shrink-0'>{label}</span>
      <span className='flex-1 truncate text-xs'>{connected ? (value ?? '연결됨') : '—'}</span>
      <span className={`text-xs shrink-0 ${connected
        ? 'text-green-600 dark:text-green-400'
        : 'text-muted-foreground'}`}>
        {connected ? '✓ 연결됨' : '미연결'}
      </span>
    </div>
  )
}

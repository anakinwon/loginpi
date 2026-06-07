'use client'

import { Suspense, useState } from 'react'
import { useTranslations } from 'next-intl'
import { signIn as googleSignIn, useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePiAuth } from '@/components/pi-auth-provider'

// 분기 기준:
//   piUser 있음 → 코드 생성 UI  (Pi 세션 보유 = Pi Browser 또는 Pi 쿠키 있는 환경)
//   piUser 없음 → 코드 입력 UI  (일반 브라우저)
//   ?generate=1  → 항상 생성 UI  (UA 감지 실패 시 강제 진입용)
function LinkPageInner() {
  const t = useTranslations('link')
  const tc = useTranslations('common')
  const { user: piUser, piAccessToken, isLoading: piLoading, signIn: piSignIn } = usePiAuth()
  const { data: googleSession, status: googleStatus } = useSession()
  const params = useSearchParams()
  const router = useRouter()

  const forceGenerate = params.get('generate') === '1'
  const showGenerate = forceGenerate || !!piUser

  const codeFromUrl = (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6)

  const [genStatus, setGenStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [genCode, setGenCode] = useState('')
  const [genErr, setGenErr] = useState('')

  const [inputCode, setInputCode] = useState(codeFromUrl)
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [linkErr, setLinkErr] = useState('')

  const digits = inputCode.replace(/\D/g, '').slice(0, 6)
  const displayValue = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits
  const isValidCode = digits.length === 6
  const displayGenCode = genCode ? `${genCode.slice(0, 3)}-${genCode.slice(3)}` : ''

  async function generateCode(isRetry = false) {
    setGenStatus('loading')
    setGenCode('')
    setGenErr('')
    try {
      const res = await fetch('/api/auth/link-start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(piAccessToken ? { 'X-Pi-Token': piAccessToken } : {}),
        },
      })
      const data = (await res.json()) as { code?: string; error?: string }
      if (res.status === 401 && !isRetry) {
        await piSignIn()
        return generateCode(true)
      }
      if (!res.ok || !data.code) throw new Error(data.error ?? t('generateFail'))
      setGenCode(data.code)
      setGenStatus('done')
    } catch (err) {
      setGenStatus('error')
      setGenErr(err instanceof Error ? err.message : tc('error'))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidCode) return

    if (googleStatus !== 'authenticated') {
      googleSignIn('google', { callbackUrl: `/link/complete?code=${digits}` })
      return
    }

    setLinkStatus('loading')
    try {
      const res = await fetch('/api/auth/link-complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: digits }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? t('linkFail'))
      setLinkStatus('done')
      setTimeout(() => router.push('/'), 1500)
    } catch (err) {
      setLinkStatus('error')
      setLinkErr(err instanceof Error ? err.message : tc('error'))
    }
  }

  if (piLoading) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center px-4'>
        <Card className='w-full max-w-sm'>
          <CardContent className='py-10 text-center space-y-3'>
            <div className='mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent' />
            <p className='text-sm text-muted-foreground'>{t('checkingPi')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (showGenerate) {
    return (
      <div className='min-h-[60vh] flex items-center justify-center px-4'>
        <Card className='w-full max-w-sm'>
          <CardHeader>
            <CardTitle>{t('generateTitle')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {!piUser ? (
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>{t('needPiLogin')}</p>
                <Button className='w-full' onClick={() => piSignIn()}>
                  {t('piLogin')}
                </Button>
              </div>
            ) : (
              <div className='space-y-3'>
                <p className='text-sm text-muted-foreground'>
                  {t('generateDesc')}
                </p>
                <Button
                  className='w-full'
                  disabled={genStatus === 'loading'}
                  onClick={() => generateCode()}
                >
                  {genStatus === 'loading'
                    ? t('generating')
                    : genStatus === 'done'
                      ? t('regenerate')
                      : t('generate')}
                </Button>

                {genStatus === 'done' && displayGenCode && (
                  <div className='rounded-lg border-2 border-primary/40 bg-primary/5 p-5 text-center space-y-2'>
                    <p className='text-xs text-muted-foreground'>{t('codeLabel')}</p>
                    <p className='text-5xl font-bold tracking-widest font-mono text-primary'>
                      {displayGenCode}
                    </p>
                    <p className='text-xs text-muted-foreground'>{t('codeExpiry')}</p>
                  </div>
                )}

                {genStatus === 'error' && (
                  <p className='text-destructive text-xs text-center'>{genErr}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='min-h-[60vh] flex items-center justify-center px-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>{t('inputTitle')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          {linkStatus === 'done' ? (
            <p className='text-green-600 dark:text-green-400 text-sm font-medium text-center py-4'>
              ✓ {t('linkDone')}
            </p>
          ) : (
            <>
              <p className='text-sm text-muted-foreground'>{t('inputDesc')}</p>
              <form onSubmit={handleSubmit} className='space-y-4'>
                <div className='space-y-1.5'>
                  <Label htmlFor='link-code'>{t('codeInputLabel')}</Label>
                  <Input
                    id='link-code'
                    inputMode='numeric'
                    placeholder='000-000'
                    value={displayValue}
                    onChange={(e) =>
                      setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className='text-center text-2xl font-mono tracking-widest h-12'
                    maxLength={7}
                    autoComplete='one-time-code'
                  />
                </div>
                {!googleSession?.user && (
                  <p className='text-xs text-muted-foreground bg-muted rounded-md p-2'>
                    {t('googleLoginRequired')}
                  </p>
                )}
                {linkStatus === 'error' && (
                  <p className='text-destructive text-xs'>{linkErr}</p>
                )}
                <Button
                  type='submit'
                  className='w-full'
                  disabled={!isValidCode || linkStatus === 'loading'}
                >
                  {linkStatus === 'loading'
                    ? t('linking')
                    : googleSession?.user
                      ? t('googleLink')
                      : t('googleLoginAndLink')}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function LinkPage() {
  return (
    <Suspense
      fallback={
        <div className='min-h-[60vh] flex items-center justify-center'>
          <div className='h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent' />
        </div>
      }
    >
      <LinkPageInner />
    </Suspense>
  )
}

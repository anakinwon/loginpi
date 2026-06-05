'use client'

import { useState } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LinkPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [code, setCode] = useState('')
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const digits = code.replace(/\D/g, '').slice(0, 6)
  const displayValue = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits
  const isValid = digits.length === 6

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return

    if (status !== 'authenticated') {
      // Google 로그인 후 이 페이지로 돌아오되, code를 complete로 전달
      signIn('google', { callbackUrl: `/link/complete?code=${digits}` })
      return
    }

    // Google 이미 로그인 상태 → 바로 연동 처리
    setLinkStatus('loading')
    try {
      const res = await fetch('/api/auth/link-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: digits }),
      })
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? '연동 실패')
      setLinkStatus('done')
      setTimeout(() => router.push('/'), 1500)
    } catch (err) {
      setLinkStatus('error')
      setErrMsg(err instanceof Error ? err.message : '오류 발생')
    }
  }

  return (
    <div className='min-h-[60vh] flex items-center justify-center px-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>Pi · Google 계정 연동</CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>

          {linkStatus === 'done' ? (
            <p className='text-green-600 dark:text-green-400 text-sm font-medium text-center py-4'>
              ✓ 계정 연동이 완료됐습니다! 홈으로 이동합니다…
            </p>
          ) : (
            <>
              <p className='text-sm text-muted-foreground'>
                Pi Browser에서 생성한 <strong>6자리 연동 코드</strong>를 입력하세요.
              </p>

              <form onSubmit={handleSubmit} className='space-y-4'>
                <div className='space-y-1.5'>
                  <Label htmlFor='link-code'>연동 코드</Label>
                  <Input
                    id='link-code'
                    inputMode='numeric'
                    placeholder='000-000'
                    value={displayValue}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className='text-center text-2xl font-mono tracking-widest h-12'
                    maxLength={7}
                    autoComplete='one-time-code'
                  />
                </div>

                {!session?.user && (
                  <p className='text-xs text-muted-foreground bg-muted rounded-md p-2'>
                    코드 입력 후 Google 로그인 화면으로 이동합니다.
                  </p>
                )}

                {linkStatus === 'error' && (
                  <p className='text-destructive text-xs'>{errMsg}</p>
                )}

                <Button
                  type='submit'
                  className='w-full'
                  disabled={!isValid || linkStatus === 'loading'}
                >
                  {linkStatus === 'loading'
                    ? '연동 중…'
                    : session?.user
                      ? '연동하기'
                      : 'Google로 로그인 후 연동'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

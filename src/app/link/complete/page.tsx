'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Google 로그인 완료 후 callbackUrl로 /link/complete?code={code} 리다이렉트
function LinkCompleteInner() {
  const params = useSearchParams()
  const router = useRouter()
  const code = params.get('code')
  const { status } = useSession()
  const [result, setResult] = useState<'pending' | 'done' | 'error'>('pending')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (status !== 'authenticated' || !code || result !== 'pending') return

    fetch('/api/auth/link-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((d: { success?: boolean; error?: string }) => {
        if (d.success) {
          setResult('done')
          setMessage('Pi와 Google 계정이 연동됐습니다!')
          setTimeout(() => router.push('/'), 2000)
        } else {
          setResult('error')
          setMessage(d.error ?? '연동 실패')
        }
      })
      .catch(() => {
        setResult('error')
        setMessage('서버 오류가 발생했습니다')
      })
  }, [status, code, result, router])

  if (!code) {
    return (
      <Card className='max-w-md mx-auto mt-20'>
        <CardContent className='py-8 text-center'>
          <p className='text-destructive text-sm'>유효하지 않은 연동 링크입니다.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='max-w-md mx-auto mt-20'>
      <CardHeader>
        <CardTitle>계정 연동 처리 중</CardTitle>
      </CardHeader>
      <CardContent>
        {result === 'pending' && (
          <p className='text-muted-foreground text-sm'>
            {status === 'loading' ? 'Google 세션 확인 중…' : '연동 처리 중…'}
          </p>
        )}
        {result === 'done' && (
          <p className='text-green-600 dark:text-green-400 text-sm font-medium'>
            ✓ {message} 홈으로 이동합니다…
          </p>
        )}
        {result === 'error' && (
          <p className='text-destructive text-sm'>{message}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function LinkCompletePage() {
  return (
    <Suspense fallback={<div className='text-center mt-20'>로딩 중…</div>}>
      <LinkCompleteInner />
    </Suspense>
  )
}

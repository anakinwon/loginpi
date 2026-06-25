'use client'

import { Suspense, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Google 로그인 완료 후 callbackUrl로 /link/complete?code={code} 리다이렉트
function LinkCompleteInner() {
  const t = useTranslations('link')
  const tc = useTranslations('common')
  const params = useSearchParams()
  const router = useRouter()
  const code = params.get('code')
  const { status } = useSession()
  const [result, setResult] = useState<'pending' | 'done' | 'error'>('pending')
  const [errorMsg, setErrorMsg] = useState('')

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
          setTimeout(() => router.push('/'), 2000)
        } else {
          setResult('error')
          setErrorMsg(d.error ?? t('linkFail'))
        }
      })
      .catch(() => {
        setResult('error')
        setErrorMsg(t('serverError'))
      })
  }, [status, code, result, router, t])

  if (!code) {
    return (
      <Card className="mx-auto mt-20 max-w-md">
        <CardContent className="py-8 text-center">
          <p className="text-destructive text-sm">{t('invalidLink')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto mt-20 max-w-md">
      <CardHeader>
        <CardTitle>{t('completeTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {result === 'pending' && (
          <p className="text-muted-foreground text-sm">
            {status === 'loading' ? t('checkingSession') : t('processing')}
          </p>
        )}
        {result === 'done' && (
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            ✓ {t('linkedSuccess')}
          </p>
        )}
        {result === 'error' && (
          <p className="text-destructive text-sm">{errorMsg}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function LinkCompletePage() {
  const tc = useTranslations('common')
  return (
    <Suspense
      fallback={<div className="mt-20 text-center">{tc('loading')}</div>}
    >
      <LinkCompleteInner />
    </Suspense>
  )
}

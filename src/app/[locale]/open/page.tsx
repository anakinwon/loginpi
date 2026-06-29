'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'
import { env } from '@/env'

// Pi Browser 딥링크 브리지 — 텔레그램 등 외부에서 Pi Browser로 유도.
//   텔레그램 버튼(https)으로 이 페이지가 Chrome에서 열리면 pi:// 리다이렉트로 Pi Browser 실행.
//   ⭐ Pi Browser는 pi://<host><path>를 https://<host><path>로 변환해 로드한다.
//   → pi:// 뒤에는 host만! https://를 붙이면 https://https//... 로 깨진다(실기기 확인).
function normalizeHost(raw: string | undefined, fallbackHost: string): string {
  if (!raw) return fallbackHost
  return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function OpenBridge() {
  const params = useSearchParams()
  const [fallback, setFallback] = useState(false)

  // 오픈 리다이렉트 방지: 내부 절대경로만 허용
  const raw = params.get('to') ?? '/ko/store/my/sales'
  const to = /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : '/ko/store/my/sales'

  useEffect(() => {
    const host = normalizeHost(
      env.NEXT_PUBLIC_PI_APP_DOMAIN,
      window.location.host,
    )
    // pi://<host><path> — Pi Browser가 https://<host><path>로 변환 로드. https:// 붙이지 말 것!
    window.location.href = `pi://${host}${to}`
    const timer = setTimeout(() => setFallback(true), 1500)
    return () => clearTimeout(timer)
  }, [to])

  const host = normalizeHost(
    env.NEXT_PUBLIC_PI_APP_DOMAIN,
    typeof window !== 'undefined' ? window.location.host : '',
  )
  const httpsUrl = `https://${host}${to}`

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <BeanIcon className="h-14 w-14" />
      <p className="text-sm font-medium">Pi Browser로 이동 중…</p>
      {fallback && (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            자동 전환이 안 되면 눌러주세요:
          </p>
          <a
            href={`pi://${host}${to}`}
            className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium"
          >
            Pi Browser로 열기
          </a>
          <a
            href={httpsUrl}
            className="text-muted-foreground rounded-lg border px-3 py-2 text-xs"
          >
            브라우저에서 열기
          </a>
        </div>
      )}
    </div>
  )
}

export default function OpenPage() {
  return (
    <Suspense fallback={<p className="py-20 text-center text-sm">이동 중…</p>}>
      <OpenBridge />
    </Suspense>
  )
}

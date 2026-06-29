'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'
import { env } from '@/env'

// Pi Browser 딥링크 브리지 — 텔레그램 등 외부에서 Pi Browser로 유도.
//   텔레그램 버튼(https)으로 이 페이지가 일반 브라우저(Chrome)에서 열리면,
//   pi:// 스킴으로 리다이렉트해 Pi Browser를 연다(Chrome→pi:// 호출은 Pi Browser 실행됨).
//   pi:// 정확한 형식이 공식 문서에 없어, 가장 유력한 'pi://<전체 https URL>'을 자동 시도하고,
//   안 될 경우 폴백 버튼으로 다른 형식을 직접 눌러 확인할 수 있게 한다.
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
    const httpsUrl = `https://${host}${to}`
    // 유력 형식: pi:// + 전체 https URL (host만 넣으면 콘텐츠 로드 실패했음)
    window.location.href = `pi://${httpsUrl}`
    const timer = setTimeout(() => setFallback(true), 1500)
    return () => clearTimeout(timer)
  }, [to])

  // 폴백/진단: 자동 전환 실패 시 어느 형식이 되는지 직접 탭
  const host = normalizeHost(
    env.NEXT_PUBLIC_PI_APP_DOMAIN,
    typeof window !== 'undefined' ? window.location.host : '',
  )
  const httpsUrl = `https://${host}${to}`
  const options = [
    { label: '① Pi Browser로 열기', href: `pi://${httpsUrl}` },
    { label: '② 안 되면 이걸로', href: `pi://${host}${to}` },
    { label: '③ 그래도 안 되면 바로 열기', href: httpsUrl },
  ]

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <BeanIcon className="h-14 w-14" />
      <p className="text-sm font-medium">Pi Browser로 이동 중…</p>
      {fallback && (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            자동 전환이 안 되면 아래를 차례로 눌러보세요:
          </p>
          {options.map((o) => (
            <a
              key={o.label}
              href={o.href}
              className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium"
            >
              {o.label}
            </a>
          ))}
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

'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'

// Pi Browser 딥링크 브리지 — 외부 채널(텔레그램 등)에서 Pi Browser로 유도.
//
// 왜 필요한가:
//   텔레그램 inline 버튼 url은 http(s)/tg:// 만 허용 → pi:// 를 버튼에 직접 넣으면
//   BUTTON_URL_INVALID 로 발송 실패. 그래서 버튼은 https(이 페이지)로 보내고,
//   이 페이지가 pi:// 스킴으로 Pi Browser 앱을 연다(주문 확인엔 window.Pi 필요).
//   pi:// 형식이 안 통하거나 앱 미설치면 폴백 링크로 일반 브라우저에서 계속.
function OpenBridge() {
  const params = useSearchParams()
  const [fallback, setFallback] = useState(false)

  // 오픈 리다이렉트 방지: 내부 절대경로만 허용(외부 URL·스킴 주입 차단)
  const raw = params.get('to') ?? '/ko/store/my/sales'
  const to = /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : '/ko/store/my/sales'

  useEffect(() => {
    // pi://<host><path> 로 Pi Browser 앱 열기 시도
    window.location.href = `pi://${window.location.host}${to}`
    // 일정 시간 내 전환 안 되면(앱 미설치/스킴 미지원) 폴백 노출
    const timer = setTimeout(() => setFallback(true), 1800)
    return () => clearTimeout(timer)
  }, [to])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <BeanIcon className="h-14 w-14" />
      <p className="text-sm font-medium">Pi Browser로 이동 중…</p>
      {fallback && (
        <div className="text-muted-foreground space-y-2 text-xs">
          <p>
            자동으로 열리지 않으면 Pi Browser 앱이 설치되어 있는지 확인하세요.
          </p>
          <a href={to} className="text-primary underline">
            이 브라우저에서 계속하기
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

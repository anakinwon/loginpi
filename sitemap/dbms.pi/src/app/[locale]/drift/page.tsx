// 모델↔DB 정합 — /drift. PRD 12 §5-3 DDL 적용 대조·§5-4 인덱스 설계 효과(탐지·측정만, 반영은 schema.pi).
// 서버는 세션을 보지 않는다(redirect 금지) — LoginGate(클라이언트)가 로그인 유도, 본체는 DriftPanel
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LoginGated } from '@/components/login-gate'
import { DriftPanel } from '@/components/drift/drift-panel'

export default async function DriftPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('drift')
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      {/* useSearchParams(?link=&conn=) 는 Suspense 경계 필요 */}
      <Suspense>
        <LoginGated><DriftPanel /></LoginGated>
      </Suspense>
    </div>
  )
}

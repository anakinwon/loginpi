// PiCDC·PipeLine — /pipeline. PRD 12 §7-1 원천 사전 점검·§7-2 파이프라인 정의(설계 전용, D6 — 실행·감시는 워커 확정 후).
// 서버는 세션을 보지 않는다(redirect 금지) — LoginGate(클라이언트)가 로그인 유도, 본체는 PipelinePanel
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LoginGated } from '@/components/login-gate'
import { PipelinePanel } from '@/components/pipeline/pipeline-panel'

export default async function PipelinePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('pipeline')
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      {/* useSearchParams(?link=&conn=) 는 Suspense 경계 필요 */}
      <Suspense>
        <LoginGated><PipelinePanel /></LoginGated>
      </Suspense>
    </div>
  )
}

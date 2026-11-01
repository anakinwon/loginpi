// 성능 관측 — /perf (PRD 12 §3). 서버는 세션을 보지 않는다(redirect 금지) — 로그인·연결 선택·탭 조회는 클라이언트 PerfView
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { PerfView } from '@/components/perf/perf-view'

export default async function PerfPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('perf')
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      <PerfView />
    </div>
  )
}

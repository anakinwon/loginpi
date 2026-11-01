// DB 운영 안전 — /ops (PRD 12 §9, 읽기 전용 진단). 서버는 세션을 보지 않는다(redirect 금지) — 로그인·연결 선택·진단은 클라이언트 OpsView
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { OpsView } from '@/components/ops/ops-view'

export default async function OpsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('ops')
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      <OpsView />
    </div>
  )
}

// DBA 학습 — /learn (PRD 12 §10 : SQLP·DAP 실습·튜닝 사례집·DBMS 비교 사전). 서버는 세션을 보지 않는다(redirect 금지 — 클라이언트 LoginGate)
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Learn } from '@/components/learn/learn'

export default async function LearnPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('learn')
  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      {/* LinkPicker(useSearchParams) — 정적 렌더 경계 */}
      <Suspense>
        <Learn />
      </Suspense>
    </div>
  )
}

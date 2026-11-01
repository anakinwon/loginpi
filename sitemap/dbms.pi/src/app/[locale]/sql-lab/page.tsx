// SQL 튜닝 랩 — /sql-lab (PRD 12 §2 : 실행계획 뷰어·계획 비교·안티패턴 점검·AI 권고 자리). 서버는 세션을 보지 않는다(redirect 금지 — 클라이언트 LoginGate)
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SqlLab } from '@/components/sql-lab/sql-lab'

export default async function SqlLabPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('sqlLab')
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm break-keep">{t('intro')}</p>
      {/* useSearchParams(?link=&conn=) — 정적 렌더 경계 */}
      <Suspense>
        <SqlLab />
      </Suspense>
    </div>
  )
}

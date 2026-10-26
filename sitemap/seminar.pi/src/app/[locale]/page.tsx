// seminar.pi 홈 = S1 세미나 목록(PRD F-03, UI 설계서 5절). 제작 진행 현황은 /progress 로 옮김(아소카 결정(마스터 위임 2026-10-26))
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { SeminarList } from '@/components/seminar/seminar-list'

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('home')
  return (
    <div className="space-y-6 py-2">
      <section className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </section>
      <SeminarList />
    </div>
  )
}

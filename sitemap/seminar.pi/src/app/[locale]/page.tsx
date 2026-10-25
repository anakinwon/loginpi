// seminar.pi 홈 — 소개 + 제작 진행 현황(기능별 워크플로). 세미나 목록은 PRD F-03 에서
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { ProgressBoard } from '@/components/progress-board'

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('home')
  return (
    <div className="space-y-10 py-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </section>
      <ProgressBoard />
    </div>
  )
}

// seminar.pi 홈 — M0 단계 자리 표시(세미나 목록은 PRD F-03 에서)
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'

export default function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('home')
  return (
    <section className="space-y-2 py-10">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
    </section>
  )
}

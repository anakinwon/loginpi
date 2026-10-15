// 홈 — 스캐폴드 확인 페이지(개발 환경 준비). 실제 화면은 docs/da 설계서(메타시스템 구축 설계서) 1단계 화면부터 교체
import { getTranslations, setRequestLocale } from 'next-intl/server'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('home')

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <p className="text-sm">{t('ready')}</p>
    </section>
  )
}

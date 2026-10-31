// 내 사이트 — 서버는 세션을 보지 않고(redirect 금지) 클라이언트 게이트(MySites → LoginGate)가 piFetch 로 조회
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { MySites } from '@/components/my-sites'

export default async function MePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('me')
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <MySites />
    </div>
  )
}

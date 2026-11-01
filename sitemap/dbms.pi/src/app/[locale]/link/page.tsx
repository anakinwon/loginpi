// 계정 연동 — /link. Pi Browser(Pi 세션)는 연동 코드 발급, 일반 브라우저(Google 세션·미연동)는 코드 입력, 연동 완료면 상태 표시.
// 서버는 세션을 보지 않는다(redirect 금지) — 분기는 클라이언트 LinkPanel(useAppUser)
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LinkPanel } from '@/components/link-panel'

export default async function LinkPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('link')
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('intro')}</p>
      <LinkPanel />
    </div>
  )
}

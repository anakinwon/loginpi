// 계정 연동 — /link. Pi Browser(Pi 세션)는 연동 코드 발급, 일반 브라우저(Google 세션·미연동)는 코드 입력, 연동 완료면 상태 표시.
// 서버는 세션을 보지 않는다(redirect 금지) — 분기는 클라이언트 LinkPanel(useAppUser)
import { useTranslations } from 'next-intl'
import { AppLocaleSwitcher } from '@/components/locale-switcher'
import { Link } from '@/i18n/navigation'
import { LinkPanel } from '../google-auth'

export default function LinkPage() {
  const t = useTranslations()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-10">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('link.title')}</h1>
        <AppLocaleSwitcher />
      </div>
      <p className="text-sm text-gray-600">{t('link.desc')}</p>
      <LinkPanel />
      <Link href="/" className="text-sm underline">
        <span className="inline-block rtl:rotate-180">←</span> {t('common.home')}
      </Link>
    </main>
  )
}

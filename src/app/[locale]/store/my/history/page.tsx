import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { ClientMyHistory } from '@/components/store/client-my-history'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('history.title') }
}

// SCR-07 거래 내역 — redirect 금지, 서버 세션(Google 포함) + Pi 로그인 OR 게이트
export default async function MyHistoryPage() {
  const t = await getTranslations('store')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToList')}
      </Link>
      <h1 className="text-xl font-bold">{t('history.title')}</h1>
      <ClientMyHistory serverAuthed={!!user} />
    </div>
  )
}

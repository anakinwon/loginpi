import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { ClientSubscribe } from '@/components/subscribe/client-subscribe'

export async function generateMetadata() {
  const t = await getTranslations('subscribe')
  return { title: t('title') }
}

// 상품별 구독 신청 — redirect 금지(게이트 패턴). 구독료=Bean 차감(내부)이라 window.Pi 불필요.
export default async function SubscribePage() {
  const t = await getTranslations('subscribe')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <Link href="/" className="text-muted-foreground text-sm hover:underline">
        ← {t('backHome')}
      </Link>
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <ClientSubscribe serverAuthed={!!user} />
    </div>
  )
}

import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { ClientSubscribe } from '@/components/subscribe/client-subscribe'

export async function generateMetadata() {
  const t = await getTranslations('subscribe')
  return { title: t('title') }
}

// 구독 신청 — redirect 금지 (Pi Browser 무한 루프 방지)
// 구독 결제는 Bean 차감(내부) → window.Pi 불필요하지만, 게이트 패턴은 일관성 위해 유지
export default async function SubscribePage() {
  const t = await getTranslations('subscribe')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <Link
        href="/"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backHome')}
      </Link>
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <ClientSubscribe serverAuthed={!!user} />
    </div>
  )
}

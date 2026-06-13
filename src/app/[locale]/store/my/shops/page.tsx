import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { ClientMyShops } from '@/components/store/client-my-shops'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('shop.title') }
}

// SCR-08 매장 관리 — redirect 금지(Pi Browser 무한 루프 방지). 서버 세션 + Pi 로그인 OR 게이트
export default async function MyShopsPage() {
  const t = await getTranslations('store')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Link
        href="/store/my/items"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('myItemsTitle')}
      </Link>
      <h1 className="text-xl font-bold">{t('shop.title')}</h1>
      <ClientMyShops serverAuthed={!!user} />
    </div>
  )
}

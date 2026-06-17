import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { StoreNav } from '@/components/store/store-nav'
import { ClientMyItems } from '@/components/store/client-my-items'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('myItemsTitle') }
}

// SCR-03 내 상품 관리 — redirect 금지 (Pi Browser 무한 루프 방지)
// 서버 세션(Google 쿠키 포함) 확인 결과를 클라이언트에 전달 → Pi 로그인과 OR 게이트
export default async function MyItemsPage() {
  const t = await getTranslations('store')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StoreNav active="items" />
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToList')}
      </Link>
      <h1 className="text-xl font-bold">{t('myItemsTitle')}</h1>
      <ClientMyItems serverAuthed={!!user} />
    </div>
  )
}

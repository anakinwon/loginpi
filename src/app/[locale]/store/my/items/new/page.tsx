import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { StoreItemForm } from '@/components/store/store-item-form'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('newItemTitle') }
}

// SCR-04 상품 등록 — redirect 금지, 서버 세션(Google 포함) + Pi 로그인 OR 게이트
// ?shop=<shopId> 쿼리가 있으면 소속 매장 미리 선택 (매장 관리 → "+ 메뉴 추가" 동선)
export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>
}) {
  const t = await getTranslations('store')
  const user = await getSessionUser()
  const { shop } = await searchParams

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <Link
        href="/store/my/items"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('myItemsTitle')}
      </Link>
      <h1 className="text-xl font-bold">{t('newItemTitle')}</h1>
      <StoreItemForm serverAuthed={!!user} defaultShopId={shop} />
    </div>
  )
}

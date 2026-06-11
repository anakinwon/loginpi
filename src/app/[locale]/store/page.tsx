import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { StoreItemList } from '@/components/store/store-item-list'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('title') }
}

// SCR-01 상품 목록 — Guest 포함 공개 (인증 불필요 → 게이트 없음)
export default async function StorePage() {
  const t = await getTranslations('store')

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🛍️ {t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link href="/store/my/items" className="text-primary hover:underline">
            {t('navMyItems')}
          </Link>
          <Link href="/store/my/sales" className="text-primary hover:underline">
            {t('navSales')}
          </Link>
          <Link
            href="/store/my/orders"
            className="text-primary hover:underline"
          >
            {t('navOrders')}
          </Link>
        </nav>
      </div>
      <StoreItemList />
    </div>
  )
}

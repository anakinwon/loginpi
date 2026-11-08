import { getTranslations } from 'next-intl/server'
import { StoreNav } from '@/components/store/store-nav'
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
        <StoreNav />
      </div>
      <StoreItemList />
    </div>
  )
}

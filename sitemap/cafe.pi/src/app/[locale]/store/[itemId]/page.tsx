import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { StoreItemDetail } from '@/components/store/store-item-detail'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('title') }
}

// SCR-02 상품 상세 — 공개. 구매 액션은 클라이언트(usePiAuth)에서 처리
export default async function StoreItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { itemId } = await params
  const t = await getTranslations('store')

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToList')}
      </Link>
      <StoreItemDetail itemId={itemId} />
    </div>
  )
}

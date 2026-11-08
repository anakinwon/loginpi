import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { StoreItemForm } from '@/components/store/store-item-form'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('newP2PTitle') }
}

// SCR-04 중고직거래 상품 등록 (매장 미연결) — redirect 금지(Pi Browser 무한루프 방지), 클라이언트 게이트
export default async function NewP2PItemPage() {
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
      <h1 className="text-xl font-bold">{t('newP2PTitle')}</h1>
      <StoreItemForm serverAuthed={!!user} mode="p2p" />
    </div>
  )
}

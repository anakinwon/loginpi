import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ClientCart } from '@/components/store/client-cart'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('cart.title') }
}

// SCR-09 장바구니(카트) — 카트는 클라이언트 전역 스토어, 로그인 불필요(체크아웃 시 게이트)
export default async function CartPage() {
  const t = await getTranslations('store')

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToList')}
      </Link>
      <ClientCart />
    </div>
  )
}

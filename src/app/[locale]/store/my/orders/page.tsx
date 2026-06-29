import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { StoreNav } from '@/components/store/store-nav'
import { ClientMyOrders } from '@/components/store/client-my-orders'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('ordersTitle') }
}

// SCR-06 구매 주문 관리 — redirect 금지, 서버 세션(Google 포함) + Pi 로그인 OR 게이트
export default async function MyOrdersPage() {
  const t = await getTranslations('store')
  const user = await getSessionUser()
  // BEAN 모드면 후기(Bean 보상) 영역 숨김 — 첫 렌더부터 확정값(깜빡임 방지)
  const feeMode = await getActiveFeeMode()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StoreNav active="orders" />
      <Link
        href="/store"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t('backToList')}
      </Link>
      <h1 className="text-xl font-bold">{t('ordersTitle')}</h1>
      <ClientMyOrders role="buyer" serverAuthed={!!user} feeMode={feeMode} />
    </div>
  )
}

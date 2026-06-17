import { getTranslations } from 'next-intl/server'
import { getSessionUser } from '@/lib/auth-check'
import { StoreNav } from '@/components/store/store-nav'
import { ClientMyOrders } from '@/components/store/client-my-orders'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('navSales') }
}

// SCR-05 판매 관리 — 받은 주문(주문 발생 건)만 표시. redirect 금지, 서버 세션 OR Pi 로그인 게이트
export default async function MySalesPage() {
  const t = await getTranslations('store')
  const user = await getSessionUser()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <StoreNav active="sales" />
      <h1 className="text-xl font-bold">{t('navSales')}</h1>
      <ClientMyOrders role="seller" serverAuthed={!!user} />
    </div>
  )
}

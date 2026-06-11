import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ClientMyOrders } from '@/components/store/client-my-orders'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('ordersTitle') }
}

// SCR-06 구매 주문 관리 — redirect 금지, 인증은 ClientMyOrders(usePiAuth) 게이트가 처리
export default async function MyOrdersPage() {
  const t = await getTranslations('store')

  return (
    <div className='mx-auto max-w-3xl space-y-4 p-4 md:p-6'>
      <Link href='/store' className='text-muted-foreground text-sm hover:underline'>
        ← {t('backToList')}
      </Link>
      <h1 className='text-xl font-bold'>{t('ordersTitle')}</h1>
      <ClientMyOrders role='buyer' />
    </div>
  )
}

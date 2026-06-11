import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { getSessionUser } from '@/lib/auth-check'
import { ClientMyOrders } from '@/components/store/client-my-orders'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('ordersTitle') }
}

// SCR-06 구매 주문 관리 — redirect 금지, 서버 세션(Google 포함) + Pi 로그인 OR 게이트
export default async function MyOrdersPage() {
  const t = await getTranslations('store')
  const user = await getSessionUser()

  return (
    <div className='mx-auto max-w-3xl space-y-4 p-4 md:p-6'>
      <Link href='/store' className='text-muted-foreground text-sm hover:underline'>
        ← {t('backToList')}
      </Link>
      <h1 className='text-xl font-bold'>{t('ordersTitle')}</h1>
      <ClientMyOrders role='buyer' serverAuthed={!!user} />
    </div>
  )
}

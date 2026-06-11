import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { StoreItemForm } from '@/components/store/store-item-form'

export async function generateMetadata() {
  const t = await getTranslations('store')
  return { title: t('newItemTitle') }
}

// SCR-04 상품 등록 — redirect 금지, 인증은 StoreItemForm(usePiAuth) 게이트가 처리
export default async function NewItemPage() {
  const t = await getTranslations('store')

  return (
    <div className='mx-auto max-w-3xl space-y-4 p-4 md:p-6'>
      <Link href='/store/my/items' className='text-muted-foreground text-sm hover:underline'>
        ← {t('myItemsTitle')}
      </Link>
      <h1 className='text-xl font-bold'>{t('newItemTitle')}</h1>
      <StoreItemForm />
    </div>
  )
}

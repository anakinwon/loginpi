import { getTranslations } from 'next-intl/server'
import { BatchRunner } from '@/components/admin/batch-runner'

export async function generateMetadata() {
  const t = await getTranslations('admin.batch')
  return { title: `${t('title')} — Admin` }
}

export default async function BatchPage() {
  const t = await getTranslations('admin.batch')

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>{t('title')}</h1>
        <p className='text-muted-foreground mt-1 text-sm'>{t('desc')}</p>
      </div>
      <BatchRunner />
    </div>
  )
}

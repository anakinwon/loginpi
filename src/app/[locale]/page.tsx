import { getTranslations } from 'next-intl/server'
import { StatsDashboard } from '@/components/admin/stats/stats-dashboard'

export async function generateMetadata() {
  const t = await getTranslations('adminStats')
  return { title: t('homeTitle') }
}

export default async function HomePage() {
  const t = await getTranslations('adminStats')

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t('homeTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>
      <StatsDashboard />
    </div>
  )
}

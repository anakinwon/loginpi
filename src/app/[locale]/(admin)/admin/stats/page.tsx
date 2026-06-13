import { getTranslations } from 'next-intl/server'
import { StatsDashboard } from '@/components/admin/stats/stats-dashboard'

export async function generateMetadata() {
  const t = await getTranslations('adminStats')
  return { title: `${t('adminTitle')} — Admin` }
}

export default async function StatsPage() {
  const t = await getTranslations('adminStats')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('adminTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>
      <StatsDashboard />
    </div>
  )
}

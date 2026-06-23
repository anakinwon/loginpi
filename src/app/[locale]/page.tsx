import { getTranslations } from 'next-intl/server'
import { StatsDashboard } from '@/components/admin/stats/stats-dashboard'
import { Link } from '@/i18n/navigation'
import { BeanIcon } from '@/components/ui/bean-icon'

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

      {/* 매장 선착순 온보딩 이벤트 진입점 (선착순 100매장) */}
      <Link
        href="/campaign"
        className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 transition-colors hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
      >
        <div>
          <p className="text-sm font-semibold">🏪 매장 선착순 온보딩 이벤트</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            선착순 100매장 · 매장 가입 + 상품 등록 + 텔레그램 연동 시 10,000{' '}
            <BeanIcon className="inline-block h-3.5 w-3.5 align-text-bottom" />{' '}
            신청
          </p>
        </div>
        <span className="text-primary shrink-0 text-sm font-medium">
          받기 →
        </span>
      </Link>

      <StatsDashboard />
    </div>
  )
}

import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { StatsDashboard } from '@/components/admin/stats/stats-dashboard'
import { TechWhitepaper } from '@/components/home/tech-whitepaper'
import { UserManual } from '@/components/home/user-manual'

export async function generateMetadata() {
  const t = await getTranslations('adminStats')
  return { title: t('homeTitle') }
}

export default async function HomePage() {
  const t = await getTranslations('adminStats')
  const tf = await getTranslations('faq')

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pt-3 pb-8">
      <div className="space-y-2">
        <TechWhitepaper />
        <UserManual />
      </div>

      <div>
        <h1 className="text-2xl font-bold">{t('homeTitle')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <StatsDashboard />

      {/* 푸터 — 고객지원·약관 노출 */}
      <footer className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t pt-4 text-xs">
        <Link href="/support" className="hover:underline">
          {tf('supportTitle')}
        </Link>
        <span>·</span>
        <Link href="/docs/legal/terms" className="hover:underline">
          {tf('terms')}
        </Link>
        <span>·</span>
        <Link href="/docs/legal/privacy" className="hover:underline">
          {tf('privacy')}
        </Link>
      </footer>
    </div>
  )
}

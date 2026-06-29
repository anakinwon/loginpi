'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin/monitor', labelKey: 'monitor' },
  { href: '/admin/analytics', labelKey: 'analytics' },
  { href: '/admin/stats', labelKey: 'stats' },
  { href: '/admin/users', labelKey: 'users' },
  { href: '/admin/consents', labelKey: 'consents' },
  { href: '/admin/reports', labelKey: 'reports' },
  { href: '/admin/payments', labelKey: 'payments' },
  { href: '/admin/links', labelKey: 'links' },
  { href: '/admin/board', labelKey: 'board' },
  { href: '/admin/batch', labelKey: 'batch' },
  { href: '/admin/logs', labelKey: 'logs' },
  { href: '/admin/checklist', labelKey: 'checklist' },
  { href: '/admin/mainnet', labelKey: 'mainnet' },
] as const

const STD_NAV = [
  { href: '/admin/std/words', labelKey: 'stdWords' },
  { href: '/admin/std/domains', labelKey: 'stdDomains' },
  { href: '/admin/std/terms', labelKey: 'stdTerms' },
  { href: '/admin/std/ddl', labelKey: 'stdDdl' },
  { href: '/admin/std/audit', labelKey: 'stdAudit' },
  { href: '/admin/std/approvals', labelKey: 'stdApprovals' },
] as const

const CHAT_NAV = [
  { href: '/admin/themes', labelKey: 'themes' },
  { href: '/admin/ui-themes', labelKey: 'uiThemes' },
  { href: '/admin/subscriptions', labelKey: 'subscriptions' },
  { href: '/admin/stickers', labelKey: 'stickers' },
  { href: '/admin/store/settle', labelKey: 'settle' },
  { href: '/admin/feedback', labelKey: 'feedback' },
  { href: '/admin/feedback/ctgr-items', labelKey: 'feedbackCtgrItems' },
] as const

const STORE_NAV = [
  { href: '/admin/store/categories', labelKey: 'storeCategories' },
  { href: '/admin/store/distance-cfg', labelKey: 'storeDistCfg' },
] as const

const EVENT_NAV = [
  { href: '/admin/event/gifts', labelKey: 'eventGifts' },
  { href: '/admin/event/exclude', labelKey: 'eventExclude' },
] as const

const BEAN_NAV = [
  { href: '/admin/token', labelKey: 'beanToken' },
  { href: '/admin/token/transactions', labelKey: 'beanTxn' },
  { href: '/admin/token/wallets', labelKey: 'beanWallets' },
  { href: '/admin/token/top-users', labelKey: 'beanTopUsers' },
  { href: '/admin/token/audit', labelKey: 'beanAudit' },
  { href: '/admin/token/subscr-pricing', labelKey: 'subscrPricing' },
  { href: '/admin/token/fee-plan', labelKey: 'beanFeePlan' },
  { href: '/admin/token/tip-presets', labelKey: 'beanTipPresets' },
  { href: '/admin/campaign', labelKey: 'campaign' },
] as const

const I18N_NAV = [{ href: '/admin/i18n', labelKey: 'i18n' }] as const

const OPS_NAV = [
  { href: '/admin/deploy', labelKey: 'deploy' },
  { href: '/admin/db-switch', labelKey: 'dbSwitch' },
] as const

function NavItem({
  href,
  label,
  pathname,
}: {
  href: string
  label: string
  pathname: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-md px-3 py-2 text-sm transition-colors',
        pathname === href
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )
}

export function AdminSidebar() {
  const t = useTranslations('admin.nav')
  const pathname = usePathname()

  return (
    <aside className="bg-muted/40 hidden w-48 shrink-0 flex-col border-r md:flex">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">{t('title')}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('stdSection')}
        </p>
        {STD_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('chatSection')}
        </p>
        {CHAT_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('storeSection')}
        </p>
        {STORE_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('eventSection')}
        </p>
        {EVENT_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('beanSection')}
        </p>
        {BEAN_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('i18nSection')}
        </p>
        {I18N_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}

        <p className="text-muted-foreground px-3 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase">
          {t('opsSection')}
        </p>
        {OPS_NAV.map(({ href, labelKey }) => (
          <NavItem
            key={href}
            href={href}
            label={t(labelKey)}
            pathname={pathname}
          />
        ))}
        {/* 요금제 모드(Bean↔Pi) — i18n 키는 옆 세션 ko.json 작업과 충돌 회피 위해
            임시 라벨 하드코딩(추후 admin.nav.feeMode 키로 정식화). PRD_24 */}
        <NavItem
          href="/admin/fee-mode"
          label="요금제 모드"
          pathname={pathname}
        />
      </nav>
      <div className="border-t p-3">
        <Link
          href="/"
          className="text-muted-foreground text-xs hover:underline"
        >
          {t('backHome')}
        </Link>
      </div>
    </aside>
  )
}

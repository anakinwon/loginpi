'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin/stats', labelKey: 'stats' },
  { href: '/admin/users', labelKey: 'users' },
  { href: '/admin/payments', labelKey: 'payments' },
  { href: '/admin/links', labelKey: 'links' },
  { href: '/admin/board', labelKey: 'board' },
  { href: '/admin/batch', labelKey: 'batch' },
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
  { href: '/admin/subscriptions', labelKey: 'subscriptions' },
  { href: '/admin/stickers', labelKey: 'stickers' },
] as const

const STORE_NAV = [
  { href: '/admin/store/categories', labelKey: 'storeCategories' },
] as const

const EVENT_NAV = [
  { href: '/admin/event/gifts', labelKey: 'eventGifts' },
  { href: '/admin/event/exclude', labelKey: 'eventExclude' },
] as const

const I18N_NAV = [{ href: '/admin/i18n', labelKey: 'i18n' }] as const

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

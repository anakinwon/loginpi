import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { SalesNotiBadge } from './sales-noti-badge'
import { BeanIcon } from '@/components/ui/bean-icon'

// 스토어 공용 상단 네비 — 목록·판매관리·구매내역·거래내역 등 하위 페이지에서 공유(단일 소스).
// active로 현재 페이지를 강조한다.
type StoreNavKey = 'nearby' | 'items' | 'sales' | 'orders' | 'history' | 'bean'

export async function StoreNav({ active }: { active?: StoreNavKey }) {
  const t = await getTranslations('store')
  const links: { key: StoreNavKey; href: string; label: string }[] = [
    { key: 'nearby', href: '/map', label: t('nearbyNav') },
    { key: 'items', href: '/store/my/items', label: t('navMyItems') },
    { key: 'sales', href: '/store/my/sales', label: t('navSales') },
    { key: 'orders', href: '/store/my/orders', label: t('navOrders') },
    { key: 'history', href: '/store/my/history', label: t('navHistory') },
    { key: 'bean', href: '/bean', label: t('navBean') },
  ]
  return (
    <nav className="flex flex-wrap gap-3 text-sm">
      {links.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          className={
            active === l.key
              ? 'text-foreground font-semibold underline'
              : 'text-primary hover:underline'
          }
        >
          {l.key === 'bean' ? (
            <span className="inline-flex items-center gap-1">
              <BeanIcon className="inline-block h-5 w-5" />
              {l.label.replace(/^☕\s*/, '')}
            </span>
          ) : (
            l.label
          )}
          {l.key === 'sales' && <SalesNotiBadge />}
        </Link>
      ))}
    </nav>
  )
}

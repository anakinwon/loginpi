'use client'

// dbms.pi 기능 메뉴 — 헤더 아래 2줄 : 1줄 = 묶음 4개(모니터링·정합·레이크·관리), 2줄 = 현재 묶음의 하위 기능(홈에서는 숨김).
//  묶음 탭은 그 묶음의 첫 기능으로 이동. 모바일 = 각 줄 안에서만 가로 스크롤(페이지 가로 스크롤 없음)
//  각 페이지가 스스로 로그인 게이트를 하므로 로그인 여부와 관계없이 노출
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { FEATURE_GROUPS, isActive } from '@/lib/features'

const ROW =
  'flex w-full gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:px-8'

export function FeatureNav() {
  const t = useTranslations('nav')
  const path = usePathname()
  const cur = FEATURE_GROUPS.find((g) =>
    g.items.some((i) => isActive(path, i.href)),
  )
  return (
    <nav aria-label={t('label')} className="border-t border-white/5">
      <ul className={`${ROW} py-2`}>
        {FEATURE_GROUPS.map((g) => {
          const on = g === cur
          return (
            <li key={g.key} className="shrink-0">
              <Link
                href={g.items[0].href}
                aria-current={on ? 'true' : undefined}
                className={`inline-block rounded-lg px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap ${on ? 'bg-accent text-white' : 'bg-surface text-muted-foreground hover:text-foreground'}`}
              >
                {t(`groups.${g.key}`)}
              </Link>
            </li>
          )
        })}
      </ul>
      {cur && (
        <ul
          className={`${ROW} border-t border-white/5 py-1.5`}
          aria-label={t(`groups.${cur.key}`)}
        >
          {cur.items.map((f) => {
            const on = isActive(path, f.href)
            return (
              <li key={f.key} className="shrink-0">
                <Link
                  href={f.href}
                  aria-current={on ? 'page' : undefined}
                  className={`inline-block rounded-full px-3 py-1 text-sm whitespace-nowrap ${on ? 'text-accent bg-accent/15 font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t(f.key)}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}

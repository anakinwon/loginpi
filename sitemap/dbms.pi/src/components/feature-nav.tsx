'use client'

// dbms.pi 기능 메뉴 — 헤더 아래 한 줄. 데스크톱 = 가로 나열, 모바일 = 이 nav 안에서만 가로 스크롤(페이지 가로 스크롤 없음)
//  각 페이지가 스스로 로그인 게이트를 하므로 로그인 여부와 관계없이 노출
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { FEATURES } from '@/lib/features'

export function FeatureNav() {
  const t = useTranslations('nav')
  const path = usePathname()
  return (
    <nav aria-label={t('label')} className="border-t border-white/5">
      <ul className="flex w-full gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 lg:flex-wrap lg:px-8">
        {FEATURES.map((f) => {
          const on = path === f.href || path.startsWith(`${f.href}/`)
          return (
            <li key={f.key} className="shrink-0">
              <Link
                href={f.href}
                aria-current={on ? 'page' : undefined}
                className={`inline-block rounded-full px-3 py-1 text-sm whitespace-nowrap ${on ? 'bg-accent font-semibold text-white' : 'bg-surface text-muted-foreground hover:text-foreground'}`}
              >
                {t(f.key)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

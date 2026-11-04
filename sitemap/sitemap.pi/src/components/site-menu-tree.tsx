'use client'

// 사이트 메뉴 지도(표 탭 펼침 행) — 상위→하위 메뉴를 네이티브 <details> 로 접고 펼친다(JS 없이 키보드·스크린리더 지원).
// 권한이 필요한 화면도 링크는 걸고 배지로만 알린다(마스터 지시 2026-11-04). 다른 사이트 링크는 이동 안내(onLeave)를 거친다 — 외부 이동은 클릭 + 안내 필수(MAINNET A-6)
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { MenuNode } from '@/lib/site-menu'

const AUTH_CLS: Record<string, string> = {
  login: 'border-sky-300/40 text-sky-200',
  admin: 'border-rose-300/40 text-rose-200',
  plan: 'border-amber-300/40 text-amber-200',
  owner: 'border-violet-300/40 text-violet-200',
}

export function SiteMenuTree({
  menus,
  base,
  onLeave,
}: {
  menus: MenuNode[]
  base: string // 다른 사이트 운영 주소, '' = 이 사이트(sitemap.pi) 내부 링크
  onLeave: (url: string) => void
}) {
  const t = useTranslations('siteMenu')
  const locale = useLocale()

  const label = (n: MenuNode) => n.l ?? (n.g ? t(n.g) : n.p)

  // 컴포넌트가 아닌 렌더 함수 — 부모가 다시 그려져도(이동 안내 열림 등) <details> 펼침 상태가 유지되게(리마운트 방지)
  const badge = (n: MenuNode) =>
    n.a === 'public' ? null : (
      <span
        className={`rounded border px-1 text-[10px] leading-4 ${AUTH_CLS[n.a] ?? ''}`}
        title={n.n}
      >
        {t(`auth.${n.a}`)}
      </span>
    )

  // 링크 — 동적 경로([x])는 가장 가까운 정적 상위 화면(h)으로, 그 사실을 title 로 안내
  const go = (n: MenuNode, children: React.ReactNode) => {
    if (!n.p) return <>{children}</>
    const path = n.h ?? n.p
    const title = n.h ? t('dynHint', { path: n.p }) : undefined
    const cls = 'hover:text-white hover:underline'
    if (!base)
      return (
        <Link href={path} className={cls} title={title}>
          {children}
        </Link>
      )
    // 다른 앱도 기본 언어(ko)는 접두사 없음(next-intl as-needed)
    const url =
      `${base}${locale === 'ko' ? '' : `/${locale}`}${path === '/' ? '' : path}` ||
      base
    return (
      <button
        type="button"
        className={`${cls} text-left`}
        title={title}
        onClick={() => onLeave(url)}
      >
        {children}
      </button>
    )
  }

  const row = (n: MenuNode) => (
    <span className="flex flex-wrap items-center gap-1.5">
      {go(n, label(n))}
      {badge(n)}
    </span>
  )

  const nodes = (ns: MenuNode[], depth: number): React.ReactNode => (
    <ul
      className={
        depth
          ? 'mt-1 ml-3 space-y-1 border-l border-white/10 pl-3'
          : 'space-y-1'
      }
    >
      {ns.map((n, i) => (
        <li key={`${n.p ?? n.g ?? ''}-${i}`}>
          {n.c?.length ? (
            // 첫 단계는 펼친 상태로 시작 — 한눈에 상위 메뉴를 보고, 하위는 필요할 때 펼친다
            <details open={depth === 0 && !n.g}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 marker:hidden">
                <span
                  aria-hidden
                  className="inline-block w-3 text-white/50 transition-transform [details[open]>summary>&]:rotate-90"
                >
                  ▸
                </span>
                {/* 묶음 자체 화면이 있으면 이름이 링크, 없으면 펼침 글자 */}
                {row(n)}
                <span className="text-[10px] text-white/40 tabular-nums">
                  {n.c.length}
                </span>
              </summary>
              {nodes(n.c, depth + 1)}
            </details>
          ) : (
            <span className="flex items-center gap-1.5 pl-[18px]">
              {row(n)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <nav aria-label={t('label')} className="text-sm text-white/80">
      {nodes(menus, 0)}
    </nav>
  )
}

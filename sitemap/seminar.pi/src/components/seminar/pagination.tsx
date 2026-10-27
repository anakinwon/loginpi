'use client'

// 반응형 페이지 이동(데이터 패칭 표준 ①) — 모바일 = 이전·쪽/전체·다음 축약, 데스크톱(sm 이상) = 번호 창(최대 7개) 확장.
// 공용 패키지에 페이지네이션 컴포넌트가 없어 앱 안에 작게 둔다(sitemap.pi 파일 복제 아님)
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { clampPage } from '@/lib/seminar-rules'

const WINDOW = 7

// 현재 쪽을 가운데 두는 번호 창
export function pageWindow(page: number, pages: number) {
  const start = Math.max(1, Math.min(page - Math.floor(WINDOW / 2), pages - WINDOW + 1))
  return Array.from({ length: Math.min(WINDOW, pages) }, (_, i) => start + i)
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (p: number) => void
}) {
  const t = useTranslations('list')
  // 목록이 줄어 현재 쪽이 마지막 쪽을 넘으면 마지막 쪽으로(빈 쪽에 버튼 없이 갇히지 않게)
  const fit = clampPage(page, pages)
  useEffect(() => {
    if (fit !== page) onPage(fit)
  }, [fit, page, onPage])
  if (pages <= 1) return null
  const btn = 'bg-surface-raised inline-grid h-10 min-w-10 place-items-center rounded-lg px-3 text-sm disabled:opacity-40'
  return (
    <nav aria-label={t('pager')} className="flex items-center justify-center gap-2">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('prev')}
      </button>
      <span className="text-muted-foreground text-sm sm:hidden">
        {t('pageOf', { page, pages })}
      </span>
      <span className="hidden gap-1 sm:flex">
        {pageWindow(page, pages).map((p) => (
          <button
            key={p}
            type="button"
            className={p === page ? `${btn} bg-accent! font-semibold text-white` : btn}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
      </span>
      <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('next')}
      </button>
    </nav>
  )
}

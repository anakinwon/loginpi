'use client'

// 반응형 페이지 네비게이션 — 모바일: 이전·현재/전체·다음 축약 / sm 이상: 번호 창(현재 ±2 + 처음·끝)
import { useTranslations } from 'next-intl'

export function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}) {
  const t = useTranslations('pagination')
  const last = Math.max(1, Math.ceil(total / pageSize))
  if (last <= 1) return null

  const nums = new Set([1, last])
  for (let p = page - 2; p <= page + 2; p++)
    if (p >= 1 && p <= last) nums.add(p)
  const pages = [...nums].sort((a, b) => a - b)

  return (
    <nav
      aria-label={t('label')}
      className="mt-4 flex items-center justify-center gap-1"
    >
      <button
        className="btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {t('prev')}
      </button>
      <span className="px-2 text-sm sm:hidden">
        {page} / {last}
      </span>
      <span className="hidden items-center gap-1 sm:flex">
        {pages.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - pages[i - 1] > 1 && <span className="px-1">…</span>}
            <button
              className={p === page ? 'btn btn-primary' : 'btn'}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          </span>
        ))}
      </span>
      <button
        className="btn"
        disabled={page >= last}
        onClick={() => onChange(page + 1)}
      >
        {t('next')}
      </button>
    </nav>
  )
}

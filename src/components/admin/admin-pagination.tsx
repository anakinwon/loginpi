'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface Props {
  page: number
  totalPages: number
  onPage: (p: number) => void
}

// 반응형 페이지네이션 — 첫·…·현재±1·…·끝 (ellipsis) 패턴.
// 페이지 수와 무관하게 버튼 최대 ~7개 → 모바일에서도 넘치지 않음. flex-wrap 이중 안전망.
function buildPages(page: number, total: number): (number | 'gap')[] {
  const nums = new Set<number>([1, total, page, page - 1, page + 1])
  const sorted = [...nums].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) out.push('gap')
    out.push(p)
    prev = p
  }
  return out
}

export function AdminPagination({ page, totalPages, onPage }: Props) {
  const tc = useTranslations('common')
  if (totalPages <= 1) return null

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {tc('prev')}
      </Button>

      {buildPages(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span
            key={`gap-${i}`}
            className="text-muted-foreground px-1 text-sm select-none"
          >
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className="min-w-9"
            onClick={() => onPage(p)}
          >
            {p}
          </Button>
        ),
      )}

      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        {tc('next')}
      </Button>
    </nav>
  )
}

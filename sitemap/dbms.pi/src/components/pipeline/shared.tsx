'use client'

// PiCDC 화면 공용 — 오류 문구 훅 + 반응형 페이지 이동(패널·섹션 간 순환 import 방지용으로 분리)
import { useTranslations } from 'next-intl'
import { useLinkErrText } from '@/components/link/link-api'
import { BTN } from '@/components/ui'
import type { ApiErrorBody } from '@/lib/client-api'

// 오류 문구 — pipeline.errors.<code>(PPL_NAME_DUP·LINK_* 친절 문구) → link2.errors → apiErrors
export function usePplErr() {
  const t = useTranslations('pipeline.errors')
  const linkErr = useLinkErrText()
  return (b: ApiErrorBody) => (b.code && t.has(b.code) ? t(b.code) : linkErr(b))
}

// 반응형 페이지 이동 — 모바일 = 이전·현재/전체·다음, 데스크톱 = 번호도(최대 7개). drift 화면과 같은 모양
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const t = useTranslations('pipeline')
  if (pages <= 1) return null
  const start = Math.max(1, Math.min(page - 3, pages - 6))
  const nums = Array.from({ length: Math.min(7, pages) }, (_, i) => start + i)
  return (
    <nav className="flex items-center gap-1 text-sm" aria-label={t('pager')}>
      <button className={BTN} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t('prev')}
      </button>
      <span className="px-2 sm:hidden">
        {page} / {pages}
      </span>
      {nums.map((n) => (
        <button
          key={n}
          className={`${BTN} hidden sm:inline-grid ${n === page ? 'ring-accent ring-2' : ''}`}
          aria-current={n === page ? 'page' : undefined}
          onClick={() => onPage(n)}
        >
          {n}
        </button>
      ))}
      <button className={BTN} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t('next')}
      </button>
    </nav>
  )
}

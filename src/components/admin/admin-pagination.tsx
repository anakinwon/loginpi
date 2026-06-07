'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface Props {
  page: number
  totalPages: number
  onPage: (p: number) => void
}

export function AdminPagination({ page, totalPages, onPage }: Props) {
  const tc = useTranslations('common')
  if (totalPages <= 1) return null

  const start = Math.max(1, page - 4)
  const end = Math.min(totalPages, start + 9)

  return (
    <div className='flex justify-center gap-1'>
      {page > 1 && (
        <Button variant='outline' size='sm' onClick={() => onPage(page - 1)}>
          {tc('prev')}
        </Button>
      )}
      {Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
        <Button
          key={p}
          variant={p === page ? 'default' : 'outline'}
          size='sm'
          onClick={() => onPage(p)}
        >
          {p}
        </Button>
      ))}
      {page < totalPages && (
        <Button variant='outline' size='sm' onClick={() => onPage(page + 1)}>
          {tc('next')}
        </Button>
      )}
    </div>
  )
}

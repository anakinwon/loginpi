'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PostSearch({ category, q }: { category: string; q?: string }) {
  const router = useRouter()
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const [value, setValue] = useState(q ?? '')

  const search = () => {
    const qs = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ''
    router.push(`/board/${category}${qs}`)
  }

  // 카페/상품 마켓처럼 입력 즉시(300ms debounce) 검색 — 엔터 불필요.
  // SSR 검색이라 URL ?q=만 교체(replace: 타이핑마다 히스토리 쌓지 않음).
  useEffect(() => {
    const id = setTimeout(() => {
      const trimmed = value.trim()
      if (trimmed === (q ?? '')) return // 현재 검색어와 같으면 네비게이션 생략
      const qs = trimmed ? `?q=${encodeURIComponent(trimmed)}` : ''
      router.replace(`/board/${category}${qs}`)
    }, 300)
    return () => clearTimeout(id)
  }, [value, q, category, router])

  return (
    <div className="mb-4 flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && search()}
        placeholder={t('searchPlaceholder')}
        className="max-w-xs"
      />
      <Button variant="outline" size="sm" onClick={search}>
        {tc('search')}
      </Button>
      {q && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue('')
            router.push(`/board/${category}`)
          }}
        >
          {tc('reset')}
        </Button>
      )}
    </div>
  )
}

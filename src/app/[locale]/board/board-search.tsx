'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'

// /api/board/search 응답 형태 (server route와 동일 — server-only 의존성 유입 방지 위해 로컬 정의)
interface BoardSearchResult {
  post_id: string
  ctgr_cd: string
  ctgr_nm: string
  post_ttl: string
  rgst_usr_nm: string | null
  reg_dtm: string
}

export function BoardSearch() {
  const t = useTranslations('board')
  const [value, setValue] = useState('')
  const [results, setResults] = useState<BoardSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // 입력 즉시(300ms debounce) 전 게시판 통합검색 — 카페/상품/게시판과 동일 UX
  useEffect(() => {
    const kw = value.trim()
    if (!kw) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    const id = setTimeout(() => {
      fetch(`/api/board/search?q=${encodeURIComponent(kw)}`)
        .then((r) => r.json())
        .then((d: { results?: BoardSearchResult[] }) => {
          setResults(d.results ?? [])
          setSearched(true)
        })
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(id)
  }, [value])

  return (
    <div className="mb-8">
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('searchAllPlaceholder')}
        className="max-w-md"
      />

      {value.trim() && (
        <div className="mt-2 overflow-hidden rounded-lg border">
          {loading && results.length === 0 ? (
            <p className="text-muted-foreground px-4 py-3 text-sm">
              {t('searching')}
            </p>
          ) : results.length === 0 && searched ? (
            <p className="text-muted-foreground px-4 py-3 text-sm">
              {t('searchNoResults')}
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r.post_id}>
                  <Link
                    href={`/board/${r.ctgr_cd.toLowerCase()}/${r.post_id}`}
                    className="hover:bg-muted/50 flex items-center gap-2 px-4 py-2.5 transition-colors"
                  >
                    <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                      {r.ctgr_nm}
                    </span>
                    <span className="truncate text-sm">{r.post_ttl}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {r.rgst_usr_nm ?? ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

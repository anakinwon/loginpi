'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { PostSearch } from './post-search'

// 게시글 1행 높이: py-3(24px) + 텍스트(20px) + border(1px) ≈ 45px
const ROW_HEIGHT_PX = 45

// 게시판 페이지 내부 고정 chrome 높이:
//   py-8 상하(64) + 제목행+mb-6(56) + 검색박스+mb-4(52) + 테이블헤더(33) + 페이지네이션+mt-6(56) + 여분(9)
const BOARD_CHROME_PX = 270

// header·footer 실제 높이 + BOARD_CHROME 제외 후 목록 가용 픽셀 계산
function calcLimit(): number {
  if (typeof window === 'undefined') return 15
  const headerH = (document.querySelector('header') as HTMLElement | null)?.offsetHeight ?? 56
  const footerH = (document.querySelector('footer') as HTMLElement | null)?.offsetHeight ?? 80
  const available = window.innerHeight - headerH - footerH - BOARD_CHROME_PX
  return Math.max(5, Math.min(50, Math.floor(available / ROW_HEIGHT_PX)))
}

interface Post {
  post_id: string
  post_ttl: string
  rgst_usr_nm: string
  vw_cnt: number
  pin_yn: string
  answ_yn: string
  reg_dtm: string
}

interface Props {
  category: string
  ctgrNm: string
  isQna: boolean
  canWrite: boolean
}

export function BoardListView({ category, ctgrNm, isQna, canWrite }: Props) {
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const q = searchParams.get('q') ?? ''

  const [limit, setLimit] = useState(15)
  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // 마운트 후 실제 화면 크기로 limit 측정 + 리사이즈 대응
  useEffect(() => {
    const update = () => setLimit(calcLimit())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // limit·page·q 변경 시 게시글 조회
  useEffect(() => {
    setLoading(true)
    const sp = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (q) sp.set('q', q)
    fetch(`/api/board/${category}?${sp}`)
      .then((r) => r.json())
      .then((d: { posts: Post[]; total: number }) => {
        setPosts(d.posts ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category, page, limit, q])

  const totalPages = Math.ceil(total / limit)

  const buildHref = (p: number) =>
    `/board/${category}?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  const startPage = Math.max(1, page - 4)
  const endPage = Math.min(totalPages, startPage + 9)
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      {/* 제목 + 글쓰기 버튼 */}
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>{ctgrNm}</h1>
        {canWrite && (
          <Link href={`/board/${category}/write`} className={cn(buttonVariants({ size: 'sm' }))}>
            {t('write')}
          </Link>
        )}
      </div>

      {/* 검색 */}
      <PostSearch category={category} q={q || undefined} />

      {/* 게시글 목록 */}
      <div className='overflow-hidden rounded-lg border'>
        {loading ? (
          <div className='py-16 text-center text-sm text-muted-foreground'>{tc('loading')}</div>
        ) : posts.length === 0 ? (
          <div className='py-16 text-center text-sm text-muted-foreground'>
            {q ? t('noResults', { q }) : t('noData')}
          </div>
        ) : (
          <>
            <div className='hidden border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_80px_60px_90px]'>
              <span>{t('columns.title')}</span>
              <span className='text-center'>{t('columns.author')}</span>
              <span className='text-center'>{t('columns.views')}</span>
              <span className='text-center'>{t('columns.date')}</span>
            </div>
            {posts.map((post) => (
              <Link
                key={post.post_id}
                href={`/board/${category}/${post.post_id}`}
                className='flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 transition-colors hover:bg-muted/30 sm:grid sm:grid-cols-[1fr_80px_60px_90px] sm:items-center sm:gap-0'
              >
                <span className='flex items-center gap-1.5 text-sm'>
                  {post.pin_yn === 'Y' && (
                    <span className='shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary'>
                      {t('notice')}
                    </span>
                  )}
                  {isQna && post.answ_yn === 'Y' && (
                    <span className='shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'>
                      {t('adopted')}
                    </span>
                  )}
                  <span className='truncate'>{post.post_ttl}</span>
                </span>
                <span className='text-center text-xs text-muted-foreground'>{post.rgst_usr_nm}</span>
                <span className='text-center text-xs text-muted-foreground'>{post.vw_cnt}</span>
                <span className='text-center text-xs text-muted-foreground'>
                  {new Date(post.reg_dtm).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </span>
              </Link>
            ))}
          </>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className='mt-6 flex flex-wrap justify-center gap-1'>
          {page > 1 && (
            <Link
              href={buildHref(page - 1)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              {tc('prev')}
            </Link>
          )}
          {pageNumbers.map((p) => (
            <Link
              key={p}
              href={buildHref(p)}
              className={cn(buttonVariants({ variant: page === p ? 'default' : 'outline', size: 'sm' }))}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link
              href={buildHref(page + 1)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              {tc('next')}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

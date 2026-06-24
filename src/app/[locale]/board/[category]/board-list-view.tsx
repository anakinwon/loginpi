'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { usePiAuth } from '@/components/pi-auth-provider'
import { maskUsername } from '@/lib/mask-username'
import { PostSearch } from './post-search'

// 게시글 1행 높이: py-3(24px) + 텍스트(20px) + border(1px) ≈ 45px
const ROW_HEIGHT_PX = 45

// 게시판 페이지 내부 고정 chrome 높이:
//   py-8 상하(64) + 제목행+mb-6(56) + 검색박스+mb-4(52) + 테이블헤더(33) + 페이지네이션+mt-6(56) + 여분(9)
const BOARD_CHROME_PX = 270

// header·footer 실제 높이 + BOARD_CHROME 제외 후 목록 가용 픽셀 계산
function calcLimit(): number {
  if (typeof window === 'undefined') return 15
  const headerH =
    (document.querySelector('header') as HTMLElement | null)?.offsetHeight ?? 56
  const footerH =
    (document.querySelector('footer') as HTMLElement | null)?.offsetHeight ?? 80
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
  thumb_url?: string | null
}

// 썸네일 없는 글의 플레이스홀더 그라데이션 — post_id 해시로 글마다 고정 선택
const PLACEHOLDER_GRADIENTS = [
  'from-violet-500 via-purple-500 to-fuchsia-500',
  'from-sky-500 via-blue-500 to-indigo-500',
  'from-emerald-500 via-teal-500 to-cyan-500',
  'from-amber-500 via-orange-500 to-rose-500',
  'from-pink-500 via-rose-500 to-red-500',
  'from-lime-500 via-green-500 to-emerald-500',
]
function gradientFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PLACEHOLDER_GRADIENTS[h % PLACEHOLDER_GRADIENTS.length]
}

interface Props {
  category: string
  ctgrNm: string
  isQna: boolean
  canWrite: boolean
  isGallery?: boolean
}

export function BoardListView({
  category,
  ctgrNm,
  isQna,
  canWrite,
  isGallery,
}: Props) {
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()
  // 작성자명 마스킹 — 비관리자 뷰어에게만(관리자는 전체). 목록엔 본인 식별자 부재 → isAdmin 기준
  const { user } = usePiAuth()
  const maskAuthor = (n: string) =>
    user?.role === 'ADMIN' || user?.role === 'MASTER' ? n : maskUsername(n)

  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const q = searchParams.get('q') ?? ''

  const [limit, setLimit] = useState(isGallery ? 12 : 15)
  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // 갤러리가 아닐 때만 화면 크기 기반 limit 계산
  useEffect(() => {
    if (isGallery) return
    const update = () => setLimit(calcLimit())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [isGallery])

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
  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i,
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* 제목 + 글쓰기 버튼 */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{ctgrNm}</h1>
        {canWrite && (
          <Link
            href={`/board/${category}/write`}
            className={cn(buttonVariants({ size: 'sm' }))}
          >
            {t('write')}
          </Link>
        )}
      </div>

      {/* 검색 */}
      <PostSearch category={category} q={q || undefined} />

      {/* 게시글 목록 */}
      {loading ? (
        isGallery ? (
          /* 갤러리 스켈레톤 — 카드 자리에 펄스 애니메이션 */
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-muted aspect-[4/3] animate-pulse rounded-2xl"
              />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground rounded-lg border py-16 text-center text-sm">
            {tc('loading')}
          </div>
        )
      ) : posts.length === 0 ? (
        <div
          className={cn(
            'text-muted-foreground py-16 text-center text-sm',
            !isGallery && 'rounded-lg border',
          )}
        >
          {q ? t('noResults', { q }) : t('noData')}
        </div>
      ) : isGallery ? (
        /* 갤러리 카드 그리드 — 그라데이션 오버레이 + 호버 리프트 */
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.post_id}
              href={`/board/${category}/${post.post_id}`}
              className="group bg-card hover:border-primary/40 hover:shadow-primary/10 relative block overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
            >
              {/* 썸네일 영역 (4:3) */}
              <div className="relative aspect-[4/3] overflow-hidden">
                {post.thumb_url ? (
                  <img
                    src={post.thumb_url}
                    alt={post.post_ttl}
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                  />
                ) : (
                  /* 썸네일 없는 글 — post_id 고정 비비드 그라데이션 */
                  <div
                    className={cn(
                      'flex h-full w-full items-center justify-center bg-gradient-to-br transition-transform duration-500 ease-out group-hover:scale-110',
                      gradientFor(post.post_id),
                    )}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12 text-white/40 drop-shadow"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}

                {/* 하단 그라데이션 오버레이 + 타이틀 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-white drop-shadow-sm">
                    {post.post_ttl}
                  </h3>
                  <div className="mt-2 flex items-center gap-2 text-xs text-white/80">
                    {/* 작성자 이니셜 아바타 */}
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold text-white backdrop-blur-sm">
                      {maskAuthor(post.rgst_usr_nm).charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{maskAuthor(post.rgst_usr_nm)}</span>
                    <span className="text-white/50">·</span>
                    <span className="shrink-0">
                      {new Date(post.reg_dtm).toLocaleDateString('ko-KR', {
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </span>
                    {/* 조회수 */}
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-white/70">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                      {post.vw_cnt}
                    </span>
                  </div>
                </div>

                {/* 공지 배지 */}
                {post.pin_yn === 'Y' && (
                  <span className="bg-primary/90 text-primary-foreground absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow backdrop-blur-sm">
                    {t('notice')}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* 일반 테이블 목록 */
        <div className="overflow-hidden rounded-lg border">
          <div className="bg-muted/50 text-muted-foreground hidden border-b px-4 py-2 text-xs font-medium sm:grid sm:grid-cols-[1fr_80px_60px_90px]">
            <span>{t('columns.title')}</span>
            <span className="text-center">{t('columns.author')}</span>
            <span className="text-center">{t('columns.views')}</span>
            <span className="text-center">{t('columns.date')}</span>
          </div>
          {posts.map((post) => (
            <Link
              key={post.post_id}
              href={`/board/${category}/${post.post_id}`}
              className="hover:bg-muted/30 flex flex-col gap-1 border-b px-4 py-3 transition-colors last:border-b-0 sm:grid sm:grid-cols-[1fr_80px_60px_90px] sm:items-center sm:gap-0"
            >
              <span className="flex items-center gap-1.5 text-sm">
                {post.pin_yn === 'Y' && (
                  <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                    {t('notice')}
                  </span>
                )}
                {isQna && post.answ_yn === 'Y' && (
                  <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {t('adopted')}
                  </span>
                )}
                <span className="truncate">{post.post_ttl}</span>
              </span>
              <span className="text-muted-foreground text-center text-xs">
                {maskAuthor(post.rgst_usr_nm)}
              </span>
              <span className="text-muted-foreground text-center text-xs">
                {post.vw_cnt}
              </span>
              <span className="text-muted-foreground text-center text-xs">
                {new Date(post.reg_dtm).toLocaleDateString('ko-KR', {
                  month: '2-digit',
                  day: '2-digit',
                })}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-wrap justify-center gap-1">
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
              className={cn(
                buttonVariants({
                  variant: page === p ? 'default' : 'outline',
                  size: 'sm',
                }),
              )}
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

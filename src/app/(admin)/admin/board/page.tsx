'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface PostRow {
  post_id: string
  ctgr_cd: string
  post_ttl: string
  rgst_usr_nm: string
  vw_cnt: number
  pin_yn: string
  answ_yn: string
  reg_dtm: string
}

export default function AdminBoardPage() {
  const [posts, setPosts] = useState<PostRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [ctgrFilter, setCtgrFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const limit = 30

  const categories = useMemo(() => {
    const unique = new Map<string, string>()
    posts.forEach((p) => unique.set(p.ctgr_cd, p.ctgr_cd))
    return Array.from(unique.keys())
  }, [posts])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(ctgrFilter !== 'ALL' ? { ctgr: ctgrFilter } : {}),
    })
    fetch(`/api/admin/board?${qs}`)
      .then((r) => r.json())
      .then((d: { posts: PostRow[]; total: number }) => {
        setPosts(d.posts ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [page, ctgrFilter])

  const handlePinToggle = async (postId: string, currentPin: string) => {
    const res = await fetch(`/api/admin/board/${postId}`, { method: 'PATCH' })
    if (res.ok) {
      const { pin_yn } = await res.json()
      setPosts((prev) => prev.map((p) => (p.post_id === postId ? { ...p, pin_yn } : p)))
      toast.success(pin_yn === 'Y' ? '공지로 설정됐습니다' : '공지가 해제됐습니다')
    } else {
      const { error } = await res.json()
      toast.error(error ?? '처리 실패')
    }
  }

  const handleDelete = async (postId: string, title: string) => {
    if (!confirm(`"${title}" 게시글을 삭제할까요?`)) return
    const res = await fetch(`/api/admin/board/${postId}`, { method: 'DELETE' })
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.post_id !== postId))
      setTotal((t) => t - 1)
      toast.success('게시글이 삭제됐습니다')
    } else {
      const { error } = await res.json()
      toast.error(error ?? '삭제 실패')
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>게시판 관리</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            총 {total}개 게시글 · 공지 설정 및 강제 삭제
          </p>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className='flex flex-wrap gap-2'>
        {['ALL', ...categories].map((c) => (
          <button
            key={c}
            onClick={() => { setCtgrFilter(c); setPage(1) }}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              ctgrFilter === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {c === 'ALL' ? '전체' : c}
          </button>
        ))}
      </div>

      {/* 게시글 테이블 */}
      <div className='overflow-hidden rounded-lg border'>
        {loading ? (
          <div className='flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground'>
            <div className='h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent' />
            불러오는 중…
          </div>
        ) : posts.length === 0 ? (
          <div className='py-12 text-center text-sm text-muted-foreground'>
            게시글이 없습니다.
          </div>
        ) : (
          <>
            <div className='hidden border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[60px_1fr_80px_60px_100px_120px]'>
              <span>카테고리</span>
              <span>제목</span>
              <span className='text-center'>작성자</span>
              <span className='text-center'>조회</span>
              <span className='text-center'>날짜</span>
              <span className='text-center'>관리</span>
            </div>
            {posts.map((post) => (
              <div
                key={post.post_id}
                className='flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[60px_1fr_80px_60px_100px_120px] sm:items-center sm:gap-0'
              >
                <span className='text-xs font-medium text-muted-foreground'>{post.ctgr_cd}</span>
                <div className='flex items-center gap-1.5 min-w-0'>
                  {post.pin_yn === 'Y' && (
                    <span className='shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary'>
                      공지
                    </span>
                  )}
                  <Link
                    href={`/board/${post.ctgr_cd.toLowerCase()}/${post.post_id}`}
                    target='_blank'
                    className='truncate text-sm hover:underline'
                  >
                    {post.post_ttl}
                  </Link>
                </div>
                <span className='text-center text-xs text-muted-foreground'>{post.rgst_usr_nm}</span>
                <span className='text-center text-xs text-muted-foreground'>{post.vw_cnt}</span>
                <span className='text-center text-xs text-muted-foreground'>
                  {new Date(post.reg_dtm).toLocaleDateString('ko-KR', {
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>
                <div className='flex items-center justify-center gap-1.5'>
                  <Button
                    variant={post.pin_yn === 'Y' ? 'default' : 'outline'}
                    size='sm'
                    className='h-7 px-2 text-xs'
                    onClick={() => handlePinToggle(post.post_id, post.pin_yn)}
                  >
                    {post.pin_yn === 'Y' ? '공지 해제' : '공지 설정'}
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    className='h-7 px-2 text-xs'
                    onClick={() => handleDelete(post.post_id, post.post_ttl)}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className='flex justify-center gap-1'>
          {page > 1 && (
            <Button variant='outline' size='sm' onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
          )}
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size='sm'
              onClick={() => setPage(p)}
            >
              {p}
            </Button>
          ))}
          {page < totalPages && (
            <Button variant='outline' size='sm' onClick={() => setPage((p) => p + 1)}>
              다음
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'

// p-6(48) + 제목+설명(56) + gap(16) + 카테고리필터(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지네이션(36)
const CHROME_PX = 257

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
  const t = useTranslations('admin.board')
  const tc = useTranslations('common')
  const [posts, setPosts] = useState<PostRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [ctgrFilter, setCtgrFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  const categories = useMemo(() => {
    const unique = new Map<string, string>()
    posts.forEach((p) => unique.set(p.ctgr_cd, p.ctgr_cd))
    return Array.from(unique.keys())
  }, [posts])

  // limit 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [limit])

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
  }, [page, ctgrFilter, limit])

  const handlePinToggle = async (postId: string, currentPin: string) => {
    const res = await fetch(`/api/admin/board/${postId}`, { method: 'PATCH' })
    if (res.ok) {
      const { pin_yn } = await res.json()
      setPosts((prev) =>
        prev.map((p) => (p.post_id === postId ? { ...p, pin_yn } : p)),
      )
      toast.success(pin_yn === 'Y' ? t('pinnedSuccess') : t('unpinnedSuccess'))
    } else {
      const { error } = await res.json()
      toast.error(error ?? t('processFail'))
    }
  }

  const handleDelete = async (postId: string, title: string) => {
    if (!confirm(t('deleteConfirm', { title }))) return
    const res = await fetch(`/api/admin/board/${postId}`, { method: 'DELETE' })
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.post_id !== postId))
      setTotal((total) => total - 1)
      toast.success(t('deleteSuccess'))
    } else {
      const { error } = await res.json()
      toast.error(error ?? t('deleteFail'))
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('desc', { count: total })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['ALL', ...categories].map((c) => (
          <button
            key={c}
            onClick={() => {
              setCtgrFilter(c)
              setPage(1)
            }}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              ctgrFilter === c
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {c === 'ALL' ? tc('all') : c}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border">
        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
            <div className="border-muted-foreground h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
            {t('loading')}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {t('noData')}
          </div>
        ) : (
          <>
            <div className="bg-muted/50 text-muted-foreground hidden border-b px-4 py-2 text-xs font-medium sm:grid sm:grid-cols-[60px_1fr_80px_60px_100px_120px]">
              <span>{t('col.category')}</span>
              <span>{t('col.title')}</span>
              <span className="text-center">{t('col.author')}</span>
              <span className="text-center">{t('col.views')}</span>
              <span className="text-center">{t('col.date')}</span>
              <span className="text-center">{t('col.manage')}</span>
            </div>
            {posts.map((post) => (
              <div
                key={post.post_id}
                className="flex flex-col gap-1 border-b px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[60px_1fr_80px_60px_100px_120px] sm:items-center sm:gap-0"
              >
                <span className="text-muted-foreground text-xs font-medium">
                  {post.ctgr_cd}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  {post.pin_yn === 'Y' && (
                    <span className="bg-primary/10 text-primary shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                      {t('notice')}
                    </span>
                  )}
                  <Link
                    href={`/board/${post.ctgr_cd.toLowerCase()}/${post.post_id}`}
                    target="_blank"
                    className="truncate text-sm hover:underline"
                  >
                    {post.post_ttl}
                  </Link>
                </div>
                <span className="text-muted-foreground text-center text-xs">
                  {post.rgst_usr_nm}
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
                <div className="flex items-center justify-center gap-1.5">
                  <Button
                    variant={post.pin_yn === 'Y' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handlePinToggle(post.post_id, post.pin_yn)}
                  >
                    {post.pin_yn === 'Y' ? t('unsetPinned') : t('setPinned')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleDelete(post.post_id, post.post_ttl)}
                  >
                    {tc('delete')}
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}

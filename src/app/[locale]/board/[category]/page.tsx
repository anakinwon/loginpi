import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCategory, hasMinRole } from '@/lib/board'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PostSearch } from './post-search'

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function BoardListPage({ params, searchParams }: Props) {
  const { category } = await params
  const { page: pageStr, q } = await searchParams

  const [ctgr, user] = await Promise.all([getCategory(category), getSessionUser()])
  if (!ctgr) notFound()

  const page = Math.max(1, Number(pageStr ?? 1))
  const limit = 20
  const from = (page - 1) * limit

  const db = getSupabaseAdmin()
  let query = db
    .from('brd_post')
    .select('post_id, post_ttl, rgst_usr_nm, vw_cnt, pin_yn, answ_yn, reg_dtm', { count: 'exact' })
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .order('pin_yn', { ascending: false })
    .order('reg_dtm', { ascending: false })
    .range(from, from + limit - 1)

  // PostgREST 인젝션 방지: ,()*는 제거, LIKE 와일드카드 %_\는 이스케이프
  const safeQ = q
    ?.trim()
    .replace(/[,()*]/g, '')
    .replace(/[%_\\]/g, '\\$&')
    .slice(0, 100) ?? ''
  if (safeQ) {
    query = query.or(`post_ttl.ilike.%${safeQ}%,post_cont.ilike.%${safeQ}%`)
  }

  const { data: posts, count } = await query
  const total = count ?? 0
  const totalPages = Math.ceil(total / limit)
  const canWrite = !!user && hasMinRole(user.role, ctgr.wr_min_role_cd)

  // 현재 페이지 기준 ±4 범위 페이지 번호
  const startPage = Math.max(1, page - 4)
  const endPage = Math.min(totalPages, startPage + 9)
  const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>{ctgr.ctgr_nm}</h1>
        {canWrite && (
          <Link href={`/board/${category}/write`} className={cn(buttonVariants({ size: 'sm' }))}>
            글쓰기
          </Link>
        )}
      </div>

      <PostSearch category={category} q={q} />

      <div className='overflow-hidden rounded-lg border'>
        {(!posts || posts.length === 0) ? (
          <div className='py-16 text-center text-sm text-muted-foreground'>
            {q ? `"${q}" 검색 결과가 없습니다.` : '아직 게시글이 없습니다.'}
          </div>
        ) : (
          <>
            <div className='hidden border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_80px_60px_90px]'>
              <span>제목</span>
              <span className='text-center'>작성자</span>
              <span className='text-center'>조회</span>
              <span className='text-center'>날짜</span>
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
                      공지
                    </span>
                  )}
                  {ctgr.ctgr_cd === 'QNA' && post.answ_yn === 'Y' && (
                    <span className='shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'>
                      채택
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

      {totalPages > 1 && (
        <div className='mt-6 flex flex-wrap justify-center gap-1'>
          {page > 1 && (
            <Link
              href={`/board/${category}?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              이전
            </Link>
          )}
          {pageNumbers.map((p) => (
            <Link
              key={p}
              href={`/board/${category}?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={cn(buttonVariants({ variant: page === p ? 'default' : 'outline', size: 'sm' }))}
            >
              {p}
            </Link>
          ))}
          {page < totalPages && (
            <Link
              href={`/board/${category}?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

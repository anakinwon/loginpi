import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { CategoryRow } from '@/lib/board'

export default async function BoardIndexPage() {
  const { data: categories } = await getSupabaseAdmin()
    .from('brd_ctgr')
    .select('*')
    .eq('use_yn', 'Y')
    .order('sort_ord', { ascending: true })

  return (
    <div className='mx-auto max-w-4xl px-4 py-12'>
      <h1 className='mb-8 text-2xl font-bold'>게시판</h1>

      {(!categories || categories.length === 0) ? (
        <p className='text-muted-foreground'>등록된 게시판이 없습니다.</p>
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {(categories as CategoryRow[]).map((ctgr) => (
            <Link
              key={ctgr.ctgr_cd}
              href={`/board/${ctgr.ctgr_cd.toLowerCase()}`}
              className='group rounded-lg border p-6 transition-colors hover:bg-muted/50'
            >
              <h2 className='mb-1 font-semibold group-hover:text-primary'>{ctgr.ctgr_nm}</h2>
              <div className='mt-3 flex flex-wrap gap-1.5'>
                {ctgr.cmnt_yn === 'Y' && (
                  <span className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
                    댓글
                  </span>
                )}
                {ctgr.attch_yn === 'Y' && (
                  <span className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
                    첨부파일
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

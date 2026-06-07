import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getCategory, hasMinRole } from '@/lib/board'
import { getSessionUser } from '@/lib/auth-check'
import { BoardListView } from './board-list-view'

type Props = {
  params: Promise<{ category: string }>
}

export default async function BoardListPage({ params }: Props) {
  const { category } = await params

  const [ctgr, user] = await Promise.all([getCategory(category), getSessionUser()])
  if (!ctgr) notFound()

  const canWrite = !!user && hasMinRole(user.role, ctgr.wr_min_role_cd)

  return (
    <Suspense fallback={<ListSkeleton />}>
      <BoardListView
        category={category}
        ctgrNm={ctgr.ctgr_nm}
        isQna={ctgr.ctgr_cd === 'QNA'}
        canWrite={canWrite}
      />
    </Suspense>
  )
}

function ListSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <div className='mb-6 h-8 w-40 animate-pulse rounded bg-muted' />
      <div className='mb-4 h-9 animate-pulse rounded-lg bg-muted' />
      <div className='overflow-hidden rounded-lg border'>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className='h-12 border-b last:border-b-0 bg-muted/20 animate-pulse' />
        ))}
      </div>
    </div>
  )
}

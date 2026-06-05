import { redirect } from 'next/navigation'
import { getCategory, hasMinRole } from '@/lib/board'
import { getSessionUser } from '@/lib/auth-check'
import { PostForm } from '@/components/board/post-form'

type Props = { params: Promise<{ category: string }> }

export default async function WritePage({ params }: Props) {
  const { category } = await params
  const [ctgr, user] = await Promise.all([getCategory(category), getSessionUser()])

  if (!ctgr || !user || !hasMinRole(user.role, ctgr.wr_min_role_cd)) {
    redirect(`/board/${category}`)
  }

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>{ctgr.ctgr_nm} — 글쓰기</h1>
      <PostForm category={category} />
    </div>
  )
}

import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCategory } from '@/lib/board'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { PostForm } from '@/components/board/post-form'

type Props = { params: Promise<{ category: string; postId: string }> }

export default async function EditPage({ params }: Props) {
  const { category, postId } = await params
  const [ctgr, user, t] = await Promise.all([
    getCategory(category),
    getSessionUser(),
    getTranslations('board'),
  ])

  if (!ctgr) redirect(`/board/${category}`)
  if (!user) redirect(`/board/${category}/${postId}`)

  const { data: post } = await getSupabaseAdmin()
    .from('brd_post')
    .select('post_id, post_ttl, post_cont, rgst_usr_id')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!post) notFound()

  const isOwner = post.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) redirect(`/board/${category}/${postId}`)

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>{t('editTitle', { name: ctgr.ctgr_nm })}</h1>
      <PostForm
        category={category}
        postId={postId}
        initialTitle={post.post_ttl}
        initialContent={post.post_cont ?? ''}
      />
    </div>
  )
}

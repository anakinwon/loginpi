import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCategory } from '@/lib/board'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { PostForm } from '@/components/board/post-form'
import { AttachmentSection } from '../attachment-section'

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

  const db = getSupabaseAdmin()
  const { data: post } = await db
    .from('brd_post')
    .select('post_id, post_ttl, post_cont, rgst_usr_id')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!post) notFound()

  const isOwner = post.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) redirect(`/board/${category}/${postId}`)

  const canAttach = ctgr.attch_yn === 'Y'

  // canAttach일 때만 기존 첨부파일 목록을 SSR로 미리 로드
  const { data: attachments } = canAttach
    ? await db
        .from('brd_attch')
        .select('attch_id, fl_nm, fl_url, fl_sz, reg_dtm')
        .eq('post_id', postId)
        .eq('del_yn', 'N')
        .order('reg_dtm', { ascending: true })
    : { data: [] }

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <h1 className='mb-6 text-2xl font-bold'>{t('editTitle', { name: ctgr.ctgr_nm })}</h1>
      {/* PostForm: 제목/내용 텍스트 수정 전담. 파일 관리는 AttachmentSection이 담당 */}
      <PostForm
        category={category}
        postId={postId}
        initialTitle={post.post_ttl}
        initialContent={post.post_cont ?? ''}
      />
      {/* AttachmentSection: 기존 파일 목록 + 개별 삭제 + 새 파일 업로드 */}
      {canAttach && (
        <div className='mt-6'>
          <AttachmentSection
            category={category}
            postId={postId}
            initialAttachments={attachments ?? []}
            canUpload
          />
        </div>
      )}
    </div>
  )
}

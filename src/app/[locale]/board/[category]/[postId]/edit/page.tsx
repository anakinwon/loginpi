import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCategory } from '@/lib/board'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { PostForm } from '@/components/board/post-form'
import { AttachmentSection } from '../attachment-section'
import { GalleryEditForm } from '@/components/board/gallery-edit-form'
import { ClientGalleryEditGate } from '@/components/board/client-gallery-edit-gate'

type Props = { params: Promise<{ category: string; postId: string }> }

export default async function EditPage({ params }: Props) {
  const { category, postId } = await params
  const [ctgr, user, t] = await Promise.all([
    getCategory(category),
    getSessionUser(),
    getTranslations('board'),
  ])

  if (!ctgr) redirect(`/board/${category}`)

  const isGallery = ctgr.gallery_yn === 'Y'

  // Pi Browser 지원: gallery 수정은 클라이언트 게이트로 위임 (redirect 금지)
  if (!user) {
    if (isGallery) {
      return (
        <div className="mx-auto max-w-4xl px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold">
            {t('editTitle', { name: ctgr.ctgr_nm })}
          </h1>
          <ClientGalleryEditGate category={category} postId={postId} />
        </div>
      )
    }
    redirect(`/board/${category}/${postId}`)
  }

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

  if (isGallery) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">
          {t('editTitle', { name: ctgr.ctgr_nm })}
        </h1>
        <GalleryEditForm
          category={category}
          postId={postId}
          initialTitle={post.post_ttl}
          initialContent={post.post_cont ?? ''}
        />
      </div>
    )
  }

  // 일반 게시판
  const canAttach = ctgr.attch_yn === 'Y'
  const { data: attachments } = canAttach
    ? await db
        .from('brd_attch')
        .select('attch_id, fl_nm, fl_url, fl_sz, fl_tp, sort_ord, reg_dtm')
        .eq('post_id', postId)
        .eq('del_yn', 'N')
        .order('sort_ord', { ascending: true })
        .order('reg_dtm', { ascending: true })
    : { data: [] }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">
        {t('editTitle', { name: ctgr.ctgr_nm })}
      </h1>
      <PostForm
        category={category}
        postId={postId}
        initialTitle={post.post_ttl}
        initialContent={post.post_cont ?? ''}
      />
      {canAttach && (
        <div className="mt-6">
          <AttachmentSection
            category={category}
            postId={postId}
            initialAttachments={(attachments ?? []).map(
              ({ fl_tp: _tp, sort_ord: _so, ...a }) => a,
            )}
            canUpload
          />
        </div>
      )}
    </div>
  )
}

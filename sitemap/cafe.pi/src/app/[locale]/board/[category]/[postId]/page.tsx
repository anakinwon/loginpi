import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getCategory } from '@/lib/board'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { PostDetailActions } from './post-detail-actions'
import { ReportButton } from '@/components/report/report-button'
import { maskUsername } from '@/lib/mask-username'
import { CommentSection } from './comment-section'
import { AttachmentSection } from './attachment-section'
import { GalleryBodyRenderer } from '@/components/board/gallery-body-renderer'

type Props = { params: Promise<{ category: string; postId: string }> }

export default async function PostDetailPage({ params }: Props) {
  const { category, postId } = await params
  const [ctgr, user, t] = await Promise.all([
    getCategory(category),
    getSessionUser(),
    getTranslations('board'),
  ])

  if (!ctgr) notFound()

  const db = getSupabaseAdmin()

  const { data: post, error } = await db
    .from('brd_post')
    .select('*')
    .eq('post_id', postId)
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .single()

  if (error || !post) notFound()

  // 조회수 비동기 increment (응답 대기 없음)
  db.from('brd_post')
    .update({ vw_cnt: post.vw_cnt + 1 })
    .eq('post_id', postId)
    .then(() => {})

  const [{ data: comments }, { data: attachments }] = await Promise.all([
    db
      .from('brd_cmnt')
      .select('cmnt_id, cmnt_cont, rgst_usr_id, rgst_usr_nm, acpt_yn, reg_dtm')
      .eq('post_id', postId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: true }),
    db
      .from('brd_attch')
      .select('attch_id, fl_nm, fl_url, fl_sz, fl_tp, sort_ord, reg_dtm')
      .eq('post_id', postId)
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })
      .order('reg_dtm', { ascending: true }),
  ])

  const isOwner = !!user && post.rgst_usr_id === user.id
  const isModerator = user?.role === 'ADMIN' || user?.role === 'MASTER'

  // AttachmentSection에 넘기는 목록 — fl_tp, sort_ord 제외 (AttachmentSection 타입과 호환)
  const attachmentList = (attachments ?? []).map(
    ({
      fl_tp: _ft,
      sort_ord: _so,
      ...a
    }: {
      attch_id: string
      fl_nm: string
      fl_url: string
      fl_sz: number
      fl_tp?: string
      sort_ord?: number
      reg_dtm: string
    }) => a,
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="text-muted-foreground mb-6 text-sm">
        <Link
          href={`/board/${category}`}
          className="hover:text-foreground hover:underline"
        >
          {ctgr.ctgr_nm}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground inline-block max-w-xs truncate align-bottom">
          {post.post_ttl}
        </span>
      </nav>

      <div className="mb-6 border-b pb-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl leading-tight font-bold">
            {post.pin_yn === 'Y' && (
              <span className="bg-primary/10 text-primary mr-2 rounded px-1.5 py-0.5 text-sm font-medium">
                {t('notice')}
              </span>
            )}
            {ctgr.ctgr_cd === 'QNA' && post.answ_yn === 'Y' && (
              <span className="mr-2 rounded bg-green-100 px-1.5 py-0.5 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {t('adoptedComplete')}
              </span>
            )}
            {post.post_ttl}
          </h1>
          {(isOwner || isModerator) && (
            <PostDetailActions category={category} postId={postId} />
          )}
        </div>
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-4 text-sm">
          <span>
            {isOwner || isModerator
              ? post.rgst_usr_nm
              : maskUsername(post.rgst_usr_nm)}
          </span>
          <span>{t('viewCount', { count: post.vw_cnt + 1 })}</span>
          <time dateTime={post.reg_dtm}>
            {new Date(post.reg_dtm).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {post.reg_dtm !== post.mod_dtm && (
            <span className="text-xs">{t('modified')}</span>
          )}
          {!isOwner && <ReportButton targetTp="POST" targetId={postId} />}
        </div>
      </div>

      {ctgr.gallery_yn === 'Y' ? (
        <GalleryBodyRenderer postCont={post.post_cont} />
      ) : (
        <div className="mb-8 min-h-32 text-sm leading-relaxed whitespace-pre-wrap">
          {post.post_cont ?? ''}
        </div>
      )}

      {ctgr.attch_yn === 'Y' && (
        <AttachmentSection
          category={category}
          postId={postId}
          initialAttachments={attachmentList}
          canUpload={isOwner || isModerator}
        />
      )}

      {ctgr.cmnt_yn === 'Y' && (
        <CommentSection
          category={category}
          postId={postId}
          initialComments={comments ?? []}
          isQna={ctgr.ctgr_cd === 'QNA'}
          postOwnerId={post.rgst_usr_id}
          acptCmntId={post.acpt_cmnt_id}
          currentUserId={user?.id ?? null}
          currentUserName={user?.display_name ?? null}
          currentUserRole={user?.role ?? null}
          canComment={!!user}
        />
      )}
    </div>
  )
}

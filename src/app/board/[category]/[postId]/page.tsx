import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCategory } from '@/lib/board'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { PostDetailActions } from './post-detail-actions'
import { CommentSection } from './comment-section'
import { AttachmentSection } from './attachment-section'

type Props = { params: Promise<{ category: string; postId: string }> }

export default async function PostDetailPage({ params }: Props) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([getCategory(category), getSessionUser()])

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
  db.from('brd_post').update({ vw_cnt: post.vw_cnt + 1 }).eq('post_id', postId).then(() => {})

  const [{ data: comments }, { data: attachments }] = await Promise.all([
    db
      .from('brd_cmnt')
      .select('cmnt_id, cmnt_cont, rgst_usr_id, rgst_usr_nm, acpt_yn, reg_dtm')
      .eq('post_id', postId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: true }),
    db
      .from('brd_attch')
      .select('attch_id, fl_nm, fl_url, fl_sz, reg_dtm')
      .eq('post_id', postId)
      .eq('del_yn', 'N'),
  ])

  const isOwner = !!user && post.rgst_usr_id === user.id
  const isModerator = user?.role === 'ADMIN' || user?.role === 'MASTER'

  return (
    <div className='mx-auto max-w-4xl px-4 py-8'>
      <nav className='mb-6 text-sm text-muted-foreground'>
        <Link href={`/board/${category}`} className='hover:text-foreground hover:underline'>
          {ctgr.ctgr_nm}
        </Link>
        <span className='mx-2'>/</span>
        <span className='max-w-xs inline-block truncate align-bottom text-foreground'>{post.post_ttl}</span>
      </nav>

      <div className='mb-6 border-b pb-6'>
        <div className='flex items-start justify-between gap-4'>
          <h1 className='text-2xl font-bold leading-tight'>
            {post.pin_yn === 'Y' && (
              <span className='mr-2 rounded bg-primary/10 px-1.5 py-0.5 text-sm font-medium text-primary'>
                공지
              </span>
            )}
            {ctgr.ctgr_cd === 'QNA' && post.answ_yn === 'Y' && (
              <span className='mr-2 rounded bg-green-100 px-1.5 py-0.5 text-sm font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400'>
                채택완료
              </span>
            )}
            {post.post_ttl}
          </h1>
          {(isOwner || isModerator) && (
            <PostDetailActions category={category} postId={postId} />
          )}
        </div>
        <div className='mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground'>
          <span>{post.rgst_usr_nm}</span>
          <span>조회 {post.vw_cnt + 1}</span>
          <time dateTime={post.reg_dtm}>
            {new Date(post.reg_dtm).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {post.reg_dtm !== post.mod_dtm && <span className='text-xs'>(수정됨)</span>}
        </div>
      </div>

      <div className='mb-8 min-h-32 whitespace-pre-wrap text-sm leading-relaxed'>
        {post.post_cont ?? ''}
      </div>

      {ctgr.attch_yn === 'Y' && (
        <AttachmentSection
          category={category}
          postId={postId}
          initialAttachments={attachments ?? []}
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

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ category: string; postId: string }> }

// POST /api/board/[category]/[postId]/accept — QNA 댓글 채택
// body: { cmnt_id: string } — 채택할 댓글 ID (null이면 채택 취소)
export async function POST(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr) return apiError('BOARD_NOT_FOUND', 404)
  if (ctgr.ctgr_cd !== 'QNA') {
    return apiError('BOARD_ACCEPT_QNA_ONLY', 403)
  }
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const db = getSupabaseAdmin()

  // 게시글 조회 — 작성자 본인만 채택 가능
  const { data: post } = await db
    .from('brd_post')
    .select('rgst_usr_id, acpt_cmnt_id')
    .eq('post_id', postId)
    .eq('ctgr_cd', 'QNA')
    .eq('del_yn', 'N')
    .single()

  if (!post) return apiError('BOARD_POST_NOT_FOUND', 404)
  if (post.rgst_usr_id !== user.id) {
    return apiError('BOARD_ACCEPT_AUTHOR_ONLY', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { cmnt_id } = body as { cmnt_id?: string | null }

  // 채택 취소
  if (!cmnt_id) {
    if (post.acpt_cmnt_id) {
      await db
        .from('brd_cmnt')
        .update({ acpt_yn: 'N' })
        .eq('cmnt_id', post.acpt_cmnt_id)
    }
    await db
      .from('brd_post')
      .update({ answ_yn: 'N', acpt_cmnt_id: null })
      .eq('post_id', postId)
    return NextResponse.json({ success: true, accepted: false })
  }

  // 채택할 댓글 존재 확인
  const { data: comment } = await db
    .from('brd_cmnt')
    .select('cmnt_id')
    .eq('cmnt_id', cmnt_id)
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!comment) return apiError('BOARD_COMMENT_NOT_FOUND', 404)

  // 이전 채택 초기화 → 새 댓글 채택 → 게시글 업데이트
  await Promise.all([
    post.acpt_cmnt_id
      ? db
          .from('brd_cmnt')
          .update({ acpt_yn: 'N' })
          .eq('cmnt_id', post.acpt_cmnt_id)
      : Promise.resolve(),
    db.from('brd_cmnt').update({ acpt_yn: 'Y' }).eq('cmnt_id', cmnt_id),
  ])

  const { error } = await db
    .from('brd_post')
    .update({ answ_yn: 'Y', acpt_cmnt_id: cmnt_id })
    .eq('post_id', postId)

  if (error) return apiError('BOARD_ACCEPT_FAILED', 500)
  return NextResponse.json({ success: true, accepted: true, cmnt_id })
}

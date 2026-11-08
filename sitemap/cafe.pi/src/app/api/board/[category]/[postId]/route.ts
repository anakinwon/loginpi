import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ category: string; postId: string }> }

// GET /api/board/[category]/[postId] — 상세 조회 + 조회수 increment
export async function GET(_request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const ctgr = await getCategory(category)
  if (!ctgr) {
    return apiError('BOARD_NOT_FOUND', 404)
  }

  const db = getSupabaseAdmin()

  const { data: postData, error: fetchErr } = await db
    .from('brd_post')
    .select('*')
    .eq('post_id', postId)
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .single()

  if (fetchErr || !postData) {
    return apiError('BOARD_POST_NOT_FOUND', 404)
  }

  // 조회수 비동기 증가 (응답 지연 없음)
  db.from('brd_post')
    .update({ vw_cnt: postData.vw_cnt + 1 })
    .eq('post_id', postId)
    .then(() => {})

  // 댓글 목록 (del_yn='N')
  const { data: comments } = await db
    .from('brd_cmnt')
    .select('cmnt_id, cmnt_cont, rgst_usr_nm, acpt_yn, reg_dtm')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })

  // 첨부파일 목록 (del_yn='N')
  const { data: attachments } = await db
    .from('brd_attch')
    .select('attch_id, fl_nm, fl_url, fl_sz, fl_tp, reg_dtm')
    .eq('post_id', postId)
    .eq('del_yn', 'N')

  return NextResponse.json({
    post: { ...postData, vw_cnt: postData.vw_cnt + 1 },
    comments: comments ?? [],
    attachments: attachments ?? [],
    category: ctgr,
  })
}

// PATCH /api/board/[category]/[postId] — 수정 (본인 또는 ADMIN/MASTER)
export async function PATCH(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr)
    return apiError('BOARD_NOT_FOUND', 404)
  if (!user)
    return apiError('AUTH_REQUIRED', 401)

  const { data: post } = await getSupabaseAdmin()
    .from('brd_post')
    .select('rgst_usr_id')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!post)
    return apiError('BOARD_POST_NOT_FOUND', 404)

  const isOwner = post.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) {
    return apiError('UPDATE_FORBIDDEN', 403)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { post_ttl, post_cont } = body as {
    post_ttl?: string
    post_cont?: string
  }
  if (!post_ttl?.trim()) {
    return apiError('BOARD_TITLE_REQUIRED', 400)
  }

  const { error } = await getSupabaseAdmin()
    .from('brd_post')
    .update({
      post_ttl: post_ttl.trim(),
      post_cont: post_cont?.trim() ?? null,
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('post_id', postId)

  if (error) return apiError('UPDATE_FAILED', 500)
  return NextResponse.json({ success: true })
}

// DELETE /api/board/[category]/[postId] — 논리삭제 (본인 또는 ADMIN/MASTER)
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr)
    return apiError('BOARD_NOT_FOUND', 404)
  if (!user)
    return apiError('AUTH_REQUIRED', 401)

  const { data: post } = await getSupabaseAdmin()
    .from('brd_post')
    .select('rgst_usr_id')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!post)
    return apiError('BOARD_POST_NOT_FOUND', 404)

  const isOwner = post.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) {
    return apiError('DELETE_FORBIDDEN', 403)
  }

  const { error } = await getSupabaseAdmin()
    .from('brd_post')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user.display_name.slice(0, 20),
    })
    .eq('post_id', postId)

  if (error) return apiError('DELETE_FAILED', 500)
  return NextResponse.json({ success: true })
}

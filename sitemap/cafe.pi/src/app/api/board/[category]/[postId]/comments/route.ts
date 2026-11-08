import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'
import { sanitizePlain } from '@/lib/sanitize'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ category: string; postId: string }> }

// POST /api/board/[category]/[postId]/comments — 댓글 작성
export async function POST(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr) return apiError('BOARD_NOT_FOUND', 404)
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (ctgr.cmnt_yn !== 'Y') {
    return apiError('BOARD_COMMENT_NOT_SUPPORTED', 403)
  }

  // 게시글 존재 확인
  const { data: post } = await getSupabaseAdmin()
    .from('brd_post')
    .select('post_id')
    .eq('post_id', postId)
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .single()

  if (!post) return apiError('BOARD_POST_NOT_FOUND', 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { cmnt_cont } = body as { cmnt_cont?: string }
  if (!cmnt_cont?.trim()) {
    return apiError('BOARD_COMMENT_REQUIRED', 400)
  }

  const { data, error } = await getSupabaseAdmin()
    .from('brd_cmnt')
    .insert({
      post_id: postId,
      cmnt_cont: sanitizePlain(cmnt_cont),
      rgst_usr_id: user.id,
      rgst_usr_nm: user.display_name,
      regr_id: user.display_name.slice(0, 20),
      modr_id: user.display_name.slice(0, 20),
    })
    .select('cmnt_id')
    .single()

  if (error) return apiError('BOARD_COMMENT_CREATE_FAILED', 500)
  return NextResponse.json({ cmnt_id: data.cmnt_id }, { status: 201 })
}

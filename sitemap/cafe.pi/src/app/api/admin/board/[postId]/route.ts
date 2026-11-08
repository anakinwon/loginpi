import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ postId: string }> }

// PATCH /api/admin/board/[postId] — 공지 핀 토글
export async function PATCH(_request: NextRequest, { params }: Params) {
  const { postId } = await params
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('FORBIDDEN', 403)

  const db = getSupabaseAdmin()

  const { data: post } = await db
    .from('brd_post')
    .select('pin_yn')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!post) return apiError('BOARD_POST_NOT_FOUND', 404)

  const newPinYn = post.pin_yn === 'Y' ? 'N' : 'Y'

  const { error } = await db
    .from('brd_post')
    .update({
      pin_yn: newPinYn,
      modr_id: user!.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('post_id', postId)

  if (error) return apiError('UPDATE_FAILED', 500)
  return NextResponse.json({ success: true, pin_yn: newPinYn })
}

// DELETE /api/admin/board/[postId] — 강제 논리삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { postId } = await params
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('FORBIDDEN', 403)

  const { error } = await getSupabaseAdmin()
    .from('brd_post')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user!.display_name.slice(0, 20),
    })
    .eq('post_id', postId)

  if (error) return apiError('DELETE_FAILED', 500)
  return NextResponse.json({ success: true })
}

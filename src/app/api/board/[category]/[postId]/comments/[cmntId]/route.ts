import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

type Params = { params: Promise<{ category: string; postId: string; cmntId: string }> }

// DELETE /api/board/[category]/[postId]/comments/[cmntId] — 댓글 논리삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { postId, cmntId } = await params
  const user = await getSessionUser()

  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { data: comment } = await getSupabaseAdmin()
    .from('brd_cmnt')
    .select('rgst_usr_id')
    .eq('cmnt_id', cmntId)
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!comment) return NextResponse.json({ error: '댓글을 찾을 수 없습니다' }, { status: 404 })

  const isOwner = comment.rgst_usr_id === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) {
    return NextResponse.json({ error: '삭제 권한이 없습니다' }, { status: 403 })
  }

  const { error } = await getSupabaseAdmin()
    .from('brd_cmnt')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      mod_usr_id: user.display_name.slice(0, 20),
    })
    .eq('cmnt_id', cmntId)

  if (error) return NextResponse.json({ error: '댓글 삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

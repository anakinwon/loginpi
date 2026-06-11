import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ postId: string }> }

// PATCH /api/admin/board/[postId] — 공지 핀 토글
export async function PATCH(_request: NextRequest, { params }: Params) {
  const { postId } = await params
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const db = getSupabaseAdmin()

  const { data: post } = await db
    .from('brd_post')
    .select('pin_yn')
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!post)
    return NextResponse.json(
      { error: '게시글을 찾을 수 없습니다' },
      { status: 404 },
    )

  const newPinYn = post.pin_yn === 'Y' ? 'N' : 'Y'

  const { error } = await db
    .from('brd_post')
    .update({
      pin_yn: newPinYn,
      modr_id: user!.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('post_id', postId)

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  return NextResponse.json({ success: true, pin_yn: newPinYn })
}

// DELETE /api/admin/board/[postId] — 강제 논리삭제
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { postId } = await params
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { error } = await getSupabaseAdmin()
    .from('brd_post')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user!.display_name.slice(0, 20),
    })
    .eq('post_id', postId)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

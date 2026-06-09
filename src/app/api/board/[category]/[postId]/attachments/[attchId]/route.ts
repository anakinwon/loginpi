import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

const BUCKET = 'board-attachments'

type Params = { params: Promise<{ postId: string; attchId: string }> }

// PATCH /api/board/[category]/[postId]/attachments/[attchId] — sort_ord 업데이트
export async function PATCH(request: NextRequest, { params }: Params) {
  const { postId, attchId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()

  const { data: attch } = await db
    .from('brd_attch')
    .select('post_id, brd_post!inner(rgst_usr_id)')
    .eq('attch_id', attchId)
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!attch) return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다' }, { status: 404 })

  const postOwnerId = (attch.brd_post as unknown as { rgst_usr_id: string }).rgst_usr_id
  if (postOwnerId !== user.id && user.role !== 'ADMIN' && user.role !== 'MASTER') {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const sortOrd = (body as { sort_ord?: unknown }).sort_ord
  if (typeof sortOrd !== 'number') {
    return NextResponse.json({ error: 'sort_ord(number)가 필요합니다' }, { status: 400 })
  }

  const { error: dbErr } = await db
    .from('brd_attch')
    .update({ sort_ord: sortOrd, modr_id: user.display_name.slice(0, 20) })
    .eq('attch_id', attchId)

  if (dbErr) return NextResponse.json({ error: 'DB 업데이트 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/board/[category]/[postId]/attachments/[attchId]
// DB 논리삭제 + Storage 물리삭제 (brd_attch 설계 원칙)
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { postId, attchId } = await params
  const user = await getSessionUser()

  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()

  const { data: attch } = await db
    .from('brd_attch')
    .select('fl_pth, post_id, brd_post!inner(rgst_usr_id)')
    .eq('attch_id', attchId)
    .eq('post_id', postId)
    .eq('del_yn', 'N')
    .single()

  if (!attch) return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다' }, { status: 404 })

  const postOwnerId = (attch.brd_post as unknown as { rgst_usr_id: string }).rgst_usr_id
  const isOwner = postOwnerId === user.id
  const isModerator = user.role === 'ADMIN' || user.role === 'MASTER'
  if (!isOwner && !isModerator) {
    return NextResponse.json({ error: '삭제 권한이 없습니다' }, { status: 403 })
  }

  // DB 논리삭제
  const { error: dbErr } = await db
    .from('brd_attch')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user.display_name.slice(0, 20),
    })
    .eq('attch_id', attchId)

  if (dbErr) return NextResponse.json({ error: 'DB 삭제 실패' }, { status: 500 })

  // Storage 물리삭제 (실패해도 DB는 이미 논리삭제됨 — 고아 파일은 주기적 정리 대상)
  await db.storage.from(BUCKET).remove([attch.fl_pth])

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'

type Params = { params: Promise<{ category: string; postId: string }> }

// POST /api/board/[category]/[postId]/accept — QNA 댓글 채택
// body: { cmnt_id: string } — 채택할 댓글 ID (null이면 채택 취소)
export async function POST(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([getCategory(category), getSessionUser()])

  if (!ctgr) return NextResponse.json({ error: '존재하지 않는 게시판입니다' }, { status: 404 })
  if (ctgr.ctgr_cd !== 'QNA') {
    return NextResponse.json({ error: 'Q&A 게시판에서만 채택할 수 있습니다' }, { status: 403 })
  }
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()

  // 게시글 조회 — 작성자 본인만 채택 가능
  const { data: post } = await db
    .from('brd_post')
    .select('rgst_usr_id, acpt_cmnt_id')
    .eq('post_id', postId)
    .eq('ctgr_cd', 'QNA')
    .eq('del_yn', 'N')
    .single()

  if (!post) return NextResponse.json({ error: '게시글을 찾을 수 없습니다' }, { status: 404 })
  if (post.rgst_usr_id !== user.id) {
    return NextResponse.json({ error: '질문 작성자만 채택할 수 있습니다' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { cmnt_id } = body as { cmnt_id?: string | null }

  // 채택 취소
  if (!cmnt_id) {
    if (post.acpt_cmnt_id) {
      await db.from('brd_cmnt').update({ acpt_yn: 'N' }).eq('cmnt_id', post.acpt_cmnt_id)
    }
    await db.from('brd_post').update({ answ_yn: 'N', acpt_cmnt_id: null }).eq('post_id', postId)
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

  if (!comment) return NextResponse.json({ error: '댓글을 찾을 수 없습니다' }, { status: 404 })

  // 이전 채택 초기화 → 새 댓글 채택 → 게시글 업데이트
  await Promise.all([
    post.acpt_cmnt_id
      ? db.from('brd_cmnt').update({ acpt_yn: 'N' }).eq('cmnt_id', post.acpt_cmnt_id)
      : Promise.resolve(),
    db.from('brd_cmnt').update({ acpt_yn: 'Y' }).eq('cmnt_id', cmnt_id),
  ])

  const { error } = await db
    .from('brd_post')
    .update({ answ_yn: 'Y', acpt_cmnt_id: cmnt_id })
    .eq('post_id', postId)

  if (error) return NextResponse.json({ error: '채택 처리 실패' }, { status: 500 })
  return NextResponse.json({ success: true, accepted: true, cmnt_id })
}

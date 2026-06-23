import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory } from '@/lib/board'
import { sanitizePlain } from '@/lib/sanitize'

type Params = { params: Promise<{ category: string; postId: string }> }

// POST /api/board/[category]/[postId]/comments — 댓글 작성
export async function POST(request: NextRequest, { params }: Params) {
  const { category, postId } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr)
    return NextResponse.json(
      { error: '존재하지 않는 게시판입니다' },
      { status: 404 },
    )
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (ctgr.cmnt_yn !== 'Y') {
    return NextResponse.json(
      { error: '이 게시판은 댓글을 지원하지 않습니다' },
      { status: 403 },
    )
  }

  // 게시글 존재 확인
  const { data: post } = await getSupabaseAdmin()
    .from('brd_post')
    .select('post_id')
    .eq('post_id', postId)
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .single()

  if (!post)
    return NextResponse.json(
      { error: '게시글을 찾을 수 없습니다' },
      { status: 404 },
    )

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { cmnt_cont } = body as { cmnt_cont?: string }
  if (!cmnt_cont?.trim()) {
    return NextResponse.json(
      { error: '댓글 내용을 입력해주세요' },
      { status: 400 },
    )
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

  if (error)
    return NextResponse.json({ error: '댓글 작성 실패' }, { status: 500 })
  return NextResponse.json({ cmnt_id: data.cmnt_id }, { status: 201 })
}

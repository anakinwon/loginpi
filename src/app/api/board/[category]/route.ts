import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getCategory, hasMinRole } from '@/lib/board'
import { sanitizeTitle, sanitizeMarkdown } from '@/lib/sanitize'

// GET /api/board/[category]?page=1&limit=20&q=검색어
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params
  const ctgr = await getCategory(category)
  if (!ctgr) {
    return NextResponse.json(
      { error: '존재하지 않는 게시판입니다' },
      { status: 404 },
    )
  }

  const { searchParams } = request.nextUrl
  const page = Math.max(1, Number(searchParams.get('page') ?? 1))
  const limit = Math.min(
    50,
    Math.max(1, Number(searchParams.get('limit') ?? 20)),
  )
  const q = searchParams.get('q')?.trim() ?? ''
  const from = (page - 1) * limit

  const db = getSupabaseAdmin()
  let query = db
    .from('brd_post')
    .select(
      'post_id, ctgr_cd, post_ttl, rgst_usr_nm, vw_cnt, pin_yn, answ_yn, acpt_cmnt_id, reg_dtm',
      { count: 'exact' },
    )
    .eq('ctgr_cd', ctgr.ctgr_cd)
    .eq('del_yn', 'N')
    .order('pin_yn', { ascending: false })
    .order('reg_dtm', { ascending: false })
    .range(from, from + limit - 1)

  const safeQ = q
    .replace(/[,()*]/g, '')
    .replace(/[%_\\]/g, '\\$&')
    .slice(0, 100)
  if (safeQ) {
    query = query.or(`post_ttl.ilike.%${safeQ}%,post_cont.ilike.%${safeQ}%`)
  }

  const { data, count, error } = await query
  if (error) {
    return NextResponse.json({ error: '목록 조회 실패' }, { status: 500 })
  }

  // 갤러리 게시판이면 각 게시글의 첫 번째 이미지를 thumb_url로 병합
  type PostRow = NonNullable<typeof data>[number]
  let posts: (PostRow & { thumb_url?: string | null })[] = data ?? []

  if (ctgr.gallery_yn === 'Y' && data && data.length > 0) {
    const postIds = data.map((p) => p.post_id)
    const { data: thumbRows } = await db
      .from('brd_attch')
      .select('post_id, fl_url')
      .in('post_id', postIds)
      .like('fl_tp', 'image/%')
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })
      .order('reg_dtm', { ascending: true })

    const thumbMap = new Map<string, string>()
    for (const row of thumbRows ?? []) {
      if (!thumbMap.has(row.post_id)) thumbMap.set(row.post_id, row.fl_url)
    }
    posts = data.map((p) => ({
      ...p,
      thumb_url: thumbMap.get(p.post_id) ?? null,
    }))
  }

  return NextResponse.json({
    posts,
    total: count ?? 0,
    page,
    limit,
    category: ctgr,
  })
}

// POST /api/board/[category]
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params
  const [ctgr, user] = await Promise.all([
    getCategory(category),
    getSessionUser(),
  ])

  if (!ctgr) {
    return NextResponse.json(
      { error: '존재하지 않는 게시판입니다' },
      { status: 404 },
    )
  }
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }
  if (!hasMinRole(user.role, ctgr.wr_min_role_cd)) {
    return NextResponse.json({ error: '작성 권한이 없습니다' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { post_ttl, post_cont } = body as {
    post_ttl?: string
    post_cont?: string
  }
  if (!post_ttl?.trim()) {
    return NextResponse.json({ error: '제목을 입력해주세요' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('brd_post')
    .insert({
      ctgr_cd: ctgr.ctgr_cd,
      post_ttl: sanitizeTitle(post_ttl),
      post_cont: post_cont ? sanitizeMarkdown(post_cont) : null,
      rgst_usr_id: user.id,
      rgst_usr_nm: user.display_name,
      regr_id: user.display_name.slice(0, 20),
      modr_id: user.display_name.slice(0, 20),
    })
    .select('post_id')
    .single()

  if (error) {
    return NextResponse.json({ error: '게시글 작성 실패' }, { status: 500 })
  }

  return NextResponse.json({ post_id: data.post_id }, { status: 201 })
}

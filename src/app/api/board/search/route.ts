import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/board/search?q=검색어&limit=20
// 통합검색 — 전 카테고리(brd_post)를 가로질러 제목·본문 substring 검색.
// 게시판 읽기는 공개이므로 인증 불필요. trigram 인덱스(idx_brd_post_*_trgm) 사용.
export interface BoardSearchResult {
  post_id: string
  ctgr_cd: string
  ctgr_nm: string
  post_ttl: string
  rgst_usr_nm: string | null
  reg_dtm: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(30, Math.max(1, Number(searchParams.get('limit') ?? 20)))

  if (!q) return NextResponse.json({ results: [] })

  // 와일드카드·메타문자 이스케이프 (board/[category] route와 동일 규칙)
  const safeQ = q
    .replace(/[,()*]/g, '')
    .replace(/[%_\\]/g, '\\$&')
    .slice(0, 100)
  if (!safeQ) return NextResponse.json({ results: [] })

  // brd_ctgr!inner + use_yn='Y' → 비활성 게시판 글은 제외하고 카테고리명도 함께 조회
  const { data, error } = await getSupabaseAdmin()
    .from('brd_post')
    .select(
      'post_id, ctgr_cd, post_ttl, rgst_usr_nm, reg_dtm, brd_ctgr!inner(ctgr_nm, use_yn)',
    )
    .eq('del_yn', 'N')
    .eq('brd_ctgr.use_yn', 'Y')
    .or(`post_ttl.ilike.%${safeQ}%,post_cont.ilike.%${safeQ}%`)
    .order('reg_dtm', { ascending: false })
    .limit(limit)

  if (error)
    return NextResponse.json({ error: '검색 실패' }, { status: 500 })

  type Row = {
    post_id: string
    ctgr_cd: string
    post_ttl: string
    rgst_usr_nm: string | null
    reg_dtm: string
    brd_ctgr: { ctgr_nm: string } | { ctgr_nm: string }[] | null
  }
  const results: BoardSearchResult[] = ((data ?? []) as Row[]).map((r) => {
    // PostgREST embed는 단건/배열 형태가 섞일 수 있어 방어적으로 평탄화
    const ctgr = Array.isArray(r.brd_ctgr) ? r.brd_ctgr[0] : r.brd_ctgr
    return {
      post_id: r.post_id,
      ctgr_cd: r.ctgr_cd,
      ctgr_nm: ctgr?.ctgr_nm ?? r.ctgr_cd,
      post_ttl: r.post_ttl,
      rgst_usr_nm: r.rgst_usr_nm,
      reg_dtm: r.reg_dtm,
    }
  })

  return NextResponse.json({ results })
}

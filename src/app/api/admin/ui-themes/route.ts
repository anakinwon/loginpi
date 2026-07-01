import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeThemeTokens } from '@/lib/ui-theme'

// GET /api/admin/ui-themes — 테마 목록 (논리삭제 제외, sort_ord 순)
export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ui_theme')
    .select(
      'theme_id, theme_nm, theme_desc, theme_tokens, actv_yn, lock_yn, apply_scope_cd, theme_fx_cd, sort_ord',
    )
    .eq('del_yn', 'N')
    .order('sort_ord', { ascending: true })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json({ themes: data })
}

// POST /api/admin/ui-themes — 테마 생성
export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as {
    theme_nm?: string
    theme_desc?: string
    theme_tokens?: unknown
    sort_ord?: number | null
  } | null

  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const nm = body.theme_nm?.trim() ?? ''
  if (!nm || nm.length > 50) {
    return NextResponse.json(
      { error: '테마명은 1~50자여야 합니다' },
      { status: 400 },
    )
  }

  // 색상 토큰은 화이트리스트 + sanitize 후 저장 (CSS 주입 차단)
  const tokens = sanitizeThemeTokens(body.theme_tokens)

  const { data, error } = await getSupabaseAdmin()
    .from('ui_theme')
    .insert({
      theme_nm: nm,
      theme_desc: body.theme_desc?.trim() || null,
      theme_tokens: tokens,
      actv_yn: 'N',
      lock_yn: 'N',
      sort_ord: body.sort_ord ?? 0,
      regr_id: requester?.id ?? 'ADMIN',
      modr_id: requester?.id ?? 'ADMIN',
    })
    .select(
      'theme_id, theme_nm, theme_desc, theme_tokens, actv_yn, lock_yn, sort_ord',
    )
    .single()

  if (error) return NextResponse.json({ error: '등록 실패' }, { status: 500 })
  return NextResponse.json({ theme: data }, { status: 201 })
}

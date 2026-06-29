import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeThemeTokens } from '@/lib/ui-theme'

// PATCH /api/admin/ui-themes/[themeId] — 테마 수정 (이름·설명·색상·정렬)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { themeId } = await params
  const body = (await req.json().catch(() => null)) as {
    theme_nm?: string
    theme_desc?: string
    theme_tokens?: unknown
    sort_ord?: number
  } | null

  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const patch: Record<string, unknown> = {
    modr_id: requester?.id ?? 'ADMIN',
    mod_dtm: new Date().toISOString(),
  }
  if (body.theme_nm !== undefined) {
    const nm = body.theme_nm.trim()
    if (!nm || nm.length > 50) {
      return NextResponse.json(
        { error: '테마명은 1~50자여야 합니다' },
        { status: 400 },
      )
    }
    patch.theme_nm = nm
  }
  if (body.theme_desc !== undefined)
    patch.theme_desc = body.theme_desc?.trim() || null
  if (body.theme_tokens !== undefined)
    patch.theme_tokens = sanitizeThemeTokens(body.theme_tokens)
  if (body.sort_ord !== undefined) patch.sort_ord = body.sort_ord

  const { data, error } = await getSupabaseAdmin()
    .from('ui_theme')
    .update(patch)
    .eq('theme_id', themeId)
    .eq('del_yn', 'N')
    .select(
      'theme_id, theme_nm, theme_desc, theme_tokens, actv_yn, lock_yn, sort_ord',
    )
    .maybeSingle()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  if (!data)
    return NextResponse.json(
      { error: '테마를 찾을 수 없습니다' },
      { status: 404 },
    )
  return NextResponse.json({ theme: data })
}

// DELETE /api/admin/ui-themes/[themeId] — 논리삭제 (활성·잠금 테마 거부)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { themeId } = await params
  const db = getSupabaseAdmin()

  // 활성·잠금 테마는 삭제 불가
  const { data: theme } = await db
    .from('ui_theme')
    .select('actv_yn, lock_yn')
    .eq('theme_id', themeId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!theme)
    return NextResponse.json(
      { error: '테마를 찾을 수 없습니다' },
      { status: 404 },
    )
  if ((theme as { actv_yn: string }).actv_yn === 'Y') {
    return NextResponse.json(
      { error: '활성 테마는 삭제할 수 없습니다' },
      { status: 409 },
    )
  }
  if ((theme as { lock_yn: string }).lock_yn === 'Y') {
    return NextResponse.json(
      { error: '기본 테마는 삭제할 수 없습니다' },
      { status: 409 },
    )
  }

  const now = new Date().toISOString()
  const { error } = await db
    .from('ui_theme')
    .update({
      del_yn: 'Y',
      del_dtm: now,
      modr_id: requester?.id ?? 'ADMIN',
      mod_dtm: now,
    })
    .eq('theme_id', themeId)
    .eq('del_yn', 'N')

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

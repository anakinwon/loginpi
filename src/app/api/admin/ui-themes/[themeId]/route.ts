import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeThemeTokens } from '@/lib/ui-theme'
import { apiError } from '@/lib/api-errors'

// PATCH /api/admin/ui-themes/[themeId] — 테마 수정 (이름·설명·색상·정렬)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const { themeId } = await params
  const body = (await req.json().catch(() => null)) as {
    theme_nm?: string
    theme_desc?: string
    theme_tokens?: unknown
    sort_ord?: number
  } | null

  if (!body) return apiError('BAD_REQUEST', 400)

  const patch: Record<string, unknown> = {
    modr_id: requester?.id ?? 'ADMIN',
    mod_dtm: new Date().toISOString(),
  }
  if (body.theme_nm !== undefined) {
    const nm = body.theme_nm.trim()
    if (!nm || nm.length > 50) {
      return apiError('ADM_THEME_NAME_LENGTH', 400)
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

  if (error) return apiError('UPDATE_FAILED', 500)
  if (!data) return apiError('ADM_THEME_NOT_FOUND', 404)
  return NextResponse.json({ theme: data })
}

// DELETE /api/admin/ui-themes/[themeId] — 논리삭제 (활성·잠금 테마 거부)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
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

  if (!theme) return apiError('ADM_THEME_NOT_FOUND', 404)
  if ((theme as { actv_yn: string }).actv_yn === 'Y') {
    return apiError('ADM_THEME_ACTIVE_DELETE_FORBIDDEN', 409)
  }
  if ((theme as { lock_yn: string }).lock_yn === 'Y') {
    return apiError('ADM_THEME_DEFAULT_DELETE_FORBIDDEN', 409)
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

  if (error) return apiError('DELETE_FAILED', 500)
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// POST /api/admin/feedback/hide
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) return apiError('FORBIDDEN', 403)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('BAD_REQUEST', 400)

  const { fbck_id, hide_yn, hide_reason_txt } = body as {
    fbck_id: string
    hide_yn: 'Y' | 'N'
    hide_reason_txt?: string
  }

  if (!fbck_id) return apiError('ADM_FBCK_ID_REQUIRED', 400)
  if (hide_yn !== 'Y' && hide_yn !== 'N') {
    return apiError('ADM_FBCK_HIDE_YN_INVALID', 400)
  }
  if (hide_yn === 'Y' && !hide_reason_txt?.trim()) {
    return apiError('ADM_FBCK_HIDE_REASON_REQUIRED', 400)
  }

  const db = getSupabaseAdmin()
  const { data: existing } = await db
    .from('fbck_mst')
    .select('fbck_id')
    .eq('fbck_id', fbck_id)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!existing) return apiError('FBCK_NOT_FOUND', 404)

  const updates: Record<string, unknown> = {
    hide_yn,
    modr_id: user!.id,
  }

  if (hide_yn === 'Y') {
    updates.hide_reason_txt = hide_reason_txt!.trim()
    updates.hide_dtm = new Date().toISOString()
  } else {
    updates.hide_reason_txt = null
    updates.hide_dtm = null
  }

  const { error } = await db
    .from('fbck_mst')
    .update(updates)
    .eq('fbck_id', fbck_id)
  if (error) return apiError('ADM_PROCESS_FAILED', 500)

  return NextResponse.json({
    ok: true,
    message:
      hide_yn === 'Y' ? '후기를 숨겼습니다.' : '후기를 다시 공개했습니다.',
  })
}

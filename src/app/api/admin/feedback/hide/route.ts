import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// POST /api/admin/feedback/hide
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const { fbck_id, hide_yn, hide_reason_txt } = body as {
    fbck_id: string
    hide_yn: 'Y' | 'N'
    hide_reason_txt?: string
  }

  if (!fbck_id)
    return NextResponse.json({ error: 'fbck_id가 필요합니다' }, { status: 400 })
  if (hide_yn !== 'Y' && hide_yn !== 'N') {
    return NextResponse.json(
      { error: 'hide_yn은 Y 또는 N이어야 합니다' },
      { status: 400 },
    )
  }
  if (hide_yn === 'Y' && !hide_reason_txt?.trim()) {
    return NextResponse.json(
      { error: '숨김 처리 시 사유를 입력해 주세요' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()
  const { data: existing } = await db
    .from('fbck_mst')
    .select('fbck_id')
    .eq('fbck_id', fbck_id)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!existing)
    return NextResponse.json(
      { error: '후기를 찾을 수 없습니다' },
      { status: 404 },
    )

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
  if (error) return NextResponse.json({ error: '처리 실패' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    message:
      hide_yn === 'Y' ? '후기를 숨겼습니다.' : '후기를 다시 공개했습니다.',
  })
}

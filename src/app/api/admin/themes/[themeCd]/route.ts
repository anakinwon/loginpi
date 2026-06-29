import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// theme_cd(PK)는 식별자로만 사용 — 수정 불가. 나머지 속성만 PATCH.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ themeCd: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { themeCd } = await params
  const body = (await req.json()) as {
    theme_nm?: string
    theme_nm_en?: string
    theme_emoji?: string
    theme_desc?: string
    theme_tp_cd?: string
    sort_ord?: number | null
    use_yn?: string
  }

  const patch: Record<string, unknown> = {}
  if (body.theme_nm !== undefined) patch.theme_nm = body.theme_nm.trim()
  if (body.theme_nm_en !== undefined)
    patch.theme_nm_en = body.theme_nm_en?.trim() || null
  if (body.theme_emoji !== undefined)
    patch.theme_emoji = body.theme_emoji.trim()
  if (body.theme_desc !== undefined)
    patch.theme_desc = body.theme_desc?.trim() || null
  if (body.theme_tp_cd !== undefined)
    patch.theme_tp_cd = body.theme_tp_cd === 'PREMIUM' ? 'PREMIUM' : 'BASIC'
  if (body.sort_ord !== undefined) patch.sort_ord = body.sort_ord ?? 0
  if (body.use_yn !== undefined) patch.use_yn = body.use_yn === 'N' ? 'N' : 'Y'
  patch.modr_id = requester?.id ?? 'ADMIN'
  patch.mod_dtm = new Date().toISOString()

  const { data, error } = await getSupabaseAdmin()
    .from('msg_theme')
    .update(patch)
    .eq('theme_cd', themeCd)
    .eq('del_yn', 'N')
    .select()
    .single()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  return NextResponse.json({ theme: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ themeCd: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { themeCd } = await params

  // 물리 DELETE 금지 — 논리삭제(del_yn='Y' + del_dtm). 기존 카페는 존속.
  const now = new Date().toISOString()
  const { error } = await getSupabaseAdmin()
    .from('msg_theme')
    .update({
      del_yn: 'Y',
      del_dtm: now,
      mod_dtm: now,
      modr_id: requester?.id ?? 'ADMIN',
    })
    .eq('theme_cd', themeCd)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })

  return NextResponse.json({ success: true })
}

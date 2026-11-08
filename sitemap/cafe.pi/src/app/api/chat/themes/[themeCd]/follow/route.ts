import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ themeCd: string }> }

const THEME_CD_RE = /^[A-Z0-9_]{1,20}$/

// TASK-070: 테마 팔로우 — 팔로우한 테마의 신규 이벤트방 알림 구독
// POST /api/chat/themes/[themeCd]/follow — 팔로우
export async function POST(_request: NextRequest, { params }: Params) {
  const { themeCd } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (!THEME_CD_RE.test(themeCd)) {
    return apiError('CHAT_INVALID_THEME_CD', 400)
  }

  const db = getSupabaseAdmin()
  const { data: theme } = await db
    .from('msg_theme')
    .select('theme_cd')
    .eq('theme_cd', themeCd)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!theme) return apiError('CHAT_THEME_NOT_FOUND', 404)

  const slug = user.display_name.slice(0, 20)
  // 재팔로우(이전 언팔로우 row 존재) 대비 UPSERT — UNIQUE(theme_cd, usr_id)
  const { error } = await db.from('msg_theme_follow').upsert(
    {
      theme_cd: themeCd,
      usr_id: user.id,
      del_yn: 'N',
      del_dtm: null,
      regr_id: slug,
      modr_id: slug,
      mod_dtm: new Date().toISOString(),
    },
    { onConflict: 'theme_cd,usr_id' },
  )

  if (error) return apiError('CHAT_FOLLOW_FAILED', 500)
  return NextResponse.json({ followed: true }, { status: 201 })
}

// DELETE /api/chat/themes/[themeCd]/follow — 언팔로우 (논리삭제)
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { themeCd } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  if (!THEME_CD_RE.test(themeCd)) {
    return apiError('CHAT_INVALID_THEME_CD', 400)
  }

  const { error } = await getSupabaseAdmin()
    .from('msg_theme_follow')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user.display_name.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('theme_cd', themeCd)
    .eq('usr_id', user.id)
    .eq('del_yn', 'N')

  if (error) return apiError('CHAT_UNFOLLOW_FAILED', 500)
  return NextResponse.json({ followed: false })
}

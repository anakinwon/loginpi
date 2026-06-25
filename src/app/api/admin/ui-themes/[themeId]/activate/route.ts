import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// POST /api/admin/ui-themes/[themeId]/activate — 테마 활성화 + 적용 범위 설정
// body: { scope?: 'ADMIN' | 'GLOBAL' } (기본 ADMIN)
// 전체 비활성 후 대상만 활성 (부분 유니크 인덱스 uq_ui_theme_active와 정합)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ themeId: string }> },
) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { themeId } = await params
  const body = (await req.json().catch(() => ({}))) as { scope?: string }
  const scope = body.scope === 'GLOBAL' ? 'GLOBAL' : 'ADMIN'

  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  const modrId = requester?.id ?? 'ADMIN'

  // 대상 테마 존재 확인
  const { data: target } = await db
    .from('ui_theme')
    .select('theme_id')
    .eq('theme_id', themeId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!target) return NextResponse.json({ error: '테마를 찾을 수 없습니다' }, { status: 404 })

  // 1) 현재 활성 테마 모두 비활성 (부분 유니크 충돌 방지 — 먼저 비워야 함)
  const { error: clearErr } = await db
    .from('ui_theme')
    .update({ actv_yn: 'N', modr_id: modrId, mod_dtm: now })
    .eq('actv_yn', 'Y')
    .eq('del_yn', 'N')

  if (clearErr) return NextResponse.json({ error: '활성화 실패' }, { status: 500 })

  // 2) 대상 테마 활성화 + 적용 범위 설정
  const { error: setErr } = await db
    .from('ui_theme')
    .update({ actv_yn: 'Y', apply_scope_cd: scope, modr_id: modrId, mod_dtm: now })
    .eq('theme_id', themeId)
    .eq('del_yn', 'N')

  if (setErr) return NextResponse.json({ error: '활성화 실패' }, { status: 500 })
  return NextResponse.json({ ok: true, scope })
}

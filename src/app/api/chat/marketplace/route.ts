import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

// TASK-070: 카페 마켓플레이스 — 테마별 공개방 디렉토리 + 인기 랭킹
// GET /api/chat/marketplace?theme=<theme_cd>
// 랭킹 = fn_chat_marketplace RPC (멤버수×2 + 최근7일 메시지×0.5 + 최근7일 Tip×10)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const themeCd = new URL(request.url).searchParams.get('theme')
  // theme_cd 화이트리스트 패턴 (영대문자·숫자·언더스코어 20자) — 인젝션 방어
  if (themeCd && !/^[A-Z0-9_]{1,20}$/.test(themeCd)) {
    return NextResponse.json({ error: '유효하지 않은 테마 코드' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const [{ data: rooms, error }, { data: themes }, { data: follows }] = await Promise.all([
    db.rpc('fn_chat_marketplace', { p_theme_cd: themeCd ?? null, p_limit: 30 }),
    db
      .from('msg_theme')
      .select('theme_cd, theme_nm, theme_emoji, theme_tp_cd')
      .eq('use_yn', 'Y')
      .eq('del_yn', 'N')
      .order('sort_ord'),
    db
      .from('msg_theme_follow')
      .select('theme_cd')
      .eq('usr_id', user.id)
      .eq('del_yn', 'N'),
  ])

  if (error) return NextResponse.json({ error: '마켓플레이스 조회 실패' }, { status: 500 })

  return NextResponse.json({
    rooms: rooms ?? [],
    themes: themes ?? [],
    followedThemes: (follows ?? []).map((f: { theme_cd: string }) => f.theme_cd),
  })
}

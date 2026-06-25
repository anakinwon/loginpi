import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

export const revalidate = 120 // 2분 캐시 (공개 데이터)

// TASK-070: 카페 마켓플레이스 — 테마별 공개방 디렉토리 + 인기 랭킹
// GET /api/chat/marketplace?theme=<theme_cd>
// 랭킹 = fn_chat_marketplace RPC (멤버수×2 + 최근7일 메시지×0.5 + 최근7일 Bean×10)
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const themeCd = sp.get('theme')
  // theme_cd 화이트리스트 패턴 (영대문자·숫자·언더스코어 20자) — 인젝션 방어
  if (themeCd && !/^[A-Z0-9_]{1,20}$/.test(themeCd)) {
    return NextResponse.json(
      { error: '유효하지 않은 테마 코드' },
      { status: 400 },
    )
  }

  // 통합 검색어 — 카페이름·소개 prefix 검색. 길이 제한(50)만, 와일드카드 이스케이프는 RPC가 처리.
  const q = (sp.get('q') ?? '').trim().slice(0, 50)

  // 페이지네이션: page(0 기반), limit(기본 30, 최대 100)
  const page = Math.max(0, Number(sp.get('page') ?? '0'))
  const rawLimit = Number(sp.get('limit') ?? '30')
  const limit = Math.min(100, Math.max(1, rawLimit))
  const offset = page * limit

  const db = getSupabaseAdmin()
  // 검색어가 있으면 검색 RPC(이름·소개 UNION ALL prefix), 없으면 기존 인기 랭킹 RPC.
  const roomsRpc = q
    ? db.rpc('fn_chat_marketplace_search', {
        p_q: q,
        p_theme_cd: themeCd ?? null,
        p_limit: limit,
        p_offset: offset,
      })
    : db.rpc('fn_chat_marketplace', {
        p_theme_cd: themeCd ?? null,
        p_limit: limit,
        p_offset: offset,
      })

  const [{ data: rooms, error }, { data: themes }, { data: follows }] =
    await Promise.all([
      roomsRpc,
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

  if (error)
    return NextResponse.json(
      { error: '마켓플레이스 조회 실패' },
      { status: 500 },
    )

  return NextResponse.json({
    pagination: {
      page,
      limit,
      offset,
    },
    rooms: rooms ?? [],
    themes: themes ?? [],
    followedThemes: (follows ?? []).map(
      (f: { theme_cd: string }) => f.theme_cd,
    ),
  })
}

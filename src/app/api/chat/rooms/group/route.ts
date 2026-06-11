import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { canCreateRoom } from '@/lib/chat-auth'
import { createGroupRoom } from '@/lib/chat'

// 무료 테마(FITNESS) 또는 구독자의 월 무료 쿼터 내에서는 결제 없이 그룹방 생성 가능
// 서버에서 화이트리스트·구독 권한 검증 — 클라이언트 우회 방지
const FREE_THEME_CODES = new Set(['FITNESS'])

export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { theme_cd, room_nm, room_desc, is_public_yn, max_mbr_cnt, expr_dtm } = body as {
    theme_cd?: string
    room_nm?: string
    room_desc?: string
    is_public_yn?: 'Y' | 'N'
    max_mbr_cnt?: number
    expr_dtm?: string | null
  }

  if (!theme_cd) {
    return NextResponse.json({ error: '테마를 선택해 주세요' }, { status: 400 })
  }

  if (!FREE_THEME_CODES.has(theme_cd)) {
    const allowance = await canCreateRoom(user.id)
    if (!allowance.allowed) {
      return NextResponse.json({ error: '이 테마는 결제가 필요합니다' }, { status: 403 })
    }
  }
  if (!room_nm?.trim()) {
    return NextResponse.json({ error: '카페 이름을 입력해 주세요' }, { status: 400 })
  }

  try {
    const room = await createGroupRoom({
      userId: user.id,
      displayName: user.display_name,
      theme_cd,
      room_nm: room_nm.trim(),
      room_desc: room_desc?.trim() || null,
      is_public_yn: is_public_yn ?? 'Y',
      max_mbr_cnt: typeof max_mbr_cnt === 'number' ? max_mbr_cnt : 50,
      expr_dtm: expr_dtm ?? null,
    })
    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '카페 생성 실패' }, { status: 500 })
  }
}

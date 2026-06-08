import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { createGroupRoom } from '@/lib/chat'

// 무료 테마는 결제 없이 그룹방 생성 가능
// 서버에서 화이트리스트 검증 — 클라이언트 우회 방지
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

  const { theme_cd, room_nm, room_desc, is_public_yn, max_mbr_cnt } = body as {
    theme_cd?: string
    room_nm?: string
    room_desc?: string
    is_public_yn?: 'Y' | 'N'
    max_mbr_cnt?: number
  }

  if (!theme_cd || !FREE_THEME_CODES.has(theme_cd)) {
    return NextResponse.json({ error: '이 테마는 결제가 필요합니다' }, { status: 403 })
  }
  if (!room_nm?.trim()) {
    return NextResponse.json({ error: '채팅방 이름을 입력해 주세요' }, { status: 400 })
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
    })
    return NextResponse.json({ room }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '채팅방 생성 실패' }, { status: 500 })
  }
}

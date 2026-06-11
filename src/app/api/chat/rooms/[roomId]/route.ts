import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'
import { getRoom, getRoomMember, updateRoom, hashRoomPassword, toPublicRoom } from '@/lib/chat'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/chat/rooms/[roomId] — 카페 상세 + 멤버 목록
export async function GET(_request: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const [room, mbr] = await Promise.all([
    getRoom(roomId),
    getRoomMember(roomId, user.id),
  ])

  if (!room) return NextResponse.json({ error: '카페를 찾을 수 없습니다' }, { status: 404 })
  if (!mbr) {
    // 공개 그룹방·이벤트방이면 클라이언트가 입장 CTA를 보여줄 수 있도록 방 미리보기 포함
    // 이벤트방(E)은 entry_fee_pi를 함께 내려 결제 후 입장(Trigger 8) UI를 띄울 수 있게 한다
    if ((room.room_tp_cd === 'G' || room.room_tp_cd === 'E') && room.is_public_yn === 'Y') {
      // 종료된 이벤트방은 입장 불가
      if (room.room_tp_cd === 'E' && room.entry_expire_dtm && new Date(room.entry_expire_dtm) <= new Date()) {
        return NextResponse.json({ error: '종료된 이벤트방입니다' }, { status: 403 })
      }
      return NextResponse.json(
        {
          error: '카페 멤버가 아닙니다',
          isPublic: true,
          room: {
            room_nm: room.room_nm,
            theme_cd: room.theme_cd,
            room_tp_cd: room.room_tp_cd,
            entry_fee_pi: room.entry_fee_pi,
            entry_expire_dtm: room.entry_expire_dtm,
          },
        },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: '카페 멤버가 아닙니다' }, { status: 403 })
  }

  // 테마 이모지 — 클라이언트 게이트(ClientChatRoom) 헤더 렌더용
  const { data: theme } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_emoji')
    .eq('theme_cd', room.theme_cd)
    .single()
  const themeEmoji = (theme as { theme_emoji?: string } | null)?.theme_emoji ?? '💬'

  const { data: members } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('room_mbr_id, usr_id, mbr_role_cd, lst_read_msg_id, expire_dtm, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true })

  // 비밀번호 해시는 노출하지 않고 has_join_pwd 플래그만 내려보낸다
  return NextResponse.json({
    room: toPublicRoom(room),
    themeEmoji,
    members: members ?? [],
    myRole: mbr.mbr_role_cd,
  })
}

// PATCH /api/chat/rooms/[roomId] — 카페 수정 (방장 OWNER 전용)
// 공개/비밀 전환·비밀방 비밀번호·이름·설명·정원 변경
export async function PATCH(request: NextRequest, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const [room, mbr] = await Promise.all([getRoom(roomId), getRoomMember(roomId, user.id)])
  if (!room) return NextResponse.json({ error: '카페를 찾을 수 없습니다' }, { status: 404 })
  if (!mbr || mbr.mbr_role_cd !== 'OWNER') {
    return NextResponse.json({ error: '방장만 카페를 수정할 수 있습니다' }, { status: 403 })
  }
  if (room.room_tp_cd === 'D') {
    return NextResponse.json({ error: '1:1 카페는 수정할 수 없습니다' }, { status: 400 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { room_nm, room_desc, is_public_yn, max_mbr_cnt, join_pwd } = body as {
    room_nm?: string
    room_desc?: string | null
    is_public_yn?: 'Y' | 'N'
    max_mbr_cnt?: number
    // null/'' = 비밀번호 제거, 문자열 = 신규 설정, 누락(undefined) = 변경 안 함
    join_pwd?: string | null
  }

  const patch: Parameters<typeof updateRoom>[2] = {}

  if (room_nm !== undefined) {
    const nm = String(room_nm).trim()
    if (!nm || nm.length > 100) {
      return NextResponse.json({ error: '방 이름은 1~100자여야 합니다' }, { status: 400 })
    }
    patch.room_nm = nm
  }

  if (room_desc !== undefined) {
    const desc = room_desc === null ? null : String(room_desc).trim().slice(0, 500)
    patch.room_desc = desc || null
  }

  // 최종 공개 여부 — 비밀번호 처리 분기에 사용
  const nextPublic = is_public_yn ?? room.is_public_yn
  if (is_public_yn !== undefined) {
    if (is_public_yn !== 'Y' && is_public_yn !== 'N') {
      return NextResponse.json({ error: '공개 여부 값이 올바르지 않습니다' }, { status: 400 })
    }
    patch.is_public_yn = is_public_yn
  }

  if (max_mbr_cnt !== undefined) {
    const cnt = Number(max_mbr_cnt)
    if (!Number.isInteger(cnt) || cnt < 2 || cnt > 1000) {
      return NextResponse.json({ error: '정원은 2~1000명이어야 합니다' }, { status: 400 })
    }
    patch.max_mbr_cnt = cnt
  }

  // 비밀번호: 공개방으로 전환하면 자동 제거 / 비밀방이면 설정·변경·제거
  if (nextPublic === 'Y') {
    // 공개방은 비밀번호 무의미 — 명시적으로 제거
    if (join_pwd !== undefined || is_public_yn === 'Y') patch.join_pwd_hash = null
  } else if (join_pwd !== undefined) {
    if (join_pwd === null || join_pwd === '') {
      patch.join_pwd_hash = null
    } else {
      const pwd = String(join_pwd)
      if (pwd.length < 4 || pwd.length > 64) {
        return NextResponse.json({ error: '비밀번호는 4~64자여야 합니다' }, { status: 400 })
      }
      patch.join_pwd_hash = hashRoomPassword(pwd)
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 })
  }

  const updated = await updateRoom(roomId, user.display_name, patch)
  if (!updated) return NextResponse.json({ error: '카페 수정 실패' }, { status: 500 })

  return NextResponse.json({ room: toPublicRoom(updated) })
}

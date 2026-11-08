import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getRoomMember } from '@/lib/chat'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ roomId: string }> }

// GET /api/chat/rooms/[roomId]/members — 통화 멤버 피커용 (display_nm 포함)
export async function GET(_req: Request, { params }: Params) {
  const { roomId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const mbr = await getRoomMember(roomId, user.id)
  if (!mbr) return apiError('CHAT_NOT_MEMBER', 403)

  // msg_room_mbr ↔ sys_user 는 FK 제약이 없어 PostgREST 임베디드 조인 불가 →
  // 멤버를 먼저 조회하고 usr_id로 사용자명을 별도 조회해 병합한다.
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('msg_room_mbr')
    .select('usr_id, mbr_role_cd, reg_dtm')
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: true }) // 가입 순 — 패널은 접속 상태로 재정렬

  const rows = (data ?? []) as { usr_id: string; mbr_role_cd: string }[]
  const userIds = [...new Set(rows.map((r) => r.usr_id))]
  const nameMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('sys_user')
      .select('id, display_name')
      .in('id', userIds)
    for (const u of (users ?? []) as { id: string; display_name: string }[])
      nameMap.set(u.id, u.display_name)
  }

  const members = rows.map((r) => ({
    usr_id: r.usr_id,
    display_nm: nameMap.get(r.usr_id) ?? r.usr_id.slice(0, 8),
    mbr_role_cd: r.mbr_role_cd,
  }))

  return NextResponse.json({ members })
}

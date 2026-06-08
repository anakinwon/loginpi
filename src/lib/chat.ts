import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

export interface MsgRoom {
  room_id: string
  room_nm: string
  room_desc: string | null
  theme_cd: string
  room_tp_cd: 'D' | 'G' | 'E'
  max_mbr_cnt: number
  is_public_yn: 'Y' | 'N'
  entry_fee_pi: number
  entry_expire_dtm: string | null
  pymnt_id: string | null
  del_yn: 'Y' | 'N'
  reg_dtm: string
  mod_dtm: string
}

export interface MsgMsg {
  msg_id: string
  room_id: string
  snd_usr_id: string
  snd_usr_nm: string
  msg_cont: string | null
  msg_tp_cd: 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE' | 'STICKER' | 'TIP_NOTI' | 'SYSTEM'
  attch_url: string | null
  stkr_id: string | null
  ref_msg_id: string | null
  del_yn: 'Y' | 'N'
  reg_dtm: string
}

export interface MsgRoomMbr {
  room_mbr_id: string
  room_id: string
  usr_id: string
  mbr_role_cd: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'
  lst_read_msg_id: string | null
  expire_dtm: string | null
  del_yn: 'Y' | 'N'
}

export async function getRoom(roomId: string): Promise<MsgRoom | null> {
  const { data } = await getSupabaseAdmin()
    .from('msg_room')
    .select()
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .single()
  return (data as MsgRoom) ?? null
}

export async function getRoomMember(roomId: string, userId: string): Promise<MsgRoomMbr | null> {
  const { data } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select()
    .eq('room_id', roomId)
    .eq('usr_id', userId)
    .eq('del_yn', 'N')
    .single()
  if (!data) return null
  const mbr = data as MsgRoomMbr
  if (mbr.expire_dtm && new Date(mbr.expire_dtm) <= new Date()) return null
  return mbr
}

// 두 사용자가 공유하는 Direct Room 조회 또는 신규 생성
export async function getOrCreateDirectRoom(
  userId1: string,
  userId2: string,
  displayName1: string,
): Promise<MsgRoom> {
  const supabase = getSupabaseAdmin()

  // userId1이 속한 Direct Room 목록 조회
  const { data: myMbrs } = await supabase
    .from('msg_room_mbr')
    .select('room_id')
    .eq('usr_id', userId1)
    .eq('del_yn', 'N')

  if (myMbrs && myMbrs.length > 0) {
    const roomIds = myMbrs.map((r: { room_id: string }) => r.room_id)

    // 그 중 D타입 방 목록
    const { data: directRooms } = await supabase
      .from('msg_room')
      .select()
      .in('room_id', roomIds)
      .eq('room_tp_cd', 'D')
      .eq('del_yn', 'N')

    for (const room of directRooms ?? []) {
      const { data: otherMbr } = await supabase
        .from('msg_room_mbr')
        .select('room_mbr_id')
        .eq('room_id', room.room_id)
        .eq('usr_id', userId2)
        .eq('del_yn', 'N')
        .single()

      if (otherMbr) return room as MsgRoom
    }
  }

  // 신규 Direct Room 생성
  const slug = displayName1.slice(0, 20)
  const { data: room, error } = await supabase
    .from('msg_room')
    .insert({
      room_nm: 'Direct',
      theme_cd: 'CODING', // Direct Room은 테마 무관 — BASIC 기본값
      room_tp_cd: 'D',
      max_mbr_cnt: 2,
      is_public_yn: 'N',
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  if (error || !room) throw new Error('채팅방 생성 실패')

  await supabase.from('msg_room_mbr').insert([
    { room_id: room.room_id, usr_id: userId1, mbr_role_cd: 'OWNER',  regr_id: slug, modr_id: slug },
    { room_id: room.room_id, usr_id: userId2, mbr_role_cd: 'MEMBER', regr_id: slug, modr_id: slug },
  ])

  return room as MsgRoom
}

// rate limiting: 최근 1초 내 해당 사용자의 메시지 수
export async function getRecentMsgCount(roomId: string, userId: string): Promise<number> {
  const since = new Date(Date.now() - 1000).toISOString()
  const { count } = await getSupabaseAdmin()
    .from('msg_msg')
    .select('msg_id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('snd_usr_id', userId)
    .gte('reg_dtm', since)
    .eq('del_yn', 'N')
  return count ?? 0
}

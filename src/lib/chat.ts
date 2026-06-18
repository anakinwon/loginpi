import 'server-only'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
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
  expr_dtm: string // 카페 만료일시 (무료방=생성+7일, 그 외 기본 9999-12-31=영구)
  pymnt_id: string | null
  join_pwd_hash: string | null
  del_yn: 'Y' | 'N'
  reg_dtm: string
  mod_dtm: string
}

// 카페 만료 여부 — 무료 개설 방(7일 제한)이 만료됐는지 판정. 목록·입장·조회 공통 사용.
export function isRoomExpired(room: { expr_dtm?: string | null }): boolean {
  return !!room.expr_dtm && new Date(room.expr_dtm) <= new Date()
}

// 비밀방 입장 비밀번호 해시 — scrypt(salt 내장). 형식: scrypt$<saltHex>$<hashHex>
export function hashRoomPassword(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyRoomPassword(
  plain: string,
  stored: string | null,
): boolean {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = scryptSync(plain, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

// 비밀번호 해시를 제거한 안전한 방 객체 — API 응답 직렬화용 (해시 유출 방지)
export function toPublicRoom(
  room: MsgRoom,
): Omit<MsgRoom, 'join_pwd_hash'> & { has_join_pwd: boolean } {
  const { join_pwd_hash, ...rest } = room
  return { ...rest, has_join_pwd: !!join_pwd_hash }
}

export interface MsgMsg {
  msg_id: string
  room_id: string
  snd_usr_id: string
  snd_usr_nm: string
  msg_cont: string | null
  msg_tp_cd:
    | 'TEXT'
    | 'IMAGE'
    | 'FILE'
    | 'VOICE'
    | 'STICKER'
    | 'TIP_NOTI'
    | 'SYSTEM'
    | 'AI_REPLY'
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

export async function getRoomMember(
  roomId: string,
  userId: string,
): Promise<MsgRoomMbr | null> {
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

  if (error || !room) throw new Error('카페 생성 실패')

  await supabase.from('msg_room_mbr').insert([
    {
      room_id: room.room_id,
      usr_id: userId1,
      mbr_role_cd: 'OWNER',
      regr_id: slug,
      modr_id: slug,
    },
    {
      room_id: room.room_id,
      usr_id: userId2,
      mbr_role_cd: 'MEMBER',
      regr_id: slug,
      modr_id: slug,
    },
  ])

  return room as MsgRoom
}

// 그룹 카페 생성 (결제 완료 후 또는 무료 테마)
export async function createGroupRoom(params: {
  userId: string
  displayName: string
  theme_cd: string
  room_nm: string
  room_desc: string | null
  is_public_yn: 'Y' | 'N'
  max_mbr_cnt: number
  pymnt_id?: string | null
  expr_dtm?: string | null
}): Promise<MsgRoom> {
  const supabase = getSupabaseAdmin()
  const slug = params.displayName.slice(0, 20)

  const { data: room, error } = await supabase
    .from('msg_room')
    .insert({
      room_nm: params.room_nm,
      room_desc: params.room_desc,
      theme_cd: params.theme_cd,
      room_tp_cd: 'G',
      max_mbr_cnt: params.max_mbr_cnt,
      is_public_yn: params.is_public_yn,
      pymnt_id: params.pymnt_id ?? null,
      regr_id: slug,
      modr_id: slug,
      ...(params.expr_dtm ? { expr_dtm: params.expr_dtm } : {}),
    })
    .select()
    .single()

  if (error || !room) throw new Error('카페 생성 실패')

  await supabase.from('msg_room_mbr').insert({
    room_id: (room as MsgRoom).room_id,
    usr_id: params.userId,
    mbr_role_cd: 'OWNER',
    regr_id: slug,
    modr_id: slug,
  })

  return room as MsgRoom
}

// 이벤트 카페 생성 (BUSINESS 플랜 전용 — 유료 입장 + 종료 시각 설정)
export async function createEventRoom(params: {
  userId: string
  displayName: string
  theme_cd: string
  room_nm: string
  room_desc: string | null
  is_public_yn: 'Y' | 'N'
  max_mbr_cnt: number
  entry_fee_pi: number
  entry_expire_dtm: string
}): Promise<MsgRoom> {
  const supabase = getSupabaseAdmin()
  const slug = params.displayName.slice(0, 20)

  const { data: room, error } = await supabase
    .from('msg_room')
    .insert({
      room_nm: params.room_nm,
      room_desc: params.room_desc,
      theme_cd: params.theme_cd,
      room_tp_cd: 'E',
      max_mbr_cnt: params.max_mbr_cnt,
      is_public_yn: params.is_public_yn,
      entry_fee_pi: params.entry_fee_pi,
      entry_expire_dtm: params.entry_expire_dtm,
      regr_id: slug,
      modr_id: slug,
    })
    .select()
    .single()

  if (error || !room) throw new Error('이벤트방 생성 실패')

  await supabase.from('msg_room_mbr').insert({
    room_id: (room as MsgRoom).room_id,
    usr_id: params.userId,
    mbr_role_cd: 'OWNER',
    regr_id: slug,
    modr_id: slug,
  })

  return room as MsgRoom
}

// 카페 수정 (방장 전용) — 공개/비밀 전환·비밀번호·이름·설명·정원
// 권한 검증은 호출부(API)에서 OWNER 확인 후 진입한다.
export interface RoomUpdateInput {
  room_nm?: string
  room_desc?: string | null
  is_public_yn?: 'Y' | 'N'
  max_mbr_cnt?: number
  // 비밀번호 처리: undefined=변경 안 함, null=제거, string=신규 설정(해시는 호출부에서)
  join_pwd_hash?: string | null
}

export async function updateRoom(
  roomId: string,
  displayName: string,
  input: RoomUpdateInput,
): Promise<MsgRoom | null> {
  const patch: Record<string, unknown> = {
    modr_id: displayName.slice(0, 20),
    mod_dtm: new Date().toISOString(),
  }
  if (input.room_nm !== undefined) patch.room_nm = input.room_nm
  if (input.room_desc !== undefined) patch.room_desc = input.room_desc
  if (input.is_public_yn !== undefined) patch.is_public_yn = input.is_public_yn
  if (input.max_mbr_cnt !== undefined) patch.max_mbr_cnt = input.max_mbr_cnt
  if (input.join_pwd_hash !== undefined)
    patch.join_pwd_hash = input.join_pwd_hash

  const { data, error } = await getSupabaseAdmin()
    .from('msg_room')
    .update(patch)
    .eq('room_id', roomId)
    .eq('del_yn', 'N')
    .select()
    .single()

  if (error || !data) return null
  return data as MsgRoom
}

// rate limiting: 최근 1초 내 해당 사용자의 메시지 수
export async function getRecentMsgCount(
  roomId: string,
  userId: string,
): Promise<number> {
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

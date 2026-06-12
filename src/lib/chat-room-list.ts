import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 카페 목록 조회 공통 모듈 — /api/chat/rooms(Pi Browser 게이트)와 /chat SSR이 공유
// 내 카페·공개 카페 파이프라인을 병렬 실행하고 Bet 뱃지 조회를 1쿼리로 통합해
// 기존 직렬 5단계 → 3단계로 단축 (카페 목록 로딩 속도 개선)

const ROOM_SELECT = `room_id, room_nm, room_desc, theme_cd, room_tp_cd, is_public_yn,
  max_mbr_cnt, expr_dtm, reg_dtm, msg_theme(theme_nm, theme_emoji, theme_tp_cd)`

export type RoomRow = Record<string, unknown> & { room_id: string }

function buildCntMap(mbrRows: { room_id: string }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of mbrRows) map.set(m.room_id, (map.get(m.room_id) ?? 0) + 1)
  return map
}

// 내가 참여 중인 카페 — 멤버십 조회 후 방·멤버수 병렬 로드
async function listMyRooms(userId: string): Promise<RoomRow[]> {
  const db = getSupabaseAdmin()
  const { data: mbrs } = await db
    .from('msg_room_mbr')
    .select('room_id')
    .eq('usr_id', userId)
    .eq('del_yn', 'N')

  if (!mbrs || mbrs.length === 0) return []
  const roomIds = mbrs.map((m: { room_id: string }) => m.room_id)

  const [{ data, error }, { data: mbrRows }] = await Promise.all([
    db
      .from('msg_room')
      .select(ROOM_SELECT)
      .in('room_id', roomIds)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false }),
    db
      .from('msg_room_mbr')
      .select('room_id')
      .in('room_id', roomIds)
      .eq('del_yn', 'N'),
  ])
  if (error) throw new Error(error.message)

  const cntMap = buildCntMap((mbrRows ?? []) as { room_id: string }[])
  return ((data ?? []) as unknown as RoomRow[]).map((r) => ({
    ...r,
    cur_mbr_cnt: cntMap.get(r.room_id) ?? 0,
  }))
}

// 공개 그룹 카페 (최근 N개) — 방 조회 후 멤버수 로드
async function listPublicRooms(limit = 10): Promise<RoomRow[]> {
  const db = getSupabaseAdmin()
  const { data: publicRooms } = await db
    .from('msg_room')
    .select(ROOM_SELECT)
    .eq('is_public_yn', 'Y')
    .eq('room_tp_cd', 'G')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(limit)

  const rows = (publicRooms ?? []) as unknown as RoomRow[]
  if (rows.length === 0) return []

  const { data: pubMbrRows } = await db
    .from('msg_room_mbr')
    .select('room_id')
    .in(
      'room_id',
      rows.map((r) => r.room_id),
    )
    .eq('del_yn', 'N')

  const cntMap = buildCntMap((pubMbrRows ?? []) as { room_id: string }[])
  return rows.map((r) => ({ ...r, cur_mbr_cnt: cntMap.get(r.room_id) ?? 0 }))
}

// 진행 중(OPEN) Pi Bet 보유 방에 open_bet_yn='Y' 부여 — 두 목록을 합쳐 1쿼리로 처리
async function attachOpenBetYn(lists: RoomRow[][]): Promise<RoomRow[][]> {
  const allIds = lists.flat().map((r) => r.room_id)
  if (allIds.length === 0) return lists

  const { data } = await getSupabaseAdmin()
    .from('msg_bet')
    .select('room_id')
    .in('room_id', allIds)
    .eq('bet_st_cd', 'OPEN')
    .eq('del_yn', 'N')

  const betRoomIds = new Set(
    (data ?? []).map((b: { room_id: string }) => b.room_id),
  )
  return lists.map((rooms) =>
    rooms.map((r) => ({
      ...r,
      open_bet_yn: betRoomIds.has(r.room_id) ? 'Y' : 'N',
    })),
  )
}

// 카페 목록 통합 조회 — 내 카페·공개 카페 병렬 + Bet 뱃지 1쿼리
export async function getChatRoomLists(
  userId: string,
  includePublic: boolean,
): Promise<{ rooms: RoomRow[]; publicRooms: RoomRow[] }> {
  const [myRooms, publicRooms] = await Promise.all([
    listMyRooms(userId),
    includePublic ? listPublicRooms(10) : Promise.resolve([] as RoomRow[]),
  ])
  const [roomsWithBet, publicWithBet] = await attachOpenBetYn([
    myRooms,
    publicRooms,
  ])
  return { rooms: roomsWithBet, publicRooms: publicWithBet }
}

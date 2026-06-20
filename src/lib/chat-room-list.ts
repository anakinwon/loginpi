import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// 카페 목록 조회 공통 모듈 — /api/chat/rooms(Pi Browser 게이트)와 /chat SSR이 공유
// 내 카페·공개 카페 파이프라인을 병렬 실행하고 Bet 뱃지 조회를 1쿼리로 통합해
// 기존 직렬 5단계 → 3단계로 단축 (카페 목록 로딩 속도 개선)

const ROOM_SELECT = `room_id, room_nm, room_desc, theme_cd, room_tp_cd, is_public_yn,
  max_mbr_cnt, expr_dtm, entry_expire_dtm, reg_dtm, msg_theme(theme_nm, theme_emoji, theme_tp_cd)`

// 종료/만료 방 여부 — 그룹방은 expr_dtm(쿼리에서 처리), 이벤트방은 entry_expire_dtm 경과 시 종료.
// 종료된 방은 어떤 목록(구독·일반·탐색·마켓·검색)에도 노출하지 않는다.
function isEndedEvent(r: RoomRow): boolean {
  if (r.room_tp_cd !== 'E') return false
  const ee = r.entry_expire_dtm as string | null | undefined
  return !!ee && new Date(ee).getTime() <= Date.now()
}

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
      .gt('expr_dtm', new Date().toISOString()) // 만료된 무료방 숨김
      .order('reg_dtm', { ascending: false }),
    db
      .from('msg_room_mbr')
      .select('room_id')
      .in('room_id', roomIds)
      .eq('del_yn', 'N'),
  ])
  if (error) throw new Error(error.message)

  const cntMap = buildCntMap((mbrRows ?? []) as { room_id: string }[])
  // 내가 참여 중이라도 종료된 이벤트방은 목록에서 제외 (그룹 만료는 위 expr_dtm 쿼리에서 처리)
  return ((data ?? []) as unknown as RoomRow[])
    .filter((r) => !isEndedEvent(r))
    .map((r) => ({
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
    .gt('expr_dtm', new Date().toISOString()) // 만료된 무료방 숨김
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

// 카페 목록 통합 조회 — 내 카페·공개 카페 병렬
export async function getChatRoomLists(
  userId: string | null,
  includePublic: boolean,
): Promise<{ rooms: RoomRow[]; publicRooms: RoomRow[] }> {
  const [myRooms, publicRooms] = await Promise.all([
    // 비로그인(게스트)은 내 카페 없음 — 공개 카페만 노출
    userId ? listMyRooms(userId) : Promise.resolve([] as RoomRow[]),
    includePublic ? listPublicRooms(10) : Promise.resolve([] as RoomRow[]),
  ])
  return { rooms: myRooms, publicRooms }
}

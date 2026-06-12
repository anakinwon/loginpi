import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// PiVoice™ v3.0 — 음성채널 서버 로직 단일 소스 (PRD_9_VOICE_CHAT v3.0)
// 활성 참여자 = leave_dtm IS NULL AND del_yn='N'
//
// 권한 정책 (R1~R7):
//  - 방장(OWNER/ADMIN): 무조건 CONNECTED (보장 슬롯, 멤버 정원 미차지)
//  - 멤버: 처음 AUTO_SLOTS명 자동 CONNECTED → 이후 PENDING(방장 승인 대기)
//  - 멤버 (CONNECTED+PENDING) ≥ MAX_MEMBER_SLOTS면 신청 불가 → LISTEN_ONLY
//  - 상한은 env 설정값 (R7 — 향후 확대 가능, 하드코딩 금지)

export type MicState = 'CONNECTED' | 'PENDING' | 'LISTEN_ONLY'

// R7: 인원 상한 설정값 — 미설정 시 자동 2 / 멤버 최대 4 (방장 제외)
export const VOICE_AUTO_SLOTS = Number(process.env.VOICE_AUTO_SLOTS ?? 2)
export const VOICE_MAX_MEMBER_SLOTS = Number(
  process.env.VOICE_MAX_MEMBER_SLOTS ?? 4,
)

export interface VoiceParticipant {
  participant_id: string
  usr_id: string
  mic_yn: 'Y' | 'N' // 하위 호환 — mic_st_cd === 'CONNECTED'와 동기
  mic_st_cd: MicState
  owner_yn: 'Y' | 'N' // 방장(OWNER/ADMIN) 여부 — UI 표시·슬롯 계산용
  join_dtm: string
  display_nm: string
}

// 방의 방장(OWNER/ADMIN) usr_id 집합 — 보장 슬롯 판정용
export async function getRoomOwnerIds(roomId: string): Promise<Set<string>> {
  const { data } = await getSupabaseAdmin()
    .from('msg_room_mbr')
    .select('usr_id, mbr_role_cd')
    .eq('room_id', roomId)
    .in('mbr_role_cd', ['OWNER', 'ADMIN'])
    .eq('del_yn', 'N')
  return new Set(
    ((data ?? []) as { usr_id: string }[]).map((r) => r.usr_id),
  )
}

// 방의 활성 참여자 목록 (표시명·방장 여부 포함)
export async function getActiveParticipants(
  roomId: string,
): Promise<VoiceParticipant[]> {
  const [{ data }, ownerIds] = await Promise.all([
    getSupabaseAdmin()
      .from('msg_call_participant')
      .select(
        'participant_id, usr_id, mic_yn, mic_st_cd, join_dtm, sys_user!inner(display_name)',
      )
      .eq('room_id', roomId)
      .is('leave_dtm', null)
      .eq('del_yn', 'N')
      .order('join_dtm', { ascending: true }),
    getRoomOwnerIds(roomId),
  ])

  type Row = {
    participant_id: string
    usr_id: string
    mic_yn: 'Y' | 'N'
    mic_st_cd: MicState
    join_dtm: string
    sys_user: { display_name: string } | { display_name: string }[] | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const su = Array.isArray(r.sys_user) ? r.sys_user[0] : r.sys_user
    return {
      participant_id: r.participant_id,
      usr_id: r.usr_id,
      mic_yn: r.mic_yn,
      mic_st_cd: r.mic_st_cd,
      owner_yn: ownerIds.has(r.usr_id) ? 'Y' : 'N',
      join_dtm: r.join_dtm,
      display_nm: su?.display_name ?? r.usr_id.slice(0, 8),
    }
  })
}

// 사용자의 활성 참여 row (없으면 null — 미입장 상태)
export async function getActiveParticipant(
  roomId: string,
  usrId: string,
): Promise<{
  participant_id: string
  mic_yn: 'Y' | 'N'
  mic_st_cd: MicState
  join_dtm: string
} | null> {
  const { data } = await getSupabaseAdmin()
    .from('msg_call_participant')
    .select('participant_id, mic_yn, mic_st_cd, join_dtm')
    .eq('room_id', roomId)
    .eq('usr_id', usrId)
    .is('leave_dtm', null)
    .eq('del_yn', 'N')
    .maybeSingle()
  return (
    (data as {
      participant_id: string
      mic_yn: 'Y' | 'N'
      mic_st_cd: MicState
      join_dtm: string
    } | null) ?? null
  )
}

// 멤버(비방장) 슬롯 점유 현황 — R2~R4·R6 판정의 기준
export function countMemberSlots(participants: VoiceParticipant[]): {
  connected: number // 송출 중인 멤버 수
  occupied: number // CONNECTED + PENDING (신청 포함 점유 슬롯)
} {
  const members = participants.filter((p) => p.owner_yn === 'N')
  const connected = members.filter((p) => p.mic_st_cd === 'CONNECTED').length
  const pending = members.filter((p) => p.mic_st_cd === 'PENDING').length
  return { connected, occupied: connected + pending }
}

// 신규 입장자의 mic 상태 결정 (R1·R3·R4·R6)
export function decideMicStateOnJoin(
  isOwner: boolean,
  participants: VoiceParticipant[],
): MicState {
  if (isOwner) return 'CONNECTED' // R1: 방장 보장 슬롯
  const { connected, occupied } = countMemberSlots(participants)
  if (connected < VOICE_AUTO_SLOTS && occupied < VOICE_MAX_MEMBER_SLOTS)
    return 'CONNECTED' // R3: 자동 슬롯
  if (occupied < VOICE_MAX_MEMBER_SLOTS) return 'PENDING' // R4: 승인 대기
  return 'LISTEN_ONLY' // R6: 정원 초과 — 청취 전용
}

// mic 상태 갱신 (mic_yn 동기화 포함)
export async function updateMicState(
  participantId: string,
  micState: MicState,
  modrId: string,
): Promise<void> {
  await getSupabaseAdmin()
    .from('msg_call_participant')
    .update({
      mic_st_cd: micState,
      mic_yn: micState === 'CONNECTED' ? 'Y' : 'N',
      modr_id: modrId.slice(0, 20),
      mod_dtm: new Date().toISOString(),
    })
    .eq('participant_id', participantId)
}

// 통화 세션 메타 best-effort 기록 — 첫 입장 시 세션 시작
export async function openCallSessionIfFirst(
  roomId: string,
  activeCount: number,
): Promise<void> {
  if (activeCount > 0) return
  await getSupabaseAdmin()
    .from('msg_call_log')
    .insert({ room_id: roomId, start_dtm: new Date().toISOString() })
}

// 마지막 참여자 퇴장 시 세션 종료 (열린 세션 중 최신 1건)
export async function closeCallSessionIfLast(
  roomId: string,
  remainingCount: number,
): Promise<void> {
  if (remainingCount > 0) return
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('msg_call_log')
    .select('call_id, start_dtm')
    .eq('room_id', roomId)
    .is('end_dtm', null)
    .eq('del_yn', 'N')
    .order('start_dtm', { ascending: false })
    .limit(1)
    .maybeSingle()
  const session = data as { call_id: string; start_dtm: string } | null
  if (!session) return

  const end = new Date()
  const durationSec = Math.max(
    0,
    Math.round((end.getTime() - new Date(session.start_dtm).getTime()) / 1000),
  )
  await supabase
    .from('msg_call_log')
    .update({
      end_dtm: end.toISOString(),
      duration_sec: durationSec,
      end_rsn_cd: 'ALL_LEFT',
      mod_dtm: end.toISOString(),
    })
    .eq('call_id', session.call_id)
}

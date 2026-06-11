import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

// PiVoice™ v2.0 — N:N 음성채널 서버 로직 단일 소스 (PRD_9_VOICE_CHAT v2.0)
// 활성 참여자 = leave_dtm IS NULL AND del_yn='N'

// 동시 마이크 활성 상한 — 5명째부터는 청취 전용(mic_yn='N') 강제 입장
export const MAX_ACTIVE_MICS = 4

export interface VoiceParticipant {
  participant_id: string
  usr_id: string
  mic_yn: 'Y' | 'N'
  join_dtm: string
  display_nm: string
}

// 방의 활성 참여자 목록 (표시명 포함 — 패널 UI·시그널링 대상 계산용)
export async function getActiveParticipants(
  roomId: string,
): Promise<VoiceParticipant[]> {
  const { data } = await getSupabaseAdmin()
    .from('msg_call_participant')
    .select(
      'participant_id, usr_id, mic_yn, join_dtm, sys_user!inner(display_name)',
    )
    .eq('room_id', roomId)
    .is('leave_dtm', null)
    .eq('del_yn', 'N')
    .order('join_dtm', { ascending: true })

  type Row = {
    participant_id: string
    usr_id: string
    mic_yn: 'Y' | 'N'
    join_dtm: string
    sys_user: { display_name: string } | { display_name: string }[] | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const su = Array.isArray(r.sys_user) ? r.sys_user[0] : r.sys_user
    return {
      participant_id: r.participant_id,
      usr_id: r.usr_id,
      mic_yn: r.mic_yn,
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
  join_dtm: string
} | null> {
  const { data } = await getSupabaseAdmin()
    .from('msg_call_participant')
    .select('participant_id, mic_yn, join_dtm')
    .eq('room_id', roomId)
    .eq('usr_id', usrId)
    .is('leave_dtm', null)
    .eq('del_yn', 'N')
    .maybeSingle()
  return (
    (data as {
      participant_id: string
      mic_yn: 'Y' | 'N'
      join_dtm: string
    } | null) ?? null
  )
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

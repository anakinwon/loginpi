import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { sanitizePlain } from './sanitize'
import { broadcastToRoom } from './realtime-broadcast'
import { enqueueChatNoti } from './chat-noti'
import { sendTelegramMessage } from './telegram'

// 텔레그램 봇으로 받은 일반 텍스트(인용답장)를 원래 대화방(msg_room)으로 중계한다. (PRD_13 §18-6)
//   라우팅 3중: ① reply_to → msg_tlgm_out 역조회(정확) ② sys_user.cur_relay_room_id 폴백 ③ 없으면 안내.
//   방 결정 후 msg_msg INSERT → 앱 broadcast + 상대 텔레그램 재푸시(enqueueChatNoti)로 왕복 완성.
//   보안: 발신자가 그 방의 활성 멤버인지 검증(남의 방 주입 차단). 발신자 식별 = tlgm_chat_id 매핑(연동자만).

export interface RelayResult {
  ok: boolean
  reason?: string
}

export async function relayTelegramReply(params: {
  chatId: number
  text: string
  replyToMsgId?: number
}): Promise<RelayResult> {
  const { chatId, text, replyToMsgId } = params
  const db = getSupabaseAdmin()

  // 발신자 식별 (연동된 사용자만)
  const { data: sender } = await db
    .from('sys_user')
    .select('id, display_name, cur_relay_room_id')
    .eq('tlgm_chat_id', chatId)
    .eq('tlgm_conn_yn', 'Y')
    .maybeSingle()
  const s = sender as {
    id: string
    display_name: string | null
    cur_relay_room_id: string | null
  } | null
  if (!s) return { ok: false, reason: 'NOT_LINKED' }

  // 방 결정: 인용답장(reply_to) 역조회 우선 → 현재 방 폴백
  let roomId: string | null = null
  if (replyToMsgId != null) {
    const { data: map } = await db
      .from('msg_tlgm_out')
      .select('room_id')
      .eq('recv_chat_id', chatId)
      .eq('tlgm_msg_id', replyToMsgId)
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .maybeSingle()
    roomId = (map as { room_id: string } | null)?.room_id ?? null
  }
  if (!roomId) roomId = s.cur_relay_room_id

  if (!roomId) {
    await sendTelegramMessage(
      chatId,
      '💬 답장할 대화를 찾지 못했어요. 알림 메시지의 <b>답장하기</b>를 눌러 회신해 주세요.',
    )
    return { ok: false, reason: 'NO_ROOM' }
  }

  // 발신자가 이 방의 활성 멤버인지 검증 (남의 방 주입 차단)
  const { data: mbr } = await db
    .from('msg_room_mbr')
    .select('room_mbr_id')
    .eq('room_id', roomId)
    .eq('usr_id', s.id)
    .eq('del_yn', 'N')
    .maybeSingle()
  if (!mbr) {
    await sendTelegramMessage(chatId, '⚠️ 이 대화에 참여하고 있지 않습니다.')
    return { ok: false, reason: 'NOT_MEMBER' }
  }

  const senderNm = (s.display_name ?? '사용자').slice(0, 100)

  // 메시지 삽입 (앱 내 DM과 동일한 msg_room 공유 — 단일 이력)
  const { data: inserted, error } = await db
    .from('msg_msg')
    .insert({
      room_id: roomId,
      snd_usr_id: s.id,
      snd_usr_nm: senderNm,
      msg_cont: sanitizePlain(text),
      msg_tp_cd: 'TEXT',
      regr_id: senderNm.slice(0, 20),
      modr_id: senderNm.slice(0, 20),
    })
    .select()
    .single()
  if (error || !inserted) {
    await sendTelegramMessage(
      chatId,
      '⚠️ 메시지 전송에 실패했어요. 잠시 후 다시 시도해 주세요.',
    )
    return { ok: false, reason: 'INSERT_FAILED' }
  }

  // 현재 방 갱신 (다음 인용 없는 답장의 라우팅 폴백)
  await db
    .from('sys_user')
    .update({ cur_relay_room_id: roomId, mod_dtm: new Date().toISOString() })
    .eq('id', s.id)

  // 재전파: 앱 broadcast(상대 앱 열림 시 즉시) + 상대 텔레그램 재푸시(오프라인)
  await broadcastToRoom(roomId, 'new_msg', inserted)
  await enqueueChatNoti({
    msg_id: inserted.msg_id,
    room_id: roomId,
    snd_usr_id: s.id,
    snd_usr_nm: inserted.snd_usr_nm,
    msg_cont: inserted.msg_cont,
    msg_tp_cd: inserted.msg_tp_cd,
  })

  return { ok: true }
}

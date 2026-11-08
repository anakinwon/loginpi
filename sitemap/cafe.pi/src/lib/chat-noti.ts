import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { sendTelegramMessage, escapeHtml, isTelegramEnabled } from './telegram'

// P2P 채팅 알림 미러 (PRD_13 §18 — 당근마켓 앱 푸시 대체)
//   앱 내 DM(msg_room room_tp_cd='D') 새 메시지를 상대 Telegram으로 푸시한다.
//   Pi Browser는 WebView라 푸시가 없어 상대가 앱을 닫으면 새 메시지를 모른다 → 텔레그램으로 도달성 확보.
//   enqueue(즉시 적재) / dispatch(지연 T초 + 미읽음 게이트 발송)를 분리 — 발송 실패가 채팅을 막지 않게.
//   발송 시 msg_tlgm_out에 message_id를 기록 → 사용자의 인용답장(reply_to)을 방으로 역라우팅(3단계 릴레이).

const MAX_RETRY = 3
// 미러 지연(초): 이 시간 내 상대가 앱에서 읽으면 Telegram 발송 skip (푸시 스팸 방지)
const CHAT_NOTI_DELAY_SEC = 45

interface ChatMirrorMsg {
  msg_id: string
  room_id: string
  snd_usr_id: string
  snd_usr_nm: string | null
  msg_cont: string | null
  msg_tp_cd: string
}

// 메시지 타입 → 미리보기 라벨 (본문은 80자 절단)
function previewOf(m: ChatMirrorMsg): string {
  if (m.msg_tp_cd === 'TEXT') return (m.msg_cont ?? '').slice(0, 80)
  const LABEL: Record<string, string> = {
    IMAGE: '[사진]',
    FILE: '[파일]',
    VOICE: '[음성]',
    STICKER: '[스티커]',
  }
  return LABEL[m.msg_tp_cd] ?? '[메시지]'
}

// (A) enqueue — 1:1 DM 새 메시지를 상대별 CHAT 알림으로 아웃박스 적재.
//   room_tp_cd='D'만 대상(그룹/이벤트 제외). 상대 미연동 판정은 dispatch에서(기존 폴백 로직과 일관).
export async function enqueueChatNoti(
  msg: ChatMirrorMsg,
  opts?: { piAppDomain?: string | null; appUrl?: string | null },
): Promise<void> {
  const db = getSupabaseAdmin()

  // DM만 미러 (그룹·이벤트방은 스팸 방지 위해 제외)
  const { data: room } = await db
    .from('msg_room')
    .select('room_id, room_tp_cd, room_nm')
    .eq('room_id', msg.room_id)
    .maybeSingle()
  const r = room as { room_tp_cd: string; room_nm: string | null } | null
  if (!r || r.room_tp_cd !== 'D') return

  // 상대방(발신자 제외 활성 멤버)
  const { data: mbrs } = await db
    .from('msg_room_mbr')
    .select('usr_id')
    .eq('room_id', msg.room_id)
    .eq('del_yn', 'N')
  const others = [
    ...new Set(
      (mbrs ?? [])
        .map((m) => (m as { usr_id: string }).usr_id)
        .filter((id) => id !== msg.snd_usr_id),
    ),
  ]
  if (others.length === 0) return

  const body = JSON.stringify({
    room_id: msg.room_id,
    src_msg_id: msg.msg_id,
    room_nm: r.room_nm,
    sndr_alias: msg.snd_usr_nm ?? '상대방',
    msg_preview: previewOf(msg),
    pi_app_domain: opts?.piAppDomain ?? null,
    app_url: opts?.appUrl ?? null,
  })

  const rows = others.map((rid) => ({
    recv_usr_id: rid,
    room_id: msg.room_id,
    noti_tp_cd: 'CHAT',
    noti_chnl_cd: 'TELEGRAM',
    noti_body: body,
    regr_id: 'SYSTEM',
    modr_id: 'SYSTEM',
  }))
  await db.from('msg_noti_outbox').insert(rows)
}

interface ChatNotiBody {
  room_id: string
  src_msg_id: string
  room_nm: string | null
  sndr_alias: string
  msg_preview: string
  pi_app_domain?: string | null
  app_url?: string | null
}

// 텔레그램 버튼(https) → /ko/open 브리지 → Pi Browser 채팅방 딥링크 (mps-noti orderDeepLink와 동일 전략)
function chatDeepLink(body: ChatNotiBody): string {
  const piDomain = body.pi_app_domain
    ?.replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const base = piDomain
    ? `https://${piDomain}`
    : (body.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://cafe.pi')
  return `${base}/ko/open?to=${encodeURIComponent('/ko/chat/' + body.room_id)}`
}

// HTML 메시지 본문 — 동적 값은 escapeHtml 처리
function buildChatMessage(body: ChatNotiBody): string {
  const roomLabel = body.room_nm ? ` <b>${escapeHtml(body.room_nm)}</b>` : ''
  return [
    `💬 <b>새 메시지</b>${roomLabel}`,
    '',
    `👤 ${escapeHtml(body.sndr_alias)}`,
    escapeHtml(body.msg_preview || '[메시지]'),
  ].join('\n')
}

interface ChatDispatchResult {
  sent: number
  failed: number
  skipped: number
}

// (B) dispatch — 지연·미읽음 게이트를 통과한 CHAT 알림을 Telegram 발송 + msg_tlgm_out 기록(인용답장 라우팅).
//   cron(chat-noti) 및 on-demand에서 호출. 멱등·재시도: 성공 sent_yn='Y', 실패 retry_cnt++.
export async function dispatchChatNotis(
  limit = 100,
): Promise<ChatDispatchResult> {
  const result: ChatDispatchResult = { sent: 0, failed: 0, skipped: 0 }
  if (!isTelegramEnabled()) return result

  const db = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - CHAT_NOTI_DELAY_SEC * 1000).toISOString()

  const { data } = await db
    .from('msg_noti_outbox')
    .select('noti_id, recv_usr_id, room_id, noti_body, retry_cnt')
    .eq('noti_tp_cd', 'CHAT')
    .eq('noti_chnl_cd', 'TELEGRAM')
    .eq('sent_yn', 'N')
    .eq('del_yn', 'N')
    .lt('retry_cnt', MAX_RETRY)
    .lte('reg_dtm', cutoff) // 지연 게이트: 적재 후 T초 경과분만 (그 사이 읽으면 아래 미읽음 게이트가 skip)
    .order('reg_dtm', { ascending: true })
    .limit(limit)

  const rows =
    (data as Array<{
      noti_id: string
      recv_usr_id: string
      room_id: string
      noti_body: string
      retry_cnt: number
    }> | null) ?? []
  if (rows.length === 0) return result

  // 수신자 텔레그램 연동 일괄 조회 (N+1 방지)
  const recvIds = [...new Set(rows.map((r) => r.recv_usr_id))]
  const { data: users } = await db
    .from('sys_user')
    .select('id, tlgm_chat_id, tlgm_conn_yn')
    .in('id', recvIds)
  const byId = new Map(
    (users ?? []).map((u) => [
      (u as { id: string }).id,
      u as { id: string; tlgm_chat_id: number | null; tlgm_conn_yn: string },
    ]),
  )

  for (const row of rows) {
    let body: ChatNotiBody
    try {
      body = JSON.parse(row.noti_body) as ChatNotiBody
    } catch {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'BAD_BODY' })
        .eq('noti_id', row.noti_id)
      result.failed++
      continue
    }

    const u = byId.get(row.recv_usr_id)
    const chatId =
      u && u.tlgm_conn_yn === 'Y' && u.tlgm_chat_id ? u.tlgm_chat_id : undefined

    // 텔레그램 미연동 — 앱 내 안읽은 뱃지가 안전망. 재시도 큐에서 이탈.
    if (!chatId) {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'NO_TELEGRAM_CONN' })
        .eq('noti_id', row.noti_id)
      result.skipped++
      continue
    }

    // 미읽음 게이트: 지연 사이에 상대가 앱에서 읽었으면 skip (푸시 스팸 방지)
    if (
      await isAlreadyRead(db, row.room_id, row.recv_usr_id, body.src_msg_id)
    ) {
      await db
        .from('msg_noti_outbox')
        .update({ sent_yn: 'Y', fail_reas: 'READ_SKIP', modr_id: 'SYSTEM' })
        .eq('noti_id', row.noti_id)
      result.skipped++
      continue
    }

    const res = await sendTelegramMessage(chatId, buildChatMessage(body), [
      { text: '💬 답장하기', url: chatDeepLink(body) },
    ])

    if (res.ok) {
      // 인용답장 라우팅 매핑 기록 (3단계 릴레이 재료)
      await db.from('msg_tlgm_out').insert({
        room_id: row.room_id,
        recv_usr_id: row.recv_usr_id,
        recv_chat_id: chatId,
        tlgm_msg_id: res.messageId ?? null,
        src_msg_id: body.src_msg_id,
        regr_id: 'SYSTEM',
        modr_id: 'SYSTEM',
      })
      await db
        .from('msg_noti_outbox')
        .update({
          sent_yn: 'Y',
          sent_dtm: new Date().toISOString(),
          tlgm_msg_id: res.messageId ?? null,
          fail_reas: null,
          modr_id: 'SYSTEM',
        })
        .eq('noti_id', row.noti_id)
      result.sent++
    } else {
      await db
        .from('msg_noti_outbox')
        .update({
          retry_cnt: row.retry_cnt + 1,
          fail_reas: res.error ?? 'SEND_FAILED',
          modr_id: 'SYSTEM',
        })
        .eq('noti_id', row.noti_id)
      result.failed++
    }
  }

  return result
}

// 수신자가 이 방에서 마지막으로 읽은 메시지가 대상 메시지 이후(같거나 최신)이면 읽음 처리
//   msg_id는 UUID라 순서 비교 불가 → lst_read 메시지와 대상 메시지의 reg_dtm을 비교한다.
async function isAlreadyRead(
  db: ReturnType<typeof getSupabaseAdmin>,
  roomId: string,
  recvUsrId: string,
  srcMsgId: string,
): Promise<boolean> {
  const { data: mbr } = await db
    .from('msg_room_mbr')
    .select('lst_read_msg_id')
    .eq('room_id', roomId)
    .eq('usr_id', recvUsrId)
    .maybeSingle()
  const lastRead = (mbr as { lst_read_msg_id: string | null } | null)
    ?.lst_read_msg_id
  if (!lastRead) return false
  if (lastRead === srcMsgId) return true

  const { data: msgs } = await db
    .from('msg_msg')
    .select('msg_id, reg_dtm')
    .in('msg_id', [lastRead, srcMsgId])
  const dtm = new Map(
    (msgs ?? []).map((m) => [
      (m as { msg_id: string }).msg_id,
      (m as { reg_dtm: string }).reg_dtm,
    ]),
  )
  const lastReadDtm = dtm.get(lastRead)
  const srcDtm = dtm.get(srcMsgId)
  if (!lastReadDtm || !srcDtm) return false
  return new Date(lastReadDtm).getTime() >= new Date(srcDtm).getTime()
}

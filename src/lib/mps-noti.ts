import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { sendTelegramMessage, escapeHtml, isTelegramEnabled } from './telegram'

// MPS 주문 알림 디스패처 — msg_noti_outbox(sent_yn='N')를 읽어 Telegram으로 발송.
//   enqueue(markEscrow 시 적재)와 분리: "발송 실패"가 주문/결제에 영향 주지 않게 한다.
//   멱등·재시도: 성공 시 sent_yn='Y', 실패 시 retry_cnt++ (MAX_RETRY 도달 시 큐에서 이탈, Pull 뱃지가 안전망).

const MAX_RETRY = 3

// 주문방법 코드 → 한글 라벨 (없으면 '매장 수령')
const ORDER_MTHD_LABEL: Record<string, string> = {
  DINE_IN: '매장 식사',
  PICKUP: '포장',
  DELIVERY: '배달',
}

interface NotiBody {
  order_id: string
  item_nm: string | null
  order_price_pi: number
  buyer_alias: string
  order_mthd_cd: string | null
  reg_dtm: string
}

// 판매자 주문 관리 화면 딥링크 — 인증된 앱 내에서 상세 확인(외부 채널엔 PII 미노출)
function orderDeepLink(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cafe.pi'
  return `${base}/ko/store/my/sales`
}

// HTML 메시지 본문 — 동적 값은 escapeHtml로 안전 처리
function buildMessage(body: NotiBody): string {
  const mthd = body.order_mthd_cd
    ? (ORDER_MTHD_LABEL[body.order_mthd_cd] ?? body.order_mthd_cd)
    : '매장 수령'
  const when = new Date(body.reg_dtm).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return [
    '🛒 <b>새 주문이 들어왔습니다</b>',
    '',
    `📦 상품   ${escapeHtml(body.item_nm ?? '상품')}`,
    `💰 금액   ${body.order_price_pi} π`,
    `👤 구매자  ${escapeHtml(body.buyer_alias)}`,
    `📍 수령   ${escapeHtml(mthd)}`,
    `🕐 주문   ${when}`,
  ].join('\n')
}

export interface DispatchResult {
  sent: number
  failed: number
  skipped: number
}

// 미발송 Telegram 알림 일괄 발송. cron(order-autocomplete) 및 on-demand에서 호출.
export async function dispatchOrderNotis(limit = 100): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 }

  // 토큰 미설정 시 행을 건드리지 않고 보존 — 토큰 설정 후 그대로 재발송 가능
  if (!isTelegramEnabled()) return result

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('msg_noti_outbox')
    .select('noti_id, recv_usr_id, noti_body, retry_cnt')
    .eq('noti_chnl_cd', 'TELEGRAM')
    .eq('sent_yn', 'N')
    .eq('del_yn', 'N')
    .lt('retry_cnt', MAX_RETRY)
    .order('reg_dtm', { ascending: true })
    .limit(limit)

  const rows =
    (data as Array<{
      noti_id: string
      recv_usr_id: string
      noti_body: string
      retry_cnt: number
    }> | null) ?? []
  if (rows.length === 0) return result

  // 수신자 chat_id 일괄 조회 (N+1 방지)
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
    const u = byId.get(row.recv_usr_id)

    // 미연동 판매자 — Telegram 발송 불가. 재시도 큐에서 제외(Pull 뱃지가 안전망).
    if (!u || u.tlgm_conn_yn !== 'Y' || !u.tlgm_chat_id) {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'NO_TELEGRAM_CONN' })
        .eq('noti_id', row.noti_id)
      result.skipped++
      continue
    }

    let body: NotiBody
    try {
      body = JSON.parse(row.noti_body) as NotiBody
    } catch {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'BAD_BODY' })
        .eq('noti_id', row.noti_id)
      result.failed++
      continue
    }

    const res = await sendTelegramMessage(u.tlgm_chat_id, buildMessage(body), [
      { text: '📦 주문 확인하기', url: orderDeepLink() },
    ])

    if (res.ok) {
      // mod_dtm은 트리거가 자동 갱신
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

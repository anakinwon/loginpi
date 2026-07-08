import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { sendTelegramMessage, escapeHtml, isTelegramEnabled } from './telegram'

// 통합 알림 — 거래 상태 변경(TXN_ST)·후기 도착(FBCK) (PRD_13 §18-9 당근마켓식 알림 허브)
//   Pi Browser는 푸시가 없어 상태 변경·후기를 상대가 영영 모를 수 있다 → 텔레그램으로 도달성 확보.
//   ORDER(mps-noti)·CHAT(chat-noti)과 동일 골격: enqueue(적재)/dispatch(발송) 분리 —
//   발송 실패가 주문 전이·후기 저장을 절대 막지 않는다. 멱등은 상태 머신 가드(전이 1회)·
//   fbck UNIQUE(주문당 후기 1건)가 천연 보장. 미연동 사용자는 앱 Pull 뱃지가 안전망.

const MAX_RETRY = 3

// 상태 전이 → 수신자 역할별 알림 문구 (발신 주체의 상대방에게 통지)
const TXN_ST_LABEL: Record<string, string> = {
  'PREPARING:BUYER': '🍳 주문이 접수되어 준비 중입니다',
  'READY:BUYER': '✅ 준비 완료 — 매장에서 수령해 주세요',
  'BUYER_DONE:SELLER':
    '📦 구매자가 수령을 확인했습니다 — 거래완료 처리해 주세요',
  'DONE:BUYER': '🎉 거래가 완료되었습니다',
  'DONE:SELLER': '🎉 구매자 수령 완료 — 거래가 종료되었습니다',
  'CANCELLED:BUYER': '❌ 주문이 취소되었습니다',
  'CANCELLED:SELLER': '❌ 주문이 취소되었습니다',
}

interface TxnStBody {
  order_id: string
  st_cd: string
  item_nm: string | null
  recv_role: 'BUYER' | 'SELLER'
  pi_app_domain?: string | null
  app_url?: string | null
}

interface FbckBody {
  fbck_id: string
  kind: 'CAFE' | 'SHOP'
  target_nm: string | null // 카페명 또는 상품명
  fbck_scr: number
  preview: string
  room_id?: string | null // CAFE 후기의 딥링크 대상
  pi_app_domain?: string | null
  app_url?: string | null
}

// 알림 딥링크 base — 주문 발생 환경 고정(mps-noti orderDeepLink와 동일 전략)
function deepLinkBase(body: {
  pi_app_domain?: string | null
  app_url?: string | null
}): string {
  const piDomain = body.pi_app_domain
    ?.replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  return piDomain
    ? `https://${piDomain}`
    : (body.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://cafe.pi')
}

function bridgeLink(
  body: { pi_app_domain?: string | null; app_url?: string | null },
  to: string,
): string {
  return `${deepLinkBase(body)}/ko/open?to=${encodeURIComponent(to)}`
}

// 환경 스냅샷 — enqueue 시점의 도메인을 본문에 고정(발송 주체 환경과 무관하게 딥링크 정합)
function envSnapshot() {
  return {
    pi_app_domain: process.env.NEXT_PUBLIC_PI_APP_DOMAIN ?? null,
    app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
  }
}

// (A-1) 거래 상태 변경 알림 enqueue — 상태를 바꾼 당사자의 "상대방"에게 통지.
//   관리자 등 제3자 취소면 양측 모두 통지. 실패는 삼킨다(전이 자체가 우선).
export async function enqueueTxnStNoti(
  order: {
    order_id: string
    item_id: string
    buyer_id: string
    seller_id: string
  },
  stCd: string,
  actorId: string,
): Promise<void> {
  try {
    const db = getSupabaseAdmin()

    // 수신자 결정 — 액션 주체의 상대방(제3자 액션이면 양측)
    const targets: Array<{ id: string; role: 'BUYER' | 'SELLER' }> = []
    if (actorId === order.buyer_id) {
      targets.push({ id: order.seller_id, role: 'SELLER' })
    } else if (actorId === order.seller_id) {
      targets.push({ id: order.buyer_id, role: 'BUYER' })
    } else {
      targets.push(
        { id: order.buyer_id, role: 'BUYER' },
        { id: order.seller_id, role: 'SELLER' },
      )
    }
    // self-purchase(구매자=판매자) 중복 제거
    const dedup = [...new Map(targets.map((t) => [t.id, t])).values()]
    if (dedup.length === 0) return

    // 상품명 스냅샷 (없어도 발송엔 지장 없음)
    const { data: item } = await db
      .from('mps_item')
      .select('item_nm')
      .eq('item_id', order.item_id)
      .maybeSingle()
    const itemNm = (item as { item_nm: string | null } | null)?.item_nm ?? null

    const env = envSnapshot()
    const rows = dedup.map((t) => ({
      order_id: order.order_id,
      recv_usr_id: t.id,
      noti_tp_cd: 'TXN_ST',
      noti_chnl_cd: 'TELEGRAM',
      noti_body: JSON.stringify({
        order_id: order.order_id,
        st_cd: stCd,
        item_nm: itemNm,
        recv_role: t.role,
        ...env,
      } satisfies TxnStBody),
      regr_id: 'SYSTEM',
      modr_id: 'SYSTEM',
    }))
    await db.from('msg_noti_outbox').insert(rows)
  } catch (e) {
    console.error('[trade-noti] TXN_ST enqueue 실패:', e)
  }
}

// (A-2) 후기 도착 알림 enqueue — 매장주(카페 OWNER·상점 seller)에게 통지.
export async function enqueueFbckNoti(params: {
  fbckId: string
  recvUsrId: string
  kind: 'CAFE' | 'SHOP'
  roomId?: string | null // CAFE: msg_room.room_id
  prodId?: string | null // SHOP: mps_item.item_id
  fbckScr: number
  fbckCn: string
}): Promise<void> {
  try {
    const db = getSupabaseAdmin()

    // 대상명 스냅샷 — 카페명(msg_room) 또는 상품명(mps_item)
    let targetNm: string | null = null
    if (params.kind === 'CAFE' && params.roomId) {
      const { data } = await db
        .from('msg_room')
        .select('room_nm')
        .eq('room_id', params.roomId)
        .maybeSingle()
      targetNm = (data as { room_nm: string | null } | null)?.room_nm ?? null
    } else if (params.kind === 'SHOP' && params.prodId) {
      const { data } = await db
        .from('mps_item')
        .select('item_nm')
        .eq('item_id', params.prodId)
        .maybeSingle()
      targetNm = (data as { item_nm: string | null } | null)?.item_nm ?? null
    }

    await db.from('msg_noti_outbox').insert({
      recv_usr_id: params.recvUsrId,
      noti_tp_cd: 'FBCK',
      noti_chnl_cd: 'TELEGRAM',
      noti_body: JSON.stringify({
        fbck_id: params.fbckId,
        kind: params.kind,
        target_nm: targetNm,
        fbck_scr: params.fbckScr,
        preview: params.fbckCn.slice(0, 60),
        room_id: params.roomId ?? null,
        ...envSnapshot(),
      } satisfies FbckBody),
      regr_id: 'SYSTEM',
      modr_id: 'SYSTEM',
    })
  } catch (e) {
    console.error('[trade-noti] FBCK enqueue 실패:', e)
  }
}

function buildTxnStMessage(body: TxnStBody): string {
  const label =
    TXN_ST_LABEL[`${body.st_cd}:${body.recv_role}`] ??
    `주문 상태가 변경되었습니다 (${body.st_cd})`
  return [
    `<b>${escapeHtml(label)}</b>`,
    '',
    `📦 ${escapeHtml(body.item_nm ?? '상품')}`,
  ].join('\n')
}

function buildFbckMessage(body: FbckBody): string {
  const stars = '⭐'.repeat(Math.max(1, Math.min(5, body.fbck_scr)))
  const target = body.target_nm ? ` — ${escapeHtml(body.target_nm)}` : ''
  return [
    `💌 <b>새 후기가 도착했습니다</b>${target}`,
    '',
    `${stars} (${body.fbck_scr}점)`,
    escapeHtml(body.preview),
  ].join('\n')
}

export interface TradeDispatchResult {
  sent: number
  failed: number
  skipped: number
}

// (B) dispatch — TXN_ST·FBCK 미발송분을 Telegram 발송. cron(chat-noti, 1분)에서 호출.
//   채팅과 달리 즉시성 알림이라 지연·읽음 게이트 없음(ORDER와 동일). 수신자 개인 텔레그램만
//   대상(매장 텔레그램은 주문 접수 채널 — 상태·후기는 당사자 개인 통지가 목적).
export async function dispatchTradeNotis(
  limit = 100,
): Promise<TradeDispatchResult> {
  const result: TradeDispatchResult = { sent: 0, failed: 0, skipped: 0 }
  if (!isTelegramEnabled()) return result

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('msg_noti_outbox')
    .select('noti_id, recv_usr_id, noti_tp_cd, noti_body, retry_cnt')
    .in('noti_tp_cd', ['TXN_ST', 'FBCK'])
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
      noti_tp_cd: 'TXN_ST' | 'FBCK'
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
    let text: string
    let button: { text: string; url: string }
    try {
      if (row.noti_tp_cd === 'TXN_ST') {
        const body = JSON.parse(row.noti_body) as TxnStBody
        text = buildTxnStMessage(body)
        button = {
          text: '📦 주문 확인하기',
          url: bridgeLink(
            body,
            body.recv_role === 'SELLER'
              ? '/ko/store/my/sales'
              : '/ko/store/my/orders',
          ),
        }
      } else {
        const body = JSON.parse(row.noti_body) as FbckBody
        text = buildFbckMessage(body)
        button = {
          text: '💌 후기 확인하기',
          url: bridgeLink(
            body,
            body.kind === 'CAFE' && body.room_id
              ? `/ko/chat/${body.room_id}`
              : '/ko/store/my/sales',
          ),
        }
      }
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

    // 텔레그램 미연동 — 앱 내 화면(주문관리·후기 목록)이 안전망. 재시도 큐에서 이탈.
    if (!chatId) {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'NO_TELEGRAM_CONN' })
        .eq('noti_id', row.noti_id)
      result.skipped++
      continue
    }

    const res = await sendTelegramMessage(chatId, text, [button])

    if (res.ok) {
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

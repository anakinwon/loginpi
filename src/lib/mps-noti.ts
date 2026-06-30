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

interface NotiLine {
  nm: string
  qty: number
  unit: number // 단가 (소계 = unit × qty)
}

interface NotiBody {
  order_id: string
  item_nm: string | null
  order_price_pi: number
  buyer_alias: string
  order_mthd_cd: string | null
  reg_dtm: string
  lines?: NotiLine[]
  // 주문 발생 환경 Pi 도메인(pinet.com, enqueue 시점 고정) — 텔레그램 딥링크 base 1순위
  pi_app_domain?: string | null
  // 주문 발생 환경 base URL(Vercel 도메인) — pi_app_domain 없을 때 폴백. 없으면 발송 서버 env 폴백
  app_url?: string | null
}

// 소수 7자리 반올림 (Pi 정밀도 정합)
const round7 = (n: number) => Math.round(n * 1e7) / 1e7

// 판매자 주문 관리 화면 링크 — 텔레그램 버튼(https)이 /ko/open 브리지로 보낸다.
//   직접 https://pinet.com은 OS가 일반 브라우저(Chrome)로 열어 Pi Browser로 안 넘어감(App Link 미작동).
//   브리지(Chrome)에서 pi:// 스킴으로 리다이렉트하면 Pi Browser가 열린다(실기기 확인).
//   pi:// 정확한 형식은 브리지에서 처리(공식 문서 미기재 → 폴백 다중 시도).
function orderDeepLink(body: NotiBody): string {
  // base 우선순위(발송 주체 무관 — 주문 발생 환경 고정값):
  //   ① Pi 도메인(pinet.com universal link) — Pi Browser 진입 정석(운영=cafe7092.pinet.com)
  //   ② Vercel 도메인(app_url) 폴백 → ③ 발송 서버 env → ④ 최종 폴백
  const piDomain = body.pi_app_domain
    ?.replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
  const base = piDomain
    ? `https://${piDomain}`
    : (body.app_url ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://cafe.pi')
  return `${base}/ko/open?to=${encodeURIComponent('/ko/store/my/sales')}`
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
  // 메뉴별 명칭·수량·금액 라인. 라인 없으면(직거래 단건) item_nm 폴백.
  let itemsBlock: string[]
  if (body.lines && body.lines.length > 0) {
    itemsBlock = ['📦 <b>주문 내역</b>']
    for (const l of body.lines) {
      const subtotal = round7(l.unit * l.qty)
      itemsBlock.push(
        ` • ${escapeHtml(l.nm)}  ${l.qty}개 × ${l.unit} π = ${subtotal} π`,
      )
    }
  } else {
    itemsBlock = [`📦 상품   ${escapeHtml(body.item_nm ?? '상품')}`]
  }

  return [
    '🛒 <b>새 주문이 들어왔습니다</b>',
    '',
    ...itemsBlock,
    `💰 합계   ${body.order_price_pi} π`,
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

  // 본문 미리 파싱 (order_id 수집 — 매장 telegram 조회용). 파싱 실패 행은 즉시 큐 이탈.
  const parsed: Array<{
    row: (typeof rows)[number]
    body: NotiBody | null
  }> = rows.map((row) => {
    try {
      return { row, body: JSON.parse(row.noti_body) as NotiBody }
    } catch {
      return { row, body: null }
    }
  })

  // ── 매장별 1:1 Telegram 우선 발송 (PRD: 매장 등록/수정 연동) ───────────────
  // 주문 → 매장(shop) telegram 우선, 매장 미연동 시 판매자(sys_user) telegram 폴백.
  // FK 무설계 → order_id→item_id→shop_id→mps_shop을 단계별 .in() 조회 후 Map 병합.
  const orderIds = [
    ...new Set(parsed.map((p) => p.body?.order_id).filter(Boolean) as string[]),
  ]
  const orderShop = new Map<string, string>() // order_id → shop_id
  const shopTlgm = new Map<string, number>() // shop_id → chat_id (연동된 매장만)
  if (orderIds.length > 0) {
    const { data: ords } = await db
      .from('mps_order')
      .select('order_id, item_id')
      .in('order_id', orderIds)
    const orderItem = new Map(
      (ords ?? []).map((o) => [
        (o as { order_id: string }).order_id,
        (o as { item_id: string }).item_id,
      ]),
    )
    const itemIds = [...new Set([...orderItem.values()])]
    if (itemIds.length > 0) {
      const { data: items } = await db
        .from('mps_item')
        .select('item_id, shop_id')
        .in('item_id', itemIds)
      const itemShop = new Map(
        (items ?? [])
          .map((i) => [
            (i as { item_id: string }).item_id,
            (i as { shop_id: string | null }).shop_id,
          ])
          .filter((e) => e[1]) as [string, string][],
      )
      for (const [oid, iid] of orderItem) {
        const sid = itemShop.get(iid)
        if (sid) orderShop.set(oid, sid)
      }
      const shopIds = [...new Set([...orderShop.values()])]
      if (shopIds.length > 0) {
        const { data: shops } = await db
          .from('mps_shop')
          .select('shop_id, tlgm_chat_id, tlgm_conn_yn')
          .in('shop_id', shopIds)
          .eq('tlgm_conn_yn', 'Y')
        for (const s of shops ?? []) {
          const sr = s as { shop_id: string; tlgm_chat_id: number | null }
          if (sr.tlgm_chat_id) shopTlgm.set(sr.shop_id, sr.tlgm_chat_id)
        }
      }
    }
  }

  // 판매자(폴백) chat_id 일괄 조회 (N+1 방지)
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

  for (const { row, body } of parsed) {
    if (!body) {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'BAD_BODY' })
        .eq('noti_id', row.noti_id)
      result.failed++
      continue
    }

    // 발송 대상: 매장(shop) telegram 우선 → 없으면 판매자(seller) telegram 폴백
    const shopId = orderShop.get(body.order_id)
    const shopChatId = shopId ? shopTlgm.get(shopId) : undefined
    const u = byId.get(row.recv_usr_id)
    const fallbackChatId =
      u && u.tlgm_conn_yn === 'Y' && u.tlgm_chat_id ? u.tlgm_chat_id : undefined
    const chatId = shopChatId ?? fallbackChatId

    // 매장·판매자 모두 미연동 — Telegram 발송 불가. 재시도 큐에서 제외(Pull 뱃지가 안전망).
    if (!chatId) {
      await db
        .from('msg_noti_outbox')
        .update({ retry_cnt: MAX_RETRY, fail_reas: 'NO_TELEGRAM_CONN' })
        .eq('noti_id', row.noti_id)
      result.skipped++
      continue
    }

    const res = await sendTelegramMessage(chatId, buildMessage(body), [
      { text: '📦 주문 확인하기', url: orderDeepLink(body) },
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

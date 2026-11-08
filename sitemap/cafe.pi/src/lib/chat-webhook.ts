import 'server-only'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { getSupabaseAdmin } from './supabase-admin'

// TASK-072: 카페 Webhook push — 신규 메시지를 등록된 외부 URL로 POST 전송
// messages POST의 after()에서 호출 — 응답을 막지 않는 백그라운드 실행

// SSRF 방어 — loopback·사설·link-local·메타데이터(169.254) 대역 차단
function isBlockedIp(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) → IPv4로 정규화 후 검사
  const v4 = ip.replace(/^::ffff:/i, '')
  if (net.isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number)
    return (
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a >= 224 // 멀티캐스트·예약 대역
    )
  }
  if (net.isIP(ip) === 6) {
    const low = ip.toLowerCase()
    return (
      low === '::1' ||
      low === '::' ||
      low.startsWith('fc') ||
      low.startsWith('fd') ||
      low.startsWith('fe8')
    )
  }
  return false
}

// Webhook URL 안전성 검증 — 통과 시 null, 거부 시 사유 문자열 반환.
// 등록 시점(webhooks POST)과 발송 시점(pushRoomWebhooks) 양쪽에서 호출해
// 등록 후 DNS를 내부 IP로 바꾸는 rebinding 우회를 차단한다.
export async function validateWebhookUrl(raw: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return '유효하지 않은 Webhook URL'
  }
  if (parsed.protocol !== 'https:') return 'Webhook URL은 https만 허용됩니다'

  const host = parsed.hostname
  // 호스트가 IP 리터럴이면 직접 검사
  if (net.isIP(host) !== 0) {
    return isBlockedIp(host)
      ? '내부 주소로의 Webhook은 허용되지 않습니다'
      : null
  }
  try {
    const addrs = await lookup(host, { all: true })
    if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) {
      return '내부 주소로의 Webhook은 허용되지 않습니다'
    }
  } catch {
    return 'Webhook 호스트를 확인할 수 없습니다'
  }
  return null
}

interface WebhookMessage {
  msg_id: string
  room_id: string
  snd_usr_id: string
  snd_usr_nm: string
  msg_cont: string | null
  msg_tp_cd: string
  reg_dtm: string
}

export async function pushRoomWebhooks(
  roomId: string,
  message: WebhookMessage,
): Promise<void> {
  const { data: hooks } = await getSupabaseAdmin()
    .from('msg_webhook')
    .select('webhook_id, webhook_url')
    .eq('room_id', roomId)
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .not('webhook_url', 'is', null)

  if (!hooks || hooks.length === 0) return

  // 개별 실패는 다른 webhook에 영향 없음 — 5초 타임아웃
  await Promise.allSettled(
    (hooks as { webhook_id: string; webhook_url: string }[]).map(async (h) => {
      try {
        // 발송 시점 재검증 — 등록 후 DNS를 내부 IP로 바꾸는 rebinding 차단
        const blocked = await validateWebhookUrl(h.webhook_url)
        if (blocked) {
          console.error(
            `[chat-webhook] push 차단 (${h.webhook_id}): ${blocked}`,
          )
          return
        }
        await fetch(h.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'new_msg',
            room_id: message.room_id,
            msg: {
              msg_id: message.msg_id,
              snd_usr_nm: message.snd_usr_nm,
              msg_cont: message.msg_cont,
              msg_tp_cd: message.msg_tp_cd,
              reg_dtm: message.reg_dtm,
            },
          }),
          // 302 → 내부 주소 redirect로 검증을 우회하는 것 차단
          redirect: 'manual',
          signal: AbortSignal.timeout(5000),
        })
      } catch (err) {
        console.error(`[chat-webhook] push 실패 (${h.webhook_id})`, err)
      }
    }),
  )
}

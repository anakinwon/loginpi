import 'server-only'

// Telegram Bot API 발송 래퍼 — 판매자 주문 알림(Outbox 디스패처)에서 사용.
// TELEGRAM_BOT_TOKEN 미설정 시 비활성(호출부가 미발송으로 처리하고 Outbox 행을 보존).
// Pi Browser WebView 제약(쿠키 미저장·Web Push 불확실)을 외부 메신저로 우회하는 1순위 채널.

const API_BASE = 'https://api.telegram.org'

export function isTelegramEnabled(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN
}

// HTML parse_mode 본문에 들어갈 동적 값 이스케이프 (&, <, > 만 — Telegram HTML 규칙)
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface TelegramButton {
  text: string
  url: string
}

export interface SendResult {
  ok: boolean
  messageId?: number
  error?: string
}

// 단일 메시지 발송. 인라인 버튼(딥링크)은 한 줄에 나열.
export async function sendTelegramMessage(
  chatId: number | string,
  html: string,
  buttons?: TelegramButton[],
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_DISABLED' }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }
  if (buttons && buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: [buttons.map((b) => ({ text: b.text, url: b.url }))],
    }
  }

  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as {
      ok: boolean
      result?: { message_id: number }
      description?: string
    }
    if (!json.ok) {
      return { ok: false, error: json.description ?? `HTTP ${res.status}` }
    }
    return { ok: true, messageId: json.result?.message_id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

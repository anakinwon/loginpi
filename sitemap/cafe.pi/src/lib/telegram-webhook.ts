import 'server-only'

// 텔레그램 webhook 자가치유 등록 (2026-07-03 운영 콜백 유실 사고 근본수정)
//   봇 토큰당 webhook URL은 전 세계에 단 1개 — 환경(스테이징/운영)별로 별도 봇을 쓰고
//   각자 자기 도메인을 등록해야 한다(스테이징=cafe_pi_not_bot→loginpi / 운영=cafe_pi_areal_bot→cafepi).
//   운영 봇의 수동 setWebhook 누락으로 발신 알림은 정상인데 수신 콜백(인용답장 릴레이·/start 연동)만
//   유실되는 비대칭 장애 발생 → cron이 주기적으로 URL을 대조하고 어긋나면 스스로 재등록한다.
//   ⚠️ 두 환경이 봇 토큰을 공유하면 서로 webhook을 뺏는 플립플롭이 발생 — 반드시 환경별 봇 분리 유지.

const API_BASE = 'https://api.telegram.org'
// 인스턴스별 재확인 간격(ms) — cron 1분 주기마다 Telegram API를 호출하지 않게 스로틀
const CHECK_INTERVAL_MS = 10 * 60 * 1000

let lastOkAt = 0
let lastResult: EnsureWebhookResult | null = null

export interface EnsureWebhookResult {
  ok: boolean
  action: 'skipped' | 'kept' | 'registered' | 'failed'
  detail?: string
}

// 기대 webhook URL — 도메인별 정합이 검증된 NEXT_PUBLIC_APP_URL 기준(운영=cafepi·스테이징=loginpi)
export function expectedWebhookUrl(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return null
  return `${appUrl.replace(/\/+$/, '')}/api/telegram/webhook`
}

// webhook 등록 상태를 보장한다. 성공 결과만 스로틀 캐시(실패는 다음 호출에서 즉시 재시도).
export async function ensureTelegramWebhook(
  force = false,
): Promise<EnsureWebhookResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const expected = expectedWebhookUrl()
  if (!token || !secret || !expected) {
    return { ok: true, action: 'skipped', detail: 'env_missing' }
  }

  const now = Date.now()
  if (!force && lastResult?.ok && now - lastOkAt < CHECK_INTERVAL_MS) {
    return lastResult
  }

  try {
    const infoRes = await fetch(`${API_BASE}/bot${token}/getWebhookInfo`)
    const info = (await infoRes.json()) as {
      ok: boolean
      result?: { url?: string }
    }
    const current = info.result?.url ?? ''

    if (!force && info.ok && current === expected) {
      lastResult = { ok: true, action: 'kept' }
      lastOkAt = now
      return lastResult
    }

    // 미등록·오등록(또는 강제) → 재등록. PRD_13 §11-4와 동일하게 url+secret_token만 사용.
    const setRes = await fetch(`${API_BASE}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: expected, secret_token: secret }),
    })
    const set = (await setRes.json()) as { ok: boolean; description?: string }
    if (set.ok) {
      lastResult = {
        ok: true,
        action: 'registered',
        detail: `${current || '(미등록)'} → ${expected}`,
      }
      lastOkAt = now
    } else {
      lastResult = {
        ok: false,
        action: 'failed',
        detail: set.description ?? `HTTP ${setRes.status}`,
      }
    }
    return lastResult
  } catch (e) {
    lastResult = {
      ok: false,
      action: 'failed',
      detail: e instanceof Error ? e.message : String(e),
    }
    return lastResult
  }
}

// 진단용 현재 등록 상태 조회 (관리자 엔드포인트에서 사용)
export async function getWebhookStatus(): Promise<{
  configured: boolean
  botUsername?: string
  currentUrl?: string
  expectedUrl?: string
  matched?: boolean
  pendingUpdates?: number
  lastError?: string
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const expected = expectedWebhookUrl()
  if (!token) return { configured: false }

  const [meRes, infoRes] = await Promise.all([
    fetch(`${API_BASE}/bot${token}/getMe`),
    fetch(`${API_BASE}/bot${token}/getWebhookInfo`),
  ])
  const me = (await meRes.json()) as {
    ok: boolean
    result?: { username?: string }
  }
  const info = (await infoRes.json()) as {
    ok: boolean
    result?: {
      url?: string
      pending_update_count?: number
      last_error_message?: string
    }
  }
  const currentUrl = info.result?.url ?? ''
  return {
    configured: true,
    botUsername: me.result?.username,
    currentUrl,
    expectedUrl: expected ?? undefined,
    matched: !!expected && currentUrl === expected,
    pendingUpdates: info.result?.pending_update_count,
    lastError: info.result?.last_error_message,
  }
}

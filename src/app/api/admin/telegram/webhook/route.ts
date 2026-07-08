import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import {
  ensureTelegramWebhook,
  getWebhookStatus,
} from '@/lib/telegram-webhook'
import { sanitizeError } from '@/lib/sanitize-error'

// 관리자용 텔레그램 webhook 진단·재등록 (환경별 봇 분리 전제 — telegram-webhook.ts 참조)
//   GET : 현재 등록 URL vs 기대 URL 대조 + 봇 식별 + 최근 수신 오류
//   POST: 강제 재등록 (시크릿 로테이트·수동 복구용. 평시엔 cron 자가치유가 처리)

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const status = await getWebhookStatus()
    return NextResponse.json(status)
  } catch (e) {
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/admin/telegram/webhook/get',
          e,
          '텔레그램 webhook 상태 조회 실패',
        ),
      },
      { status: 502 },
    )
  }
}

export async function POST() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const result = await ensureTelegramWebhook(true)
  const status = await getWebhookStatus().catch(() => null)
  return NextResponse.json({ result, status })
}

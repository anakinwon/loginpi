import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendTelegramMessage } from '@/lib/telegram'

// Bean 보존 항등식 상시 모니터링 cron (매일 01:00 UTC).
// fn_bean_balance_check()로 발행=유통+회수 항등식을 점검 → diff≠0이면 CRITICAL 로그 + (설정 시)텔레그램 경보.
// 돈 무관용원칙의 마지막 안전망: "관리자가 볼 때"가 아니라 "매일 자동" 감시.

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface BalanceResult {
  issued: number
  circulating: number
  collected: number
  diff: number
  balanced: boolean
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const start = new Date()
  const today = start.toISOString().slice(0, 10)
  const db = getSupabaseAdmin()

  const { data, error } = await db.rpc('fn_bean_balance_check')

  // 배치 로그 기록 (관리자 카드가 최신 결과를 읽음)
  async function log(successYn: 'Y' | 'N', msg: string) {
    await db
      .from('sys_batch_log')
      .insert({
        job_nm: 'bean_balance_check',
        trigger_cd: 'CRON',
        from_dt: today,
        to_dt: today,
        start_dtm: start.toISOString(),
        end_dtm: new Date().toISOString(),
        success_yn: successYn,
        total_cnt: 1,
        failed_cnt: successYn === 'Y' ? 0 : 1,
        result_msg: msg.slice(0, 500),
        regr_id: 'SYSTEM',
        modr_id: 'SYSTEM',
      })
      .then(({ error: e }) => {
        if (e) console.error('[bean-balance-check] logBatchRun 실패:', e)
      })
  }

  if (error || !data) {
    console.error('[bean-balance-check] RPC 실패:', error)
    await log('N', `RPC 오류: ${error?.message ?? 'no data'}`)
    return NextResponse.json({ error: 'check_failed' }, { status: 500 })
  }

  const r = data as BalanceResult
  const balanced = !!r.balanced
  await log(balanced ? 'Y' : 'N', JSON.stringify(r))

  if (!balanced) {
    // 돈 누수 의심 — CRITICAL 로그 (Vercel 로그 캡처) + 텔레그램 경보(설정 시)
    console.error(
      `[CRITICAL][bean-balance-check] Bean 항등식 불일치 diff=${r.diff} (발행 ${r.issued} = 유통 ${r.circulating} + 회수 ${r.collected})`,
    )
    const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `🚨 <b>Bean 항등식 불일치 감지</b>\n` +
          `diff = <b>${r.diff.toLocaleString()}</b>\n` +
          `발행 ${r.issued.toLocaleString()} = 유통 ${r.circulating.toLocaleString()} + 회수 ${r.collected.toLocaleString()} 위반\n` +
          `즉시 점검 필요 (/admin/token)`,
      ).catch((e) => console.error('[bean-balance-check] 텔레그램 경보 실패:', e))
    }
  }

  return NextResponse.json({ ok: true, ...r })
}

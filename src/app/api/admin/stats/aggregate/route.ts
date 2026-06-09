import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

// 날짜 형식 검증 (YYYY-MM-DD)
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

// 어제 날짜 (UTC 기준)
function yesterday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  // 인증: CRON_SECRET 또는 어드민 세션
  const cronAuth = isCronAuthorized(req)
  if (!cronAuth) {
    const user = await getSessionUser()
    if (!isAdmin(user)) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    }
  }

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    // 빈 body 허용
  }

  const db = getSupabaseAdmin()

  // 백필 모드: from ~ to 범위 전체 처리
  if (body.backfill === true) {
    const to = typeof body.to === 'string' && isValidDate(body.to) ? body.to : yesterday()

    // from 미지정 시 sys_user_actvty_log의 최초 날짜 사용
    let from = typeof body.from === 'string' && isValidDate(body.from) ? body.from : null
    if (!from) {
      const { data } = await db
        .from('sys_user_actvty_log')
        .select('actvty_dt')
        .eq('del_yn', 'N')
        .order('actvty_dt', { ascending: true })
        .limit(1)
        .maybeSingle()
      from = data?.actvty_dt ?? to
    }

    const results: { date: string; ok: boolean }[] = []
    const cur = new Date(from + 'T00:00:00Z')
    const end = new Date(to + 'T00:00:00Z')

    while (cur <= end) {
      const dt = cur.toISOString().slice(0, 10)
      const { error } = await db.rpc('fn_build_daily_stats', { p_dt: dt })
      results.push({ date: dt, ok: !error })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }

    const failed = results.filter(r => !r.ok)
    return NextResponse.json({
      backfill: true,
      total: results.length,
      failed: failed.length,
      failedDates: failed.map(r => r.date),
    })
  }

  // 단일 날짜 처리 (기본: 어제)
  const date = typeof body.date === 'string' && isValidDate(body.date) ? body.date : yesterday()
  const { error } = await db.rpc('fn_build_daily_stats', { p_dt: date })

  if (error) {
    return NextResponse.json({ error: error.message, date }, { status: 500 })
  }

  return NextResponse.json({ success: true, date })
}

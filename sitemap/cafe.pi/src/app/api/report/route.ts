import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { withGuard } from '@/lib/api-guard'
import { apiError } from '@/lib/api-errors'

// 커뮤니티 신고 접수 — 로그인 사용자. 게시물/댓글/상점/사용자/채팅 신고.
const TARGETS = ['POST', 'COMMENT', 'SHOP', 'USER', 'CHAT']
const REASONS = [
  'SPAM',
  'ABUSE',
  'SEXUAL',
  'PRIVACY',
  'COPYRIGHT',
  'FRAUD',
  'ETC',
]

async function handlePOST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return apiError('AUTH_REQUIRED', 401)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }
  const { target_tp, target_id, reason_cd, reason_txt } = body as {
    target_tp?: string
    target_id?: string
    reason_cd?: string
    reason_txt?: string
  }

  if (!target_tp || !TARGETS.includes(target_tp) || !target_id) {
    return apiError('REPORT_TARGET_INVALID', 400)
  }
  if (!reason_cd || !REASONS.includes(reason_cd)) {
    return apiError('REPORT_REASON_REQUIRED', 400)
  }

  const db = getSupabaseAdmin()

  // 동일 사용자·동일 대상의 미처리 신고 중복 방지
  const { data: dup } = await db
    .from('rpt_report')
    .select('rpt_id')
    .eq('reporter_id', user.id)
    .eq('target_tp_cd', target_tp)
    .eq('target_id', target_id)
    .eq('status_cd', 'PENDING')
    .eq('del_yn', 'N')
    .maybeSingle()
  if (dup) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const { error } = await db.from('rpt_report').insert({
    reporter_id: user.id,
    target_tp_cd: target_tp,
    target_id: String(target_id),
    reason_cd,
    reason_txt: reason_txt ? String(reason_txt).slice(0, 1000) : null,
    regr_id: user.id,
    modr_id: user.id,
  })
  if (error) {
    return apiError('REPORT_SUBMIT_FAILED', 500)
  }
  return NextResponse.json({ ok: true })
}

export const POST = withGuard(handlePOST)

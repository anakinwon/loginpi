import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { withGuard } from '@/lib/api-guard'

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
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { target_tp, target_id, reason_cd, reason_txt } = body as {
    target_tp?: string
    target_id?: string
    reason_cd?: string
    reason_txt?: string
  }

  if (!target_tp || !TARGETS.includes(target_tp) || !target_id) {
    return NextResponse.json(
      { error: '신고 대상이 올바르지 않습니다' },
      { status: 400 },
    )
  }
  if (!reason_cd || !REASONS.includes(reason_cd)) {
    return NextResponse.json(
      { error: '신고 사유를 선택해 주세요' },
      { status: 400 },
    )
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
    return NextResponse.json({ error: '신고 접수 실패' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export const POST = withGuard(handlePOST)

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 요금제 모드(Bean ↔ Pi) 전환 — MASTER 전용. PRD_24 §6·§10.
//   GET: 현재 활성 모드 + 전환 이력
//   POST: { action:'switch', new_mode:'BEAN'|'PI', reason } | { action:'rollback', reason }
async function requireMaster() {
  const user = await getSessionUser()
  return user?.role === 'MASTER' ? user : null
}

export async function GET() {
  const user = await requireMaster()
  if (!user)
    return NextResponse.json(
      { error: '권한이 없습니다(MASTER 전용)' },
      { status: 403 },
    )

  const db = getSupabaseAdmin()
  const { data: mode } = await db.rpc('fn_get_active_fee_mode')
  const { data: history } = await db
    .from('v_fee_mode_recent_history')
    .select('audit_id, old_mode, new_mode, changed_by, changed_at, reason_memo')
    .limit(20)

  return NextResponse.json({
    active_mode: mode === 'PI' ? 'PI' : 'BEAN',
    history: history ?? [],
  })
}

export async function POST(req: NextRequest) {
  const user = await requireMaster()
  if (!user)
    return NextResponse.json(
      { error: '권한이 없습니다(MASTER 전용)' },
      { status: 403 },
    )

  let body: { action?: string; new_mode?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const changedBy = user.pi_username ?? user.id

  // 롤백 — 직전 모드로 원자 복원
  if (body.action === 'rollback') {
    const { data, error } = await db.rpc('fn_rollback_fee_mode', {
      p_changed_by: changedBy,
      p_reason_memo: body.reason || '직전 요금제 복귀',
    })
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({ ok: row?.ok ?? false, result: row })
  }

  // 전환 — new_mode로
  if (body.new_mode !== 'BEAN' && body.new_mode !== 'PI')
    return NextResponse.json(
      { error: "new_mode는 'BEAN' 또는 'PI'" },
      { status: 400 },
    )

  const { data, error } = await db.rpc('fn_switch_fee_mode', {
    p_new_mode: body.new_mode,
    p_changed_by: changedBy,
    p_reason_memo: body.reason || '',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ ok: row?.ok ?? false, result: row })
}

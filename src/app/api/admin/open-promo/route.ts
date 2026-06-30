import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 오픈기념행사 무료요금 정책 관리 (OneKey 토글) — PRD_26 요금전문 매니저 마스터 전용.
//   GET: 현재 프로모션 상태 + 최근 변경 이력
//   POST: { action: 'activate'|'deactivate'|'set-times', start_dtm?, end_dtm?, reason? }

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

  // 현재 프로모션 상태
  const { data: current } = await db
    .from('v_promo_fee_current')
    .select(
      'promo_fee_id, promo_active_yn, promo_start_dtm, promo_end_dtm, reason_memo, status_label, is_active_now',
    )
    .single()

  // 최근 변경 이력 (20건)
  const { data: history } = await db
    .from('v_promo_fee_recent_history')
    .select(
      'audit_id, old_active_yn, new_active_yn, old_start_dtm, new_start_dtm, old_end_dtm, new_end_dtm, changed_by, changed_at, reason_memo',
    )
    .limit(20)

  return NextResponse.json({
    current: current ?? null,
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

  let body: {
    action?: string
    start_dtm?: string // ISO 8601, TIMESTAMPTZ 변환
    end_dtm?: string // ISO 8601, TIMESTAMPTZ 변환
    reason?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const changedBy = user.pi_username ?? user.id

  // 활성화 (프로모 ON)
  if (body.action === 'activate') {
    const startDtm = body.start_dtm
      ? new Date(body.start_dtm).toISOString()
      : null
    const endDtm = body.end_dtm ? new Date(body.end_dtm).toISOString() : null

    const { data, error } = await db.rpc('fn_toggle_open_promo', {
      p_active_yn: 'Y',
      p_start_dtm: startDtm,
      p_end_dtm: endDtm,
      p_changed_by: changedBy,
      p_reason_memo: body.reason || '오픈기념행사 무료화 활성화',
    })

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 })

    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({
      ok: row?.ok ?? false,
      message: row?.message,
      promo_active_yn: row?.new_active_yn,
      start_dtm: row?.new_start_dtm,
      end_dtm: row?.new_end_dtm,
    })
  }

  // 비활성화 (프로모 OFF → 정상요금 복귀)
  if (body.action === 'deactivate') {
    const { data, error } = await db.rpc('fn_toggle_open_promo', {
      p_active_yn: 'N',
      p_start_dtm: null,
      p_end_dtm: null,
      p_changed_by: changedBy,
      p_reason_memo: body.reason || '오픈기념행사 종료 — 정상요금 복귀',
    })

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 })

    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({
      ok: row?.ok ?? false,
      message: row?.message,
      promo_active_yn: row?.new_active_yn,
    })
  }

  // 시간 설정 (프로모 ON 상태에서 시작/종료 시각 변경)
  if (body.action === 'set-times') {
    if (!body.start_dtm && !body.end_dtm) {
      return NextResponse.json(
        { error: 'start_dtm 또는 end_dtm 중 최소 하나 필요' },
        { status: 400 },
      )
    }

    const startDtm = body.start_dtm
      ? new Date(body.start_dtm).toISOString()
      : undefined
    const endDtm = body.end_dtm
      ? new Date(body.end_dtm).toISOString()
      : undefined

    // 현재 활성 상태 조회 (싱글톤 단건 — 시스템 컬럼 정렬 없음)
    const { data: current } = await db
      .from('promo_fee_config')
      .select('promo_active_yn, promo_start_dtm, promo_end_dtm')
      .eq('del_yn', 'N')
      .limit(1)
      .single()

    const isCurrentlyActive = current?.promo_active_yn === 'Y'

    const { data, error } = await db.rpc('fn_toggle_open_promo', {
      p_active_yn: isCurrentlyActive ? 'Y' : 'N',
      p_start_dtm: startDtm ?? (current?.promo_start_dtm || null),
      p_end_dtm: endDtm ?? (current?.promo_end_dtm || null),
      p_changed_by: changedBy,
      p_reason_memo: body.reason || '프로모션 시간 설정 변경',
    })

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 })

    const row = Array.isArray(data) ? data[0] : data
    return NextResponse.json({
      ok: row?.ok ?? false,
      message: row?.message,
      promo_active_yn: row?.new_active_yn,
      start_dtm: row?.new_start_dtm,
      end_dtm: row?.new_end_dtm,
    })
  }

  return NextResponse.json(
    {
      error: "action은 'activate', 'deactivate', 'set-times' 중 하나",
    },
    { status: 400 },
  )
}

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// MASTER 전용: 승인(approve) / 반려(reject)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ apvId: string }> },
) {
  const requester = await getSessionUser()
  if (requester?.role !== 'MASTER') {
    return NextResponse.json(
      { error: 'MASTER 권한이 필요합니다' },
      { status: 403 },
    )
  }

  const { apvId } = await params
  const body = (await req.json()) as {
    action: 'approve' | 'reject'
    reject_reason?: string
  }

  if (!['approve', 'reject'].includes(body.action)) {
    return NextResponse.json(
      { error: 'action은 approve 또는 reject여야 합니다' },
      { status: 400 },
    )
  }
  if (body.action === 'reject' && !body.reject_reason?.trim()) {
    return NextResponse.json(
      { error: '반려 사유를 입력해 주세요' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()

  // 현재 승인 요청 조회
  const { data: apv, error: fetchErr } = await db
    .from('approval_queue')
    .select('apv_id, apv_status, entity_type, entity_id')
    .eq('apv_id', apvId)
    .single()

  if (fetchErr || !apv)
    return NextResponse.json(
      { error: '요청을 찾을 수 없습니다' },
      { status: 404 },
    )
  if (apv.apv_status !== 'PENDING') {
    return NextResponse.json(
      { error: '이미 처리된 요청입니다' },
      { status: 409 },
    )
  }

  const newStatus = body.action === 'approve' ? 'APPROVED' : 'REJECTED'
  const now = new Date().toISOString()

  // approval_queue 상태 업데이트
  const { error: updErr } = await db
    .from('approval_queue')
    .update({
      apv_status: newStatus,
      decided_by: requester.id,
      decided_at: now,
      reject_reason:
        body.action === 'reject' ? body.reject_reason!.trim() : null,
      modr_id: requester.id,
      mod_dtm: now,
    })
    .eq('apv_id', apvId)

  if (updErr)
    return NextResponse.json({ error: '상태 업데이트 실패' }, { status: 500 })

  // 대상 엔터티의 apv_status 동기화 (std_dic, std_dom, std_term)
  if (apv.entity_id) {
    const tblMap: Record<string, { tbl: string; pk: string }> = {
      STD_DIC: { tbl: 'std_dic', pk: 'dic_id' },
      STD_DOM: { tbl: 'std_dom', pk: 'dom_id' },
      STD_TERM: { tbl: 'std_term', pk: 'term_id' },
    }
    const target = tblMap[apv.entity_type]
    if (target) {
      await db
        .from(target.tbl)
        .update({ apv_status: newStatus, modr_id: requester.id, mod_dtm: now })
        .eq(target.pk, apv.entity_id)
    }
  }

  return NextResponse.json({ apvId, status: newStatus })
}

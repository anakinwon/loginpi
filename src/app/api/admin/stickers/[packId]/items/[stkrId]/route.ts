import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 어드민 개별 스티커 — 이름·정렬 수정, 논리삭제

type Params = { params: Promise<{ packId: string; stkrId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const { packId, stkrId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { stkr_nm, sort_ord } = body as { stkr_nm?: string; sort_ord?: number }

  const update: Record<string, unknown> = {
    modr_id: 'ADMIN',
    mod_dtm: new Date().toISOString(),
  }
  if (stkr_nm !== undefined) {
    const name = stkr_nm.trim()
    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: '스티커 이름은 1~100자여야 합니다' },
        { status: 400 },
      )
    }
    update.stkr_nm = name
  }
  if (sort_ord !== undefined) {
    if (!Number.isInteger(sort_ord) || sort_ord < 0) {
      return NextResponse.json(
        { error: '정렬 순서가 올바르지 않습니다' },
        { status: 400 },
      )
    }
    update.sort_ord = sort_ord
  }

  const { error } = await getSupabaseAdmin()
    .from('msg_stkr')
    .update(update)
    .eq('stkr_id', stkrId)
    .eq('pack_id', packId)
    .eq('del_yn', 'N')

  if (error)
    return NextResponse.json({ error: '스티커 수정 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const { packId, stkrId } = await params

  // 논리삭제 — 이미 전송된 STICKER 메시지는 attch_url로 원본을 참조하므로 영향 없음
  const { error } = await getSupabaseAdmin()
    .from('msg_stkr')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: 'ADMIN',
    })
    .eq('stkr_id', stkrId)
    .eq('pack_id', packId)
    .eq('del_yn', 'N')

  if (error)
    return NextResponse.json({ error: '스티커 삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 어드민 스티커팩 상세 — 조회(스티커 목록 포함)·수정·논리삭제

type Params = { params: Promise<{ packId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const { packId } = await params

  const db = getSupabaseAdmin()
  const [{ data: pack }, { data: stickers }] = await Promise.all([
    db
      .from('msg_stkr_pack')
      .select(
        'pack_id, pack_nm, pack_desc, theme_cd, price_bean, is_dflt_yn, use_yn, ownr_usr_id, mkt_yn, reg_dtm',
      )
      .eq('pack_id', packId)
      .eq('del_yn', 'N')
      .maybeSingle(),
    db
      .from('msg_stkr')
      .select('stkr_id, stkr_nm, stkr_url, sort_ord')
      .eq('pack_id', packId)
      .eq('del_yn', 'N')
      .order('sort_ord'),
  ])

  if (!pack)
    return NextResponse.json(
      { error: '팩을 찾을 수 없습니다' },
      { status: 404 },
    )
  return NextResponse.json({ pack, stickers: stickers ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const { packId } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }
  const { pack_nm, pack_desc, theme_cd, price_bean, use_yn, is_dflt_yn } =
    body as {
      pack_nm?: string
      pack_desc?: string
      theme_cd?: string | null
      price_bean?: number
      use_yn?: string
      is_dflt_yn?: string
    }

  const update: Record<string, unknown> = {
    modr_id: 'ADMIN',
    mod_dtm: new Date().toISOString(),
  }

  if (pack_nm !== undefined) {
    const name = pack_nm.trim()
    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: '팩 이름은 1~100자여야 합니다' },
        { status: 400 },
      )
    }
    update.pack_nm = name
  }
  if (pack_desc !== undefined) update.pack_desc = pack_desc.trim() || null
  if (theme_cd !== undefined) update.theme_cd = theme_cd || null
  if (price_bean !== undefined) {
    const price = Number(price_bean)
    if (!Number.isInteger(price) || price < 0 || price > 100000) {
      return NextResponse.json(
        { error: '가격은 0~100000 Bean 정수여야 합니다' },
        { status: 400 },
      )
    }
    update.price_bean = price
  }
  if (use_yn !== undefined) update.use_yn = use_yn === 'Y' ? 'Y' : 'N'
  if (is_dflt_yn !== undefined)
    update.is_dflt_yn = is_dflt_yn === 'Y' ? 'Y' : 'N'

  const { error } = await getSupabaseAdmin()
    .from('msg_stkr_pack')
    .update(update)
    .eq('pack_id', packId)
    .eq('del_yn', 'N')

  if (error)
    return NextResponse.json({ error: '팩 수정 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  const { packId } = await params

  // 논리삭제 — 물리 DELETE 금지 (DA 표준). 보유 이력(msg_usr_stkr)은 보존.
  const { error } = await getSupabaseAdmin()
    .from('msg_stkr_pack')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: 'ADMIN',
    })
    .eq('pack_id', packId)
    .eq('del_yn', 'N')

  if (error)
    return NextResponse.json({ error: '팩 삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

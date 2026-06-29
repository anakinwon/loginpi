import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/admin/feedback/ctgr-items
//   ?mode=categories  → mps_ctgr 전체 목록 (계층 레이블 포함)
//   ?ctgr_id=<uuid>   → 해당 카테고리의 fbck_ctgr_item 목록
// POST   body: { ctgr_id, item_cd, item_nm, item_desc?, sort_ord? }
// PATCH  body: { item_id, item_nm?, item_desc?, sort_ord? }
// DELETE ?item_id=<uuid>

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const db = getSupabaseAdmin()
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('mode')
  const ctgrId = searchParams.get('ctgr_id')

  // 카테고리 목록 (대분류 레이블 > 이름 조합)
  if (mode === 'categories') {
    const { data, error } = await db
      .from('mps_ctgr')
      .select('ctgr_id, parent_ctgr_id, ctgr_nm, sort_ord')
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })

    if (error)
      return NextResponse.json({ error: '카테고리 조회 실패' }, { status: 500 })

    // 부모명 맵 구성
    const parentMap = new Map<string, string>(
      (data ?? []).map((c: { ctgr_id: string; ctgr_nm: string }) => [
        c.ctgr_id,
        c.ctgr_nm,
      ]),
    )
    const categories = (data ?? []).map(
      (c: {
        ctgr_id: string
        parent_ctgr_id: string | null
        ctgr_nm: string
        sort_ord: number
      }) => ({
        ctgr_id: c.ctgr_id,
        ctgr_nm: c.ctgr_nm,
        label: c.parent_ctgr_id
          ? `${parentMap.get(c.parent_ctgr_id) ?? '?'} > ${c.ctgr_nm}`
          : c.ctgr_nm,
        is_leaf: !(data ?? []).some(
          (ch: { parent_ctgr_id: string | null }) =>
            ch.parent_ctgr_id === c.ctgr_id,
        ),
      }),
    )

    return NextResponse.json({ categories })
  }

  // 특정 카테고리의 평가 항목 목록
  if (ctgrId) {
    const { data, error } = await db
      .from('fbck_ctgr_item')
      .select('item_id, item_cd, item_nm, item_desc, sort_ord, mod_dtm')
      .eq('ctgr_id', ctgrId)
      .eq('del_yn', 'N')
      .order('sort_ord', { ascending: true })

    if (error)
      return NextResponse.json({ error: '항목 조회 실패' }, { status: 500 })
    return NextResponse.json({ items: data ?? [] })
  }

  return NextResponse.json(
    { error: 'mode=categories 또는 ctgr_id 필요' },
    { status: 400 },
  )
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const body = (await req.json()) as {
    ctgr_id?: string
    item_cd?: string
    item_nm?: string
    item_desc?: string
    sort_ord?: number
  }

  if (!body.ctgr_id || !body.item_cd?.trim() || !body.item_nm?.trim()) {
    return NextResponse.json(
      { error: 'ctgr_id, item_cd, item_nm은 필수입니다' },
      { status: 400 },
    )
  }

  const itemCd = body.item_cd.trim().toUpperCase()
  if (!/^[A-Z0-9_]{1,16}$/.test(itemCd)) {
    return NextResponse.json(
      { error: '항목 코드는 영문대문자·숫자·_ 1~16자' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()

  // ctgr_id 존재 검증
  const { data: ctgr } = await db
    .from('mps_ctgr')
    .select('ctgr_id')
    .eq('ctgr_id', body.ctgr_id)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!ctgr)
    return NextResponse.json(
      { error: '존재하지 않는 카테고리입니다' },
      { status: 400 },
    )

  const { data, error } = await db
    .from('fbck_ctgr_item')
    .insert({
      ctgr_id: body.ctgr_id,
      item_cd: itemCd,
      item_nm: body.item_nm.trim(),
      item_desc: body.item_desc?.trim() || null,
      sort_ord: body.sort_ord ?? 0,
      regr_id: user!.id,
      modr_id: user!.id,
    })
    .select('item_id, item_cd, item_nm, item_desc, sort_ord, mod_dtm')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '이미 같은 코드의 항목이 있습니다' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: '항목 추가 실패' }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const body = (await req.json()) as {
    item_id?: string
    item_nm?: string
    item_desc?: string
    sort_ord?: number
  }

  if (!body.item_id)
    return NextResponse.json({ error: 'item_id 필요' }, { status: 400 })

  const patch: Record<string, unknown> = {
    modr_id: user!.id,
    mod_dtm: new Date().toISOString(),
  }
  if (body.item_nm !== undefined) patch.item_nm = body.item_nm.trim()
  if (body.item_desc !== undefined)
    patch.item_desc = body.item_desc?.trim() || null
  if (body.sort_ord !== undefined) patch.sort_ord = body.sort_ord

  const { data, error } = await getSupabaseAdmin()
    .from('fbck_ctgr_item')
    .update(patch)
    .eq('item_id', body.item_id)
    .eq('del_yn', 'N')
    .select('item_id, item_cd, item_nm, item_desc, sort_ord, mod_dtm')
    .maybeSingle()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  if (!data)
    return NextResponse.json(
      { error: '항목을 찾을 수 없습니다' },
      { status: 404 },
    )

  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user))
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const itemId = req.nextUrl.searchParams.get('item_id')
  if (!itemId)
    return NextResponse.json({ error: 'item_id 필요' }, { status: 400 })

  const { error } = await getSupabaseAdmin()
    .from('fbck_ctgr_item')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: user!.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('item_id', itemId)
    .eq('del_yn', 'N')

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

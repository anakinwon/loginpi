import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 어드민 스티커 관리 — 팩 목록(+스티커 수·보유자 수) 및 팩 생성

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const db = getSupabaseAdmin()
  const [
    { data: packs, error },
    { data: stkrRows },
    { data: ownrRows },
    { data: themes },
  ] = await Promise.all([
    db
      .from('msg_stkr_pack')
      .select(
        `
          pack_id, pack_nm, pack_desc, theme_cd, price_bean, is_dflt_yn, use_yn,
          ownr_usr_id, mkt_yn, reg_dtm,
          msg_theme(theme_nm, theme_emoji)
        `,
      )
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false }),
    db.from('msg_stkr').select('pack_id').eq('del_yn', 'N'),
    db.from('msg_usr_stkr').select('pack_id').eq('del_yn', 'N'),
    db
      .from('msg_theme')
      .select('theme_cd, theme_nm, theme_emoji')
      .eq('del_yn', 'N')
      .order('sort_ord'),
  ])

  if (error) {
    return NextResponse.json(
      { error: '스티커팩 목록 조회 실패' },
      { status: 500 },
    )
  }

  // 팩별 스티커 수·보유자 수 집계 (N+1 대신 IN 일괄 조회 후 Map 매핑)
  const stkrCnt = new Map<string, number>()
  for (const r of stkrRows ?? [])
    stkrCnt.set(r.pack_id, (stkrCnt.get(r.pack_id) ?? 0) + 1)
  const ownrCnt = new Map<string, number>()
  for (const r of ownrRows ?? [])
    ownrCnt.set(r.pack_id, (ownrCnt.get(r.pack_id) ?? 0) + 1)

  const rows = (packs ?? []).map((p: Record<string, unknown>) => ({
    ...p,
    stkr_cnt: stkrCnt.get(p.pack_id as string) ?? 0,
    ownr_cnt: ownrCnt.get(p.pack_id as string) ?? 0,
  }))

  return NextResponse.json({ packs: rows, themes: themes ?? [] })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { pack_nm, pack_desc, theme_cd, price_bean, is_dflt_yn } = body as {
    pack_nm?: string
    pack_desc?: string
    theme_cd?: string
    price_bean?: number
    is_dflt_yn?: string
  }

  const name = pack_nm?.trim()
  if (!name || name.length > 100) {
    return NextResponse.json(
      { error: '팩 이름을 입력해주세요 (100자 이내)' },
      { status: 400 },
    )
  }
  const price = Number(price_bean ?? 0)
  if (!Number.isInteger(price) || price < 0 || price > 100000) {
    return NextResponse.json(
      { error: '가격은 0~100000 Bean 정수여야 합니다' },
      { status: 400 },
    )
  }

  const db = getSupabaseAdmin()

  // 테마 코드 유효성 검증 (선택 입력)
  if (theme_cd) {
    const { data: theme } = await db
      .from('msg_theme')
      .select('theme_cd')
      .eq('theme_cd', theme_cd)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (!theme)
      return NextResponse.json(
        { error: '존재하지 않는 테마입니다' },
        { status: 400 },
      )
  }

  const { data: pack, error } = await db
    .from('msg_stkr_pack')
    .insert({
      pack_nm: name,
      pack_desc: pack_desc?.trim() || null,
      theme_cd: theme_cd || null,
      price_bean: price,
      is_dflt_yn: is_dflt_yn === 'Y' ? 'Y' : 'N',
      regr_id: 'ADMIN',
      modr_id: 'ADMIN',
    })
    .select('pack_id, pack_nm')
    .single()

  if (error || !pack) {
    return NextResponse.json({ error: '팩 생성 실패' }, { status: 500 })
  }

  // 기본팩 지정 시 테마 기본 스티커팩 매핑 등록
  if (is_dflt_yn === 'Y' && theme_cd) {
    await db
      .from('msg_theme_stkr')
      .upsert(
        { theme_cd, pack_id: pack.pack_id, regr_id: 'ADMIN', modr_id: 'ADMIN' },
        { onConflict: 'theme_cd,pack_id' },
      )
  }

  return NextResponse.json({ pack }, { status: 201 })
}

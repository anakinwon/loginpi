import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

// 어드민 스티커 관리 — 팩 목록(+스티커 수·보유자 수) 및 팩 생성

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  const db = getSupabaseAdmin()
  // 스티커 수·보유자 수 = 임베디드 count 집계(FK msg_stkr·msg_usr_stkr → msg_stkr_pack) — 행 전량 전송·1000행 상한 과소 집계 제거(R-P3)
  const [{ data: packs, error }, { data: themes }] = await Promise.all([
    db
      .from('msg_stkr_pack')
      .select(
        `
          pack_id, pack_nm, pack_desc, theme_cd, price_bean, is_dflt_yn, use_yn,
          ownr_usr_id, mkt_yn, reg_dtm,
          msg_theme(theme_nm, theme_emoji),
          msg_stkr(count), msg_usr_stkr(count)
        `,
      )
      .eq('del_yn', 'N')
      .eq('msg_stkr.del_yn', 'N')
      .eq('msg_usr_stkr.del_yn', 'N')
      .order('reg_dtm', { ascending: false }),
    db
      .from('msg_theme')
      .select('theme_cd, theme_nm, theme_emoji')
      .eq('del_yn', 'N')
      .order('sort_ord'),
  ])

  if (error) {
    return apiError('ADM_STKR_PACK_LIST_FAILED', 500)
  }

  type Cnt = { count: number }[] | null
  const rows = (packs ?? []).map(
    ({
      msg_stkr,
      msg_usr_stkr,
      ...p
    }: Record<string, unknown> & { msg_stkr?: Cnt; msg_usr_stkr?: Cnt }) => ({
      ...p,
      stkr_cnt: msg_stkr?.[0]?.count ?? 0,
      ownr_cnt: msg_usr_stkr?.[0]?.count ?? 0,
    }),
  )

  return NextResponse.json({ packs: rows, themes: themes ?? [] })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return apiError('FORBIDDEN', 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
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
    return apiError('ADM_STKR_PACK_NAME_REQUIRED', 400)
  }
  const price = Number(price_bean ?? 0)
  if (!Number.isInteger(price) || price < 0 || price > 100000) {
    return apiError('ADM_STKR_PRICE_RANGE', 400)
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
    if (!theme) return apiError('ADM_STKR_THEME_NOT_FOUND', 400)
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
    return apiError('ADM_STKR_PACK_CREATE_FAILED', 500)
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

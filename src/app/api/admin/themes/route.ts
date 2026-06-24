import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// 테마 코드 형식: 대문자 스네이크케이스 (VARCHAR(20), DA 표준)
const THEME_CD_RE = /^[A-Z0-9_]{1,20}$/

export async function GET(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const tpFilter = searchParams.get('tp') ?? '' // BASIC | PREMIUM | ''

  // 관리자 화면은 use_yn 상관없이 모두 노출(노출 토글 관리 대상) — 논리삭제만 제외
  let query = getSupabaseAdmin()
    .from('msg_theme')
    .select(
      'theme_cd, theme_nm, theme_nm_en, theme_emoji, theme_desc, theme_tp_cd, sort_ord, use_yn',
    )
    .eq('del_yn', 'N')
    .order('theme_tp_cd', { ascending: true })
    .order('sort_ord', { ascending: true })

  if (tpFilter === 'BASIC' || tpFilter === 'PREMIUM') {
    query = query.eq('theme_tp_cd', tpFilter)
  }

  if (search) {
    const s = search.replace(/[%_\\]/g, '\\$&')
    query = query.or(`theme_cd.ilike.%${s}%,theme_nm.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  return NextResponse.json({ themes: data })
}

export async function POST(req: NextRequest) {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const body = (await req.json()) as {
    theme_cd?: string
    theme_nm?: string
    theme_nm_en?: string
    theme_emoji?: string
    theme_desc?: string
    theme_tp_cd?: string
    sort_ord?: number | null
    use_yn?: string
  }

  const themeCd = body.theme_cd?.trim().toUpperCase() ?? ''
  if (!THEME_CD_RE.test(themeCd)) {
    return NextResponse.json(
      { error: '테마 코드는 영문 대문자·숫자·_ 조합 1~20자여야 합니다' },
      { status: 400 },
    )
  }
  if (!body.theme_nm?.trim() || !body.theme_emoji?.trim()) {
    return NextResponse.json(
      { error: '테마명과 이모지는 필수입니다' },
      { status: 400 },
    )
  }
  const tp = body.theme_tp_cd === 'PREMIUM' ? 'PREMIUM' : 'BASIC'

  const { data, error } = await getSupabaseAdmin()
    .from('msg_theme')
    .insert({
      theme_cd: themeCd,
      theme_nm: body.theme_nm.trim(),
      theme_nm_en: body.theme_nm_en?.trim() || null,
      theme_emoji: body.theme_emoji.trim(),
      theme_desc: body.theme_desc?.trim() || null,
      theme_tp_cd: tp,
      sort_ord: body.sort_ord ?? 0,
      use_yn: body.use_yn === 'N' ? 'N' : 'Y',
      regr_id: requester?.id ?? 'ADMIN',
      modr_id: requester?.id ?? 'ADMIN',
    })
    .select()
    .single()

  if (error) {
    // PK 충돌 — 동일 코드(논리삭제된 것 포함) 존재 (PRD_17: 재생성 시 별도 코드 사용)
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '이미 존재하는 테마 코드입니다(삭제된 코드 포함)' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: '등록 실패' }, { status: 500 })
  }

  return NextResponse.json({ theme: data }, { status: 201 })
}

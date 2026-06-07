import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// alpha-2 코드 → 국기 이모지 (Regional Indicator Symbol 변환)
function toFlagEmoji(cc: string): string {
  return [...cc.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e0 + c.charCodeAt(0) - 65))
    .join('')
}

// PATCH: locale 활성/비활성 토글
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    locale_cd: string
    is_active: 'Y' | 'N'
    locale_nm?: string
    country_cd?: string
  }
  const { locale_cd, is_active, locale_nm, country_cd } = body

  if (!locale_cd) {
    return NextResponse.json({ error: 'locale_cd required' }, { status: 400 })
  }

  // 기본 언어(ko) 비활성화 방지
  if (locale_cd === 'ko' && is_active === 'N') {
    return NextResponse.json(
      { error: '기본 언어(ko)는 비활성화할 수 없습니다' },
      { status: 400 }
    )
  }

  // 새 locale 활성화: sort_ord = 현재 최대값 + 1
  let sort_ord = 0
  if (is_active === 'Y') {
    const { data } = await supabase
      .from('i18n_locale')
      .select('sort_ord')
      .order('sort_ord', { ascending: false })
      .limit(1)
      .single()
    sort_ord = (data?.sort_ord ?? 0) + 1
  }

  const flag_emoji = country_cd ? toFlagEmoji(country_cd) : null
  const nm = locale_nm ?? locale_cd

  const { error } = await supabase.from('i18n_locale').upsert(
    { locale_cd, locale_nm: nm, flag_emoji, is_active, sort_ord },
    { onConflict: 'locale_cd' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // locale_cd가 null이었던 국가를 활성화할 때 i18n_cntry_mst.locale_cd 연결
  // (locale_cd가 null인 경우만 덮어쓰기 → 기존 연결 보호)
  if (country_cd && is_active === 'Y') {
    await supabase
      .from('i18n_cntry_mst')
      .update({ locale_cd })
      .eq('country_cd', country_cd.toUpperCase())
      .is('locale_cd', null)
  }

  return NextResponse.json({ ok: true, locale_cd, is_active })
}

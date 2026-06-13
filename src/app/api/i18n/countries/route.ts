import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 활성 locale·국가마스터는 admin 토글 시에만 변하는 저빈도 데이터.
// 10분 단위 재검증으로 매 요청마다 Supabase를 때리지 않고 CDN/서버 캐시를 공유한다.
// (admin 활성화 후 반영은 최대 10분 — 허용 가능. 즉시 반영 필요 시 revalidateTag로 전환)
export const revalidate = 600

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const [{ data: locales }, { data: countries }] = await Promise.all([
    supabase
      .from('i18n_locale')
      .select('locale_cd, locale_nm, flag_emoji, sort_ord')
      .eq('is_active', 'Y')
      .order('sort_ord'),
    supabase
      .from('i18n_cntry_mst')
      .select(
        'country_cd, dis_ord_seq, country_eng_nm, country_mot_nm, currency_cd, locale_cd, use_yn',
      )
      .order('dis_ord_seq', { ascending: true }),
  ])

  return NextResponse.json({
    locales: locales ?? [],
    countries: countries ?? [],
  })
}

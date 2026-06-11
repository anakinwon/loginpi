import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

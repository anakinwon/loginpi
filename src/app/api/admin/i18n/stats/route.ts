import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // 지원 언어 목록
  const { data: locales } = await supabase
    .from('i18n_locale')
    .select('*')
    .eq('is_active', 'Y')
    .order('sort_ord')

  // ko 기준 전체 키 수
  const { count: totalKeys } = await supabase
    .from('i18n_message')
    .select('*', { count: 'exact', head: true })
    .eq('locale_cd', 'ko')

  // 언어별 번역 완료 키 수
  const { data: perLocale } = await supabase
    .from('i18n_message')
    .select('locale_cd')
    .not('msg_val', 'is', null)

  const countMap: Record<string, number> = {}
  for (const row of perLocale ?? []) {
    countMap[row.locale_cd] = (countMap[row.locale_cd] ?? 0) + 1
  }

  const total = totalKeys ?? 0
  const stats = (locales ?? []).map((loc) => ({
    ...loc,
    translated: countMap[loc.locale_cd] ?? 0,
    total,
    pct: total > 0 ? Math.round(((countMap[loc.locale_cd] ?? 0) / total) * 100) : 0,
  }))

  const completed = stats.filter((s) => s.pct === 100).length

  return NextResponse.json({ locales: stats, totalKeys: total, completed })
}

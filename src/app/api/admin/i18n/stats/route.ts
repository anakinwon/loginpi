import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser, isAdmin } from '@/lib/auth-check'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const user = await getSessionUser()
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: locales } = await supabase
    .from('i18n_locale')
    .select('*')
    .eq('is_active', 'Y')
    .order('sort_ord')

  const { count: totalKeys } = await supabase
    .from('i18n_message')
    .select('*', { count: 'exact', head: true })
    .eq('locale_cd', 'ko')

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

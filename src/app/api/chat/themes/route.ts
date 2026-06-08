import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export interface ThemeRow {
  theme_cd: string
  theme_nm: string
  theme_emoji: string
  theme_desc: string | null
  theme_tp_cd: 'BASIC' | 'PREMIUM'
  sort_ord: number
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('msg_theme')
    .select('theme_cd, theme_nm, theme_emoji, theme_desc, theme_tp_cd, sort_ord')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('sort_ord')

  if (error) return NextResponse.json({ error: '테마 목록 조회 실패' }, { status: 500 })
  return NextResponse.json({ themes: (data ?? []) as ThemeRow[] })
}

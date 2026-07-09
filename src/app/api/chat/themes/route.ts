import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { apiError } from '@/lib/api-errors'

export interface ThemeRow {
  theme_cd: string
  theme_nm: string
  theme_nm_en: string | null
  theme_emoji: string
  theme_desc: string | null
  theme_tp_cd: 'BASIC' | 'PREMIUM'
  sort_ord: number
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from('msg_theme')
    .select(
      'theme_cd, theme_nm, theme_nm_en, theme_emoji, theme_desc, theme_tp_cd, sort_ord',
    )
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('sort_ord')

  if (error) return apiError('LIST_FAILED', 500)
  return NextResponse.json({ themes: (data ?? []) as ThemeRow[] })
}

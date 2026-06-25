import 'server-only'
import { cache } from 'react'
import { getSupabaseAdmin } from './supabase-admin'
import type { UiTheme } from './ui-theme-tokens'

// 공용 타입·상수·순수 함수 re-export (기존 import 경로 유지)
export * from './ui-theme-tokens'

// 활성 UI 테마 1건 조회 (없으면 null → globals.css 기본값 사용).
// React cache로 요청 단위 메모이즈 — 루트·admin 레이아웃이 동시 호출해도 DB 1회.
export const getActiveUiTheme = cache(async (): Promise<UiTheme | null> => {
  const { data, error } = await getSupabaseAdmin()
    .from('ui_theme')
    .select('theme_id, theme_nm, theme_desc, theme_tokens, actv_yn, lock_yn, apply_scope_cd, sort_ord')
    .eq('actv_yn', 'Y')
    .eq('del_yn', 'N')
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as UiTheme
})

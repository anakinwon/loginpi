import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'

export interface CategoryRow {
  brd_ctgr_id: string
  ctgr_cd: string
  ctgr_nm: string
  attch_yn: string
  cmnt_yn: string
  wr_min_role_cd: string
  sort_ord: number
  use_yn: string
}

export interface PostRow {
  post_id: string
  ctgr_cd: string
  post_ttl: string
  post_cont: string | null
  rgst_usr_id: string
  rgst_usr_nm: string
  vw_cnt: number
  pin_yn: string
  answ_yn: string
  acpt_cmnt_id: string | null
  reg_dtm: string
  mod_dtm: string
}

const ROLE_LEVEL: Record<string, number> = {
  ADMIN: 4, MASTER: 3, MANAGER: 2, USER: 1,
}

export function hasMinRole(userRole: string, minRole: string): boolean {
  return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[minRole] ?? 1)
}

export async function getCategory(ctgrCd: string): Promise<CategoryRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('brd_ctgr')
    .select('*')
    .eq('ctgr_cd', ctgrCd.toUpperCase())
    .eq('use_yn', 'Y')
    .single()
  return (data as CategoryRow) ?? null
}

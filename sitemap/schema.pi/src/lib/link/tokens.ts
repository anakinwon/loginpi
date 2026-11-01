// 사이트 연결 토큰 관리(sql/077 sys_lnk_tkn) — 목록·발급·폐기. 발급 원문 slk_… 은 발급 응답에서만, 저장은 SHA-256 해시(mdl_db_agt 선례)
import 'server-only'
import { db } from '../db'
import { newToken, tokenHash, tokenPfx } from './rules'

export type TknRow = { tkn_id: string; tkn_nm: string; tkn_pfx: string; exp_dtm: string; lst_use_dtm: string | null; reg_dtm: string }
const COLS = 'tkn_id, tkn_nm, tkn_pfx, exp_dtm, lst_use_dtm, reg_dtm'
export const TKN_MAX = 20 // 분류체계별 활성 토큰 상한

export async function listTkns(areaId: string) {
  const r = await db().from('sys_lnk_tkn').select(COLS).eq('area_id', areaId).eq('del_yn', 'N').gt('exp_dtm', new Date().toISOString()).order('reg_dtm', { ascending: false }).limit(TKN_MAX)
  if (r.error) throw r.error
  return r.data as TknRow[]
}

export async function createTkn(areaId: string, nm: string, days: number, uid: string) {
  const tkn = newToken()
  const r = await db()
    .from('sys_lnk_tkn')
    .insert({ area_id: areaId, tkn_nm: nm, tkn_hash: tokenHash(tkn), tkn_pfx: tokenPfx(tkn), exp_dtm: new Date(Date.now() + days * 86_400_000).toISOString(), regr_id: uid, modr_id: uid })
    .select(COLS)
    .single()
  if (r.error) throw r.error
  return { item: r.data as TknRow, token: tkn }
}

export async function revokeTkn(areaId: string, tknId: string, uid: string) {
  const r = await db().from('sys_lnk_tkn').update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: uid }).eq('area_id', areaId).eq('tkn_id', tknId).eq('del_yn', 'N').select('tkn_id')
  if (r.error) throw r.error
  return r.data.length > 0
}

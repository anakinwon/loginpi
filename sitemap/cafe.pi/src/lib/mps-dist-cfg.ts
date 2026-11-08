import 'server-only'
import { unstable_cache } from 'next/cache'
import { getSupabaseAdmin } from './supabase-admin'

export interface DistCfgRow {
  cfg_id: string
  max_dist_km: number
  note_txt: string | null
  modr_id: string
  reg_dtm: string
}

// 현행 설정 — 60초 캐시, 어드민 저장 시 즉시 무효화
export const getDistCfg = unstable_cache(
  async (): Promise<{ max_dist_km: number }> => {
    const { data } = await getSupabaseAdmin()
      .from('mps_dist_cfg')
      .select('max_dist_km')
      .eq('del_yn', 'N')
      .order('reg_dtm', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { max_dist_km: data?.max_dist_km ?? 50 }
  },
  ['mps-dist-cfg'],
  { revalidate: 60, tags: ['mps-dist-cfg'] },
)

// 변경 이력 (최근 20건) — 어드민 전용, 캐시 없이 직접 조회
export async function getDistCfgHistory(): Promise<DistCfgRow[]> {
  const { data } = await getSupabaseAdmin()
    .from('mps_dist_cfg')
    .select('cfg_id, max_dist_km, note_txt, modr_id, reg_dtm')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(20)
  return (data ?? []) as DistCfgRow[]
}

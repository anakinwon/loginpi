// 운영 설정(sys_cfg, sql/012) 읽기·쓰기 — 사용료 상태 타이머 3종(시간 단위, 0.01~720h). 크론(P5)·안내 문구·관리자 설정 화면이 같은 값을 쓴다.
//  행이 없으면 기본값(sql/012 시드와 동일) — 코드 상수는 폴백일 뿐 단일 출처는 DB(PRD_USAGE_FEE_STATE §4)
import 'server-only'
import { db } from './api'

export const CFG_KEYS = [
  'SITE_PAY_TIMEOUT_HOUR', // 신청중(APPLYING) 미결제 자동 반려까지
  'SITE_USE_BGN_DELAY_HOUR', // 결제완료(PAID) → 사용중(IN_USE) 자동 전이 지연
  'SITE_REAPLY_WINDOW_HOUR', // 사용완료(USED) 후 직전 신청인 재등록 우선 창
] as const
export type CfgKey = (typeof CFG_KEYS)[number]
export type SiteCfg = Record<CfgKey, number>

export const CFG_DEFAULT: SiteCfg = {
  SITE_PAY_TIMEOUT_HOUR: 1,
  SITE_USE_BGN_DELAY_HOUR: 1,
  SITE_REAPLY_WINDOW_HOUR: 12,
}
// 허용 범위(시간) — 실기기 검증 시 0.05h 로 낮춰 전 구간 통과 뒤 복귀(PRD §4)
export const CFG_HOUR_MIN = 0.01
export const CFG_HOUR_MAX = 720

export const isCfgKey = (k: string): k is CfgKey =>
  (CFG_KEYS as readonly string[]).includes(k)
export const isCfgHour = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= CFG_HOUR_MIN &&
  v <= CFG_HOUR_MAX

export interface CfgRow {
  cfg_key: CfgKey
  cfg_val: number
  cfg_desc: string | null
  mod_dtm: string
}

// 전체 행(관리자 화면) — 빠진 키는 기본값으로 채운다(mod_dtm 은 빈 문자열)
export async function listCfg(): Promise<CfgRow[]> {
  const { data, error } = await db()
    .from('sys_cfg')
    .select('cfg_key, cfg_val, cfg_desc, mod_dtm')
    .in('cfg_key', CFG_KEYS)
    .eq('del_yn', 'N')
  if (error) throw error
  const by = new Map((data ?? []).map((r) => [r.cfg_key as string, r]))
  return CFG_KEYS.map((k) => {
    const r = by.get(k)
    const v = Number(r?.cfg_val)
    return {
      cfg_key: k,
      cfg_val: isCfgHour(v) ? v : CFG_DEFAULT[k],
      cfg_desc: (r?.cfg_desc as string | null) ?? null,
      mod_dtm: (r?.mod_dtm as string | undefined) ?? '',
    }
  })
}

// 값만(크론·안내 문구·fee-plans 동봉)
export async function getCfg(): Promise<SiteCfg> {
  const rows = await listCfg()
  return Object.fromEntries(rows.map((r) => [r.cfg_key, r.cfg_val])) as SiteCfg
}

// 단건 변경 — 범위 검증은 호출자(라우트)가 isCfgHour 로 끝낸 뒤. 행이 없으면 삽입(시드 누락 대비)
export async function setCfg(key: CfgKey, val: number, actor: string) {
  const { error } = await db().from('sys_cfg').upsert(
    {
      cfg_key: key,
      cfg_val: val,
      del_yn: 'N',
      del_dtm: null,
      modr_id: actor,
    },
    { onConflict: 'cfg_key' },
  )
  if (error) throw error
}

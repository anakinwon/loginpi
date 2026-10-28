// 개최자 요금제 서버 공용(sql/015) — Pi 원화 시세(CoinGecko, 2초·5분 캐시), 남은 시간 조회(fn_rem_smn_plan), 가격표, 시간 소진 종료.
// 원칙 : 원화는 표시·환산 기준일 뿐, 결제·검증은 Pi 금액만(memory krw-display-only-pay-pi). 시세 실패 = null(추정 금지 — 견적 503)
import 'server-only'
import { after } from 'next/server'
import { env } from '@/env'
import { db } from './api'
import { finishNote } from './notes'
import { OPEN_STS } from './seminar-rules'
import { engineAdminBase } from './speech-rules'

// 1 Pi 의 원화 시세 — 외부 호출 2초 제한 + 성공값 5분 캐시(R-P4). 실패는 캐시하지 않는다(다음 요청이 다시 시도)
const PRICE_TTL_MS = 5 * 60 * 1000
let price: { krw: number; at: number } | null = null
export async function piKrw(): Promise<number | null> {
  const now = Date.now()
  if (price && now - price.at < PRICE_TTL_MS) return price.krw
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=krw', {
    cache: 'no-store',
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null)
  const j = r?.ok ? ((await r.json().catch(() => null)) as { 'pi-network'?: { krw?: unknown } } | null) : null
  const krw = Number(j?.['pi-network']?.krw)
  if (!(krw > 0) || !Number.isFinite(krw)) {
    console.error('[plan] Pi 시세 조회 실패', r?.status ?? 'network')
    return null
  }
  price = { krw, at: now }
  return krw
}

export type FeePlan = { plan_cd: 'M' | 'Y'; krw_amt: number | string; use_sec_cnt: number; use_mon_cnt: number }
export async function feePlans(): Promise<FeePlan[]> {
  const { data, error } = await db()
    .from('smn_fee_plan')
    .select('plan_cd, krw_amt, use_sec_cnt, use_mon_cnt')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('sort_seq')
    .returns<FeePlan[]>()
  if (error) throw error
  return data ?? []
}

// 남은 시간 — 이번 달 FREE 보장 + 남은 초 합·유료 여부·가장 이른 만료(요청당 1회 부를 것, R-P2)
export type HostPlan = { remainSec: number; paid: boolean; endAt: string | null }
export async function hostPlan(usrId: string): Promise<HostPlan> {
  const { data, error } = await db().rpc('fn_rem_smn_plan', { p_usr_id: usrId })
  if (error) throw error
  const r = (data as { rem_sec: number | string; paid_yn: string; min_end_dtm: string | null }[] | null)?.[0]
  return { remainSec: Number(r?.rem_sec ?? 0), paid: r?.paid_yn === 'Y', endAt: r?.min_end_dtm ?? null }
}

// 시간 소진 종료 — 세미나 ENDED(열린 상태일 때만, 조건부 갱신 = 멱등 — api/seminars/[id]/end 와 같은 규칙) +
//  응답 뒤(after) 남은 회의록 마무리·엔진 방 강제 종료(DELETE /admin/rooms/{id}, 관리 키·엔진 주소가 있을 때만, 2초 제한 R-P4)
export async function endByPlan(smnId: string, usrId: string): Promise<void> {
  const { error } = await db()
    .from('smn_mst')
    .update({ smn_sts_cd: 'ENDED', end_dtm: new Date().toISOString(), modr_id: usrId })
    .eq('smn_id', smnId)
    .in('smn_sts_cd', [...OPEN_STS])
  if (error) throw error
  after(async () => {
    const base = engineAdminBase(env.NEXT_PUBLIC_MEDIA_WS_URL)
    const [notes] = await Promise.all([
      db().from('smn_nt').select('nt_id').eq('smn_id', smnId).eq('nt_sts_cd', 'RECORDING').eq('del_yn', 'N'),
      base && env.MEDIA_ADMIN_SECRET
        ? fetch(`${base}/admin/rooms/${encodeURIComponent(smnId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${env.MEDIA_ADMIN_SECRET}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(2_000),
          })
            .then((r) => r.status !== 204 && r.status !== 404 && console.error('[plan] 엔진 방 종료 실패', r.status))
            .catch(() => console.error('[plan] 엔진 방 종료 실패 network'))
        : null,
    ])
    if (notes.error) return console.error('[plan] 회의록 조회 실패', notes.error.code)
    await Promise.all((notes.data ?? []).map((x) => finishNote(x.nt_id, 'RECORDING', usrId)))
  })
}

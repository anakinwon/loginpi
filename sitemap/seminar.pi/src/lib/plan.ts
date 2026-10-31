// 개최자 요금제 서버 공용(sql/015) — Pi 원화 시세(CoinGecko, 2초·5분 캐시), 남은 시간 조회(fn_rem_smn_plan), 가격표, 시간 소진 종료.
// 원칙 : 원화는 표시·환산 기준일 뿐, 결제·검증은 Pi 금액만(memory krw-display-only-pay-pi). 시세 실패 = null(추정 금지 — 견적 503)
import 'server-only'
import { after } from 'next/server'
import { env } from '@/env'
import { db } from './api'
import { finishNote } from './notes'
import { isPlanCd, OPEN_STS, type PlanCd, type PlanPool } from './seminar-rules'
import { engineAdminBase } from './speech-rules'

// 1 Pi 의 원화·달러 시세(한 번에) — 외부 호출 2초 제한 + 성공값 5분 캐시(R-P4). 실패는 캐시하지 않는다(다음 요청이 다시 시도)
//  원화 = 환산 기준(가격표가 원화), 달러 = 영어 화면 자국 통화 표시용(없으면 null — 표시만 원화로)
const PRICE_TTL_MS = 5 * 60 * 1000
export type PiRates = { krw: number; usd: number | null }
let price: (PiRates & { at: number }) | null = null
export async function piKrw(): Promise<number | null> {
  return (await piRates())?.krw ?? null
}
export async function piRates(): Promise<PiRates | null> {
  const now = Date.now()
  if (price && now - price.at < PRICE_TTL_MS) return price
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=krw,usd', {
    cache: 'no-store',
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null)
  const j = r?.ok ? ((await r.json().catch(() => null)) as { 'pi-network'?: { krw?: unknown; usd?: unknown } } | null) : null
  const krw = Number(j?.['pi-network']?.krw)
  const usd = Number(j?.['pi-network']?.usd)
  if (!(krw > 0) || !Number.isFinite(krw)) {
    console.error('[plan] Pi 시세 조회 실패', r?.status ?? 'network')
    return null
  }
  price = { krw, usd: usd > 0 && Number.isFinite(usd) ? usd : null, at: now }
  return price
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

// 남은 시간 — 이번 달 FREE 보장 + 요금제별(FREE·M·Y) 남은 초·가장 늦은 만료(sql/018 fn_rem_smn_plan_cd). 요청당 1회 부를 것(R-P2)
//  세미나는 요금제 1개에 묶이므로(smn_mst.plan_cd) 판정은 planSec(h, 그 세미나 요금제)로. 관리자 예외 없음(마스터 2026-10-29)
export type HostPlan = { remainSec: number; paid: boolean; byPlan: Partial<Record<PlanCd, PlanPool>> }
export async function hostPlan(usrId: string): Promise<HostPlan> {
  const { data, error } = await db().rpc('fn_rem_smn_plan_cd', { p_usr_id: usrId })
  if (error) throw error
  const byPlan: HostPlan['byPlan'] = {}
  for (const r of (data as { plan_cd: string; rem_sec: number | string; max_end_dtm: string | null }[] | null) ?? [])
    if (isPlanCd(r.plan_cd)) byPlan[r.plan_cd] = { sec: Number(r.rem_sec), endAt: r.max_end_dtm }
  const remainSec = Object.values(byPlan).reduce((a, p) => a + p.sec, 0)
  return { remainSec, paid: !!(byPlan.M || byPlan.Y), byPlan }
}
export const planSec = (h: HostPlan | null, cd: string) => (h && isPlanCd(cd) ? (h.byPlan[cd]?.sec ?? 0) : 0)
// 세미나가 쓸 수 있는 시간(sql/021) — 유료(M·Y) 세미나 = 그 요금제 먼저 + 이번 달 무료, 무료 세미나 = 무료만. 카운트다운은 둘로 나눠 보인다
export function planPools(h: HostPlan | null, cd: string): { paid: number | null; free: number } {
  const free = planSec(h, 'FREE')
  return cd === 'M' || cd === 'Y' ? { paid: planSec(h, cd), free } : { paid: null, free }
}
export const planLeft = (h: HostPlan | null, cd: string) => {
  const p = planPools(h, cd)
  return (p.paid ?? 0) + p.free
}

// 엔진 관리 API 호출 공용 — 시그널링 주소와 같은 호스트의 /admin/*(Bearer MEDIA_ADMIN_SECRET), 2초 제한(R-P4)·캐시 없음.
//  키·주소 미설정이거나 네트워크 실패·시간 초과 = null(미설정 구분은 engineAdminOn). 무대 관문(speech-gate stageGate)은 미설정 = 확인 생략이라 따로 부른다
export const engineAdminOn = () => !!engineAdminBase(env.NEXT_PUBLIC_MEDIA_WS_URL) && !!env.MEDIA_ADMIN_SECRET
export async function engineAdmin(path: string, method: 'GET' | 'DELETE' = 'GET'): Promise<Response | null> {
  const base = engineAdminBase(env.NEXT_PUBLIC_MEDIA_WS_URL)
  if (!base || !env.MEDIA_ADMIN_SECRET) return null
  return fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.MEDIA_ADMIN_SECRET}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null)
}

// 엔진 방 강제 종료(DELETE /admin/rooms/{id} — 접속자 전원 ROOM_CLOSED, 종료 표시는 남기지 않아 다시 들어오면 새로 열린다).
//  관리 키·엔진 주소가 있을 때만. 결과 = 방이 없어졌는가(204·404). 실패는 기록만(시간 소진 종료·개최자 부재 퇴장·방 관리가 같이 쓴다)
export async function closeEngineRoom(smnId: string): Promise<boolean> {
  if (!engineAdminOn()) return false
  const r = await engineAdmin(`/admin/rooms/${encodeURIComponent(smnId)}`, 'DELETE')
  if (r?.status === 204 || r?.status === 404) return true
  console.error('[plan] 엔진 방 종료 실패', r?.status ?? 'network')
  return false
}

// 세미나 종료(시간 소진·관리자 강제 종료) — 세미나 ENDED 를 먼저(열린 상태일 때만, 조건부 갱신 = 멱등 — api/seminars/[id]/end 와 같은 규칙) :
//  엔진만 닫으면 DB 가 열린 상태라 입장권이 다시 나가 방이 새로 열린다. 응답 뒤(after) 남은 회의록 마무리.
//  엔진 방 강제 종료 = 기본 after(하트비트 응답을 늦추지 않게), awaitEngine = 기다려 결과를 돌려준다(방 관리 화면이 바로 목록을 다시 읽음)
export async function endSeminar(smnId: string, usrId: string, awaitEngine = false): Promise<boolean> {
  const { error } = await db()
    .from('smn_mst')
    .update({ smn_sts_cd: 'ENDED', end_dtm: new Date().toISOString(), modr_id: usrId })
    .eq('smn_id', smnId)
    .in('smn_sts_cd', [...OPEN_STS])
  if (error) throw error
  after(async () => {
    const [notes] = await Promise.all([
      db().from('smn_nt').select('nt_id').eq('smn_id', smnId).eq('nt_sts_cd', 'RECORDING').eq('del_yn', 'N'),
      awaitEngine ? null : closeEngineRoom(smnId),
    ])
    if (notes.error) return console.error('[plan] 회의록 조회 실패', notes.error.code)
    await Promise.all((notes.data ?? []).map((x) => finishNote(x.nt_id, 'RECORDING', usrId)))
  })
  return awaitEngine ? closeEngineRoom(smnId) : true
}

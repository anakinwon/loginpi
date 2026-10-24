// 배포 후 실시간 확인(2026-10-22, 마스터 지시 "배포 후에는 반영 결과를 반드시 바로 확인 — 재분석이 오래 걸리면 강제로 막고 실시간 확인 방법") — 서버 전용
//  AI 수정(sql/072 mon_ai_fix)이 운영 배포된 경로는 VERIFY_MS 동안 AI 재분석을 막고(배포 전 오류가 분석 구간에 남아 '미결'로 보이는 문제),
//  대신 배포 시점 이후 실측(mon_app_hist 분 합계·mon_app_evt_hist 오류)을 몇 초마다 보여 줘 해결 여부를 바로 판정
import 'server-only'
import { db } from './db'
import { minuteOf } from './mon'

export const VERIFY_MS = 30 * 60_000 // 재분석 차단 = 가장 짧은 분석 구간(30분) — 지나면 배포 전 오류가 30분 창에서 빠짐
export const VERIFY_MIN_REQ = 5 // '해결 확인' 판정 최소 요청 수(근거 없는 초기값 — 실측 후 조정)

export interface LastDeploy {
  sts: 'DPLY' | 'DONE' | 'FAIL'
  pr: number | null
  at: string | null // 배포 완료 확인 시각(dply_dtm, 배포 중이면 null)
  cut: number // 배포 후 구간 시작(ms) = 배포가 걸친 분 다음 분 — 그 분 버킷은 배포 전후가 섞임
  until: number // 재분석 차단 끝(ms) — 배포 실패면 지금(차단 없음)
  rbk: boolean // 되돌리기 배포(수정 전 코드로 복귀)
}

type Row = { fix_sts_cd: string; pr_no: number | null; dply_dtm: string | null; apv_dtm: string | null; mrg_cmt_txt: string | null; rbk_dtm: string | null; rbk_cmt_txt: string | null; rbk_dply_dtm: string | null }
// 가장 최근 코드 변경 사건 = 되돌림이면 되돌림 요청 시각, 아니면 승인(병합) 시각 — mod_dtm 은 실패 복구 같은 기록 갱신에도 바뀌어 기준으로 못 씀
const evAt = (x: Row) => Date.parse((x.fix_sts_cd.startsWith('RBK') ? x.rbk_dtm : x.apv_dtm) ?? '') || 0
const read = async (route: string) => {
  const r = await db()
    .from('mon_ai_fix')
    .select('fix_sts_cd, pr_no, dply_dtm, apv_dtm, mrg_cmt_txt, rbk_dtm, rbk_cmt_txt, rbk_dply_dtm')
    .eq('route_txt', route)
    .eq('del_yn', 'N')
    .in('fix_sts_cd', ['DPLY', 'DONE', 'DPLY_FAIL', 'RBK', 'RBK_DONE', 'RBK_FAIL'])
    .order('apv_dtm', { ascending: false })
    .limit(10) // ponytail: 경로당 최근 10건 안에서 고름 — 한 경로에 AI 수정이 10건 넘게 쌓이면 rbk_dtm 정렬 조회를 따로
  if (r.error) throw r.error
  const rows = (r.data ?? []) as Row[]
  return rows.reduce<Row | null>((a, x) => (!a || evAt(x) > evAt(a) ? x : a), null)
}

// 이 경로의 가장 최근 AI 수정 배포 — 배포 중이면 Vercel 상태를 한 번 확인해 확정(화면을 닫아 폴링이 끊긴 경우 '배포 중'에 고착되던 문제)
export async function lastDeploy(route: string): Promise<LastDeploy | null> {
  let row = await read(route)
  if (!row) return null
  // 배포 중(DPLY)·되돌림 배포 중(RBK)이면 Vercel 상태를 한 번 확인해 확정
  const pending = row.fix_sts_cd === 'DPLY' ? row.mrg_cmt_txt : row.fix_sts_cd === 'RBK' ? row.rbk_cmt_txt : null
  if (pending && process.env.GITHUB_TOKEN) {
    const { deployState } = await import('./mon-fix') // 동적 import = mon-fix → mon-ai → mon-verify 순환 회피
    if (await deployState(pending).catch(() => null)) row = (await read(route)) ?? row
  }
  const now = Date.now()
  const rbk = row.fix_sts_cd.startsWith('RBK') // 되돌림도 코드가 바뀌는 배포 — 같은 방식으로 재분석 차단·실시간 확인
  if (row.fix_sts_cd === 'DPLY_FAIL' || row.fix_sts_cd === 'RBK_FAIL') return { sts: 'FAIL', pr: row.pr_no, at: rbk ? row.rbk_dply_dtm : row.dply_dtm, cut: now, until: now, rbk }
  const deploying = row.fix_sts_cd === 'DPLY' || row.fix_sts_cd === 'RBK'
  const at = rbk ? row.rbk_dply_dtm : row.dply_dtm
  const cut = at ? Date.parse(minuteOf(Date.parse(at))) + 60_000 : now
  // 배포 중 차단 상한 = 승인(되돌림 요청) + 30분(상태 확인이 계속 실패해도 영구 차단 없음)
  const started = rbk ? row.rbk_dtm : row.apv_dtm
  const until = deploying ? Date.parse(started ?? new Date(now).toISOString()) + VERIFY_MS : (at ? Date.parse(at) : now) + VERIFY_MS
  return { sts: deploying ? 'DPLY' : 'DONE', pr: row.pr_no, at, cut, until, rbk }
}

// 배포 후 실측 — 배포 후 구간(cut~지금)과 바로 앞 같은 길이(배포 전 기준선)의 요청·오류·느림, 배포 후 느림·오류 상세(최신 20)
export async function verifyData(route: string) {
  const d = await lastDeploy(route)
  if (!d) return null
  const now = Date.now()
  const after = new Date(d.cut).toISOString()
  const before = new Date(d.cut - Math.max(now - d.cut, 10 * 60_000)).toISOString() // 기준선 = 배포 전 같은 길이(최소 10분)
  const [agg, evt] = await Promise.all([
    db().from('mon_app_hist').select('bkt_dtm, req_cnt, err_cnt, slow_cnt').eq('sys_cd', 'SCHEMA').eq('route_txt', route).gte('bkt_dtm', before).order('bkt_dtm'),
    db().from('mon_app_evt_hist').select('occr_dtm, evt_cd, sts_no, rsp_val, scr_txt').eq('sys_cd', 'SCHEMA').eq('route_txt', route).gte('occr_dtm', after).order('occr_dtm', { ascending: false }).limit(20),
  ])
  if (agg.error) throw agg.error
  if (evt.error) throw evt.error
  const sum = (rows: typeof agg.data) => rows.reduce((a, r) => ({ req: a.req + r.req_cnt, err: a.err + r.err_cnt, slow: a.slow + r.slow_cnt }), { req: 0, err: 0, slow: 0 })
  const post = sum(agg.data.filter((r) => Date.parse(r.bkt_dtm) >= d.cut))
  const pre = sum(agg.data.filter((r) => Date.parse(r.bkt_dtm) < d.cut - 60_000)) // 배포가 걸친 분 제외
  // 서버 응답 오류 = 상태 1 이상(상태 0 = 화면 이동·새로고침으로 끊긴 요청 — 재발 근거로 쓰지 않고 따로 표시)
  const realErr = evt.data.filter((e) => e.evt_cd === 'ERR' && e.sts_no !== 0).length
  const aborted = evt.data.filter((e) => e.evt_cd === 'ERR' && e.sts_no === 0).length
  const slowStill = post.slow > 0 && pre.req > 0 && post.req > 0 && post.slow / post.req >= pre.slow / pre.req // 느림 비율이 배포 전보다 줄지 않음
  // 판정 : 배포 중 / 배포 실패 / 오류 재발 / 확인 중(요청 부족) / 느림 그대로 / 해결 확인
  const verdict = d.sts === 'DPLY' ? 'DEPLOYING' : d.sts === 'FAIL' ? 'FAIL' : realErr > 0 ? 'RECUR' : post.req < VERIFY_MIN_REQ ? 'WAIT' : slowStill ? 'SLOW' : 'OK'
  return { deploy: d, now, post, pre, evts: evt.data, aborted, verdict, minReq: VERIFY_MIN_REQ }
}

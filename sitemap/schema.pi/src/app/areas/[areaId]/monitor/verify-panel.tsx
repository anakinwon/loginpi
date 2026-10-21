'use client'
// 배포 후 실시간 확인(2026-10-22, 마스터 지시 "배포 후에는 반영 결과를 반드시 바로 확인") — AI 재분석 대신 배포 이후 실측을 5초마다 표시
//  판정 : 배포 중 → 확인 중(배포 후 요청 부족) → 해결 확인(요청 N건 이상·오류 0) / 재발(배포 후 오류 1건 이상). 배포 전 같은 길이 기준선과 비교
//  수집 경로 = 브라우저 계측(약 15초 묶음 전송) — 이 API 를 쓰는 화면을 열어 요청을 만들면 15~20초 안에 반영
import { piFetch } from '@pi/auth/client'
import { useEffect, useState } from 'react'
import { pageMenu, routeMenu } from '@/lib/mon'

type Cnt = { req: number; err: number; slow: number }
type Data = {
  deploy: { sts: 'DPLY' | 'DONE' | 'FAIL'; pr: number | null; at: string | null; cut: number; until: number }
  now: number
  post: Cnt
  pre: Cnt
  evts: { occr_dtm: string; evt_cd: string; sts_no: number; rsp_val: number; scr_txt: string | null }[]
  aborted: number // 상태 0(화면 이동·새로고침으로 끊긴 요청) — 재발 근거 아님
  verdict: 'DEPLOYING' | 'FAIL' | 'WAIT' | 'OK' | 'SLOW' | 'RECUR'
  minReq: number
}
const VERDICT: Record<Data['verdict'], [string, string]> = {
  DEPLOYING: ['운영 배포 중', 'border-violet-400 bg-violet-50 text-violet-800'],
  FAIL: ['배포 실패 — 이전 배포 유지(재분석 가능)', 'border-red-400 bg-red-50 text-red-700'],
  SLOW: ['느림 그대로 — 배포 후 느림 비율이 줄지 않음', 'border-amber-400 bg-amber-50 text-amber-800'],
  WAIT: ['확인 중 — 배포 후 요청 부족', 'border-amber-400 bg-amber-50 text-amber-800'],
  OK: ['해결 확인 — 배포 후 오류 0', 'border-emerald-500 bg-emerald-50 text-emerald-800'],
  RECUR: ['재발 — 배포 후에도 서버 오류', 'border-red-400 bg-red-50 text-red-700'],
}
const POLL_MS = 5_000
const hm = (t: string | number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const rate = (c: Cnt) => (c.req ? `${((c.err / c.req) * 100).toFixed(1)}%` : '-')

export default function VerifyPanel({ route }: { route: string }) {
  const [d, setD] = useState<Data | null | undefined>(undefined) // null = 이 경로의 AI 수정 배포 기록 없음
  const [err, setErr] = useState('')
  const [at, setAt] = useState(0)
  useEffect(() => {
    let stop = false
    let tm: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        // 탭이 가려져 있으면 건너뜀(다음 예약만)
        if (document.visibilityState === 'visible') {
          const j = await (await piFetch(`/api/mon/app/verify?route=${encodeURIComponent(route)}`)).json()
          if (stop) return
          if (j.ok) {
            setD(j.data)
            setErr('')
            setAt(Date.now())
            if (!j.data) return // 배포 기록 없음 = 확인할 것 없음, 폴링 멈춤
          } else setErr(j.message ?? '불러오지 못했습니다')
        }
      } catch {
        if (!stop) setErr('불러오지 못했습니다(네트워크)')
      }
      if (!stop) tm = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stop = true
      clearTimeout(tm)
    }
  }, [route])

  if (err) return <p className="text-xs text-red-700">{err}</p>
  if (d === undefined) return <p className="text-xs text-[#5b6578]">배포 후 실측을 불러오는 중…</p>
  if (d === null) return <p className="text-xs text-[#5b6578]">이 경로의 AI 수정 배포 기록이 없습니다.</p>
  const v = VERDICT[d.verdict]
  const mins = Math.max(0, Math.floor((d.now - d.deploy.cut) / 60_000))
  return (
    <div className="rounded border border-[#d6deeb] bg-white p-2 text-xs" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[#2c3850]">배포 후 실시간 확인</b>
        <span className={`rounded border px-2 py-0.5 font-semibold ${v[1]}`}>{v[0]}</span>
        <span className="text-[#5b6578]">
          {routeMenu(route)} · <span className="font-mono">{route}</span>
          {d.deploy.pr != null && ` · PR #${d.deploy.pr}`}
          {d.deploy.at && ` · 배포 확인 ${hm(d.deploy.at)} · 경과 ${mins}분`}
          {d.deploy.until > d.now && ` · 재분석 가능 ${hm(d.deploy.until)} 이후`}
        </span>
        <span className="ml-auto text-[#8a93a5]">{at ? `${hm(at)} 갱신 · ${POLL_MS / 1000}초마다` : ''}</span>
      </div>
      {d.verdict !== 'DEPLOYING' && d.verdict !== 'FAIL' && (
        <table className="mt-1 border-collapse tabular-nums">
          <thead>
            <tr className="text-left text-[#5b6578]">
              {['', '요청', '오류', '오류율', '느림'].map((h) => (
                <th key={h} className="pr-4 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pr-4 font-semibold text-[#2c3850]">배포 후</td>
              <td className="pr-4">
                {d.post.req}
                {d.post.req < d.minReq && <span className="text-amber-700"> / 판정 {d.minReq}건 필요</span>}
              </td>
              <td className={`pr-4 ${d.post.err ? 'font-semibold text-red-700' : ''}`}>{d.post.err}</td>
              <td className="pr-4">{rate(d.post)}</td>
              <td className="pr-4">{d.post.slow}</td>
            </tr>
            <tr className="text-[#5b6578]">
              <td className="pr-4">배포 전(같은 길이)</td>
              <td className="pr-4">{d.pre.req}</td>
              <td className="pr-4">{d.pre.err}</td>
              <td className="pr-4">{rate(d.pre)}</td>
              <td className="pr-4">{d.pre.slow}</td>
            </tr>
          </tbody>
        </table>
      )}
      {d.aborted > 0 && <p className="mt-1 text-[#5b6578]">끊긴 요청(상태 0, 화면 이동·새로고침) {d.aborted}건 — 서버 오류가 아니라 판정에서 제외</p>}
      {d.evts.length > 0 && (
        <ul className="mt-1 text-red-700">
          {d.evts.slice(0, 5).map((e, i) => (
            <li key={i}>
              {hm(e.occr_dtm)} · {e.evt_cd === 'ERR' ? `오류 ${e.sts_no}` : '느림'} · {e.rsp_val}ms · {pageMenu(e.scr_txt)}
            </li>
          ))}
        </ul>
      )}
      {d.verdict === 'WAIT' && <p className="mt-1 text-[#5b6578]">이 API 를 쓰는 화면({routeMenu(route)})을 열어 요청을 만들면 15~20초 안에 반영됩니다(브라우저 계측 묶음 전송).</p>}
    </div>
  )
}

'use client'
// 모니터링 > AI 수정 이력(2026-10-22, 마스터 지시 "진행상태와 요청 주체, 결재 요청자, 승인자 등의 프로세스를 보고서 형태의 목록으로") — 전역 관리자
//  1행 = 'PR 로 해결' 1회(sql/072 mon_ai_fix) : 요청일시·메뉴/API·원인 → 해결·진행 단계(4단계)·요청 주체(AI 모델)·결재 요청자·승인자·PR·배포 결과
//  승인 대기 행은 여기서도 '승인'(분석 패널을 닫았거나 새로고침해도 결재 가능), LIVE 면 15초마다 다시 조회(배포 중 행은 서버가 Vercel 상태로 확정)
import { piFetch } from '@pi/auth/client'
import { GitPullRequest, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { routeMenu } from '@/lib/mon'
import type { FixSts } from '@/lib/mon-fix'
import { Pager, STS, StepBar } from './fix-steps'
import { usePoll } from './use-poll'

type Row = {
  fix_id: string
  route_txt: string
  caus_txt: string
  fix_txt: string
  file_txt: string | null
  mdl_nm: string
  mdl_dsp_nm: string
  fix_sts_cd: FixSts
  req_usr_nm: string | null
  req_dtm: string
  pr_no: number | null
  pr_url: string | null
  head_cmt_txt: string | null
  apv_usr_nm: string | null
  apv_dtm: string | null
  mrg_cmt_txt: string | null
  ahead_cnt: number | null
  dply_dtm: string | null
  err_txt: string | null
  rej_usr_nm: string | null
  rej_dtm: string | null
  rej_rsn_txt: string | null
  rbk_usr_nm: string | null
  rbk_dtm: string | null
  rbk_rsn_txt: string | null
  rbk_cmt_txt: string | null
  rbk_dply_dtm: string | null
}
// 상태 묶음 필터 — 진행 중 = 요청·승인·배포 처리 중, 실패 = 단계별 실패 3종
const GRP = [
  { k: '', nm: '전체' },
  { k: 'PR', nm: '승인 대기' },
  { k: 'REQ,APV,DPLY,RBK', nm: '진행 중' },
  { k: 'DONE', nm: '배포 완료' },
  { k: 'REQ_FAIL,APV_FAIL,DPLY_FAIL,RBK_FAIL', nm: '실패' },
  { k: 'REJ,RBK,RBK_DONE,RBK_FAIL', nm: '반려·되돌림' },
] as const
const dt = (t: string | null) => (t ? new Date(t).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '')
const who = (nm: string | null) => nm ?? <span className="text-red-700">[확인중 : 사용자 없음]</span>

export default function FixTab({ live }: { live: boolean }) {
  const [grp, setGrp] = useState('')
  const [pg, setPg] = useState(1)
  const [busy, setBusy] = useState('') // 승인 처리 중인 fix_id
  const [msg, setMsg] = useState('')
  const url = `/api/mon/app/fix?page=${pg}${grp ? `&sts=${grp}` : ''}`
  const { data, err, at, reload } = usePoll<{ rows: Row[]; total: number; size: number }>(url, live, 15_000)
  const rows = data?.rows ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  // 건수가 줄어 지금 페이지가 범위 밖이면 마지막 페이지로(서버는 빈 목록 + 건수를 돌려줌)
  useEffect(() => {
    if (data && pg > pages) setPg(pages)
  }, [data, pg, pages])

  const approve = async (r: Row) => {
    if (busy || !r.pr_no || !r.head_cmt_txt) return
    if (!confirm(`PR #${r.pr_no} '${r.fix_txt}' 을 승인합니다 — master 에 병합하고 바로 운영에 배포합니다(master 의 다른 미배포 커밋도 함께 나감). GitHub 에서 변경 내용을 확인하셨습니까?`)) return
    setBusy(r.fix_id)
    setMsg('')
    try {
      const j = await (await piFetch('/api/mon/app/fix/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: r.pr_no, head: r.head_cmt_txt }) })).json()
      setMsg(j.ok ? `PR #${r.pr_no} 승인 — 운영 배포 중(커밋 ${j.ahead}개)` : (j.message ?? '승인하지 못했습니다'))
    } catch {
      setMsg('승인하지 못했습니다(네트워크)')
    } finally {
      setBusy('')
      void reload()
    }
  }

  // 반려·되돌리기 공용 — 사유 필수(2자 이상), 결과 메시지 후 목록 다시 조회
  const act = async (r: Row, kind: 'reject' | 'rollback') => {
    if (busy) return
    const label = kind === 'reject' ? `PR #${r.pr_no} 반려 — PR 을 닫고 병합하지 않습니다(운영 코드는 수정 전 그대로)` : `PR #${r.pr_no} 되돌리기 — 이 AI 수정을 수정 전 코드로 되돌리는 커밋을 master 에 만들고 바로 운영에 배포합니다`
    const reason = prompt(`${label}\n\n사유를 입력하십시오(2자 이상)`)?.trim()
    if (!reason) return
    if (reason.length < 2) return setMsg('사유를 2자 이상 입력하십시오')
    setBusy(r.fix_id)
    setMsg('')
    try {
      const body = kind === 'reject' ? { number: r.pr_no, reason } : { fix_id: r.fix_id, reason }
      const j = await (await piFetch(`/api/mon/app/fix/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
      setMsg(j.ok ? (kind === 'reject' ? `PR #${r.pr_no} 반려 — PR 을 닫았습니다(수정 전 코드 유지)` : `PR #${r.pr_no} 되돌림 — 수정 전 코드로 운영 배포 중(커밋 ${j.ahead}개)`) : (j.message ?? '처리하지 못했습니다'))
    } catch {
      setMsg('처리하지 못했습니다(네트워크)')
    } finally {
      setBusy('')
      void reload()
    }
  }

  return (
    <section className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-[#2c3850]">AI 수정 이력</h2>
        <span className="text-xs text-[#5b6578]">
          {data ? `${data.total}건` : ''} · 'PR 로 해결' 요청부터 운영 배포까지{at && ` · ${at.toLocaleTimeString('ko-KR', { hour12: false })} 기준`}
        </span>
        <span className="ml-auto flex flex-wrap gap-1 text-xs" role="group" aria-label="상태 필터">
          {GRP.map((g) => (
            <button
              key={g.k}
              type="button"
              aria-pressed={grp === g.k}
              onClick={() => {
                setGrp(g.k)
                setPg(1)
              }}
              className={`rounded border px-2 py-0.5 ${grp === g.k ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : 'border-[#d6deeb] bg-white text-[#2c3850]'}`}
            >
              {g.nm}
            </button>
          ))}
          <button type="button" onClick={() => void reload()} aria-label="다시 조회" className="rounded border border-[#d6deeb] bg-white px-1.5 py-0.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </div>
      <p className="mt-1 text-xs text-[#5b6578]">요청 주체 = 수정안을 만든 AI 모델 · 결재 요청자 = 'PR 로 해결'을 누른 사람 · 결재 = 승인(병합·운영 배포) 또는 반려(PR 닫기 — 수정 전 유지) · 배포된 수정은 '되돌리기'로 수정 전 코드로 다시 배포</p>
      {err && <p className="mt-2 text-red-700">{err}</p>}
      {msg && (
        <p role="status" className="mt-2 text-[#2c3850]">
          {msg}
        </p>
      )}
      <div className="mt-2 overflow-x-auto rounded border border-[#d6deeb]">
        <table className="w-full min-w-[1100px] border-collapse text-xs">
          <thead>
            <tr className="bg-[#1f3a68] text-left whitespace-nowrap text-white">
              {['No', '요청일시', '메뉴 · API', '원인 → 해결', '진행 단계', '요청 주체(AI)', '결재 요청자', '결재(승인·반려)', 'PR', '배포 · 되돌리기'].map((h) => (
                <th key={h} className="px-2 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <tr>
                <td colSpan={10} className="px-2 py-4 text-center text-[#5b6578]">
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-2 py-4 text-center text-[#5b6578]">
                  기록이 없습니다 — 애플리케이션 탭의 AI 원인 분석에서 'PR 로 해결'을 누르면 여기에 남습니다
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.fix_id} className="border-t border-[#e2e7ef] align-top">
                  <td className="px-2 py-1.5 tabular-nums text-[#5b6578]">{data.total - (pg - 1) * data.size - i}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{dt(r.req_dtm)}</td>
                  <td className="px-2 py-1.5">
                    <div className="font-semibold text-[#2c3850]">{routeMenu(r.route_txt)}</div>
                    <div className="font-mono text-[11px] text-[#5b6578]">{r.route_txt}</div>
                  </td>
                  <td className="max-w-[280px] px-2 py-1.5">
                    <div className="text-[#2c3850]">{r.caus_txt}</div>
                    <div className="text-emerald-800">→ {r.fix_txt}</div>
                    {r.file_txt && <div className="font-mono text-[11px] text-[#5b6578]">{r.file_txt}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="mb-1 font-semibold text-[#2c3850]">{STS[r.fix_sts_cd].nm}</div>
                    <StepBar st={STS[r.fix_sts_cd].st} small />
                    {r.err_txt && <div className="mt-1 max-w-[360px] text-red-700">{r.err_txt}</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{r.mdl_dsp_nm}</div>
                    <div className="font-mono text-[11px] text-[#5b6578]">{r.mdl_nm}</div>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{who(r.req_usr_nm)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {(r.fix_sts_cd === 'PR' || r.fix_sts_cd === 'APV_FAIL') && r.head_cmt_txt ? (
                      <>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void approve(r)}
                          className="rounded border border-violet-600 bg-violet-700 px-2 py-0.5 font-semibold text-white disabled:opacity-60"
                        >
                          {busy === r.fix_id ? '처리 중…' : r.fix_sts_cd === 'APV_FAIL' ? '다시 승인' : '승인(병합·운영 배포)'}
                        </button>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void act(r, 'reject')}
                          className="ml-1 rounded border border-red-500 bg-white px-2 py-0.5 font-semibold text-red-700 disabled:opacity-60"
                        >
                          반려
                        </button>
                        {r.apv_dtm && (
                          <div className="mt-0.5 text-[11px] text-[#5b6578]">
                            직전 시도 {who(r.apv_usr_nm)} · {dt(r.apv_dtm)}
                          </div>
                        )}
                      </>
                    ) : r.rej_dtm ? (
                      <div className="text-red-700">
                        <div>
                          반려 {who(r.rej_usr_nm)} · <span className="tabular-nums">{dt(r.rej_dtm)}</span>
                        </div>
                        <div className="max-w-[220px] whitespace-normal text-[11px]">사유 : {r.rej_rsn_txt}</div>
                      </div>
                    ) : r.apv_dtm ? (
                      <>
                        <div>승인 {who(r.apv_usr_nm)}</div>
                        <div className="tabular-nums text-[11px] text-[#5b6578]">{dt(r.apv_dtm)}</div>
                      </>
                    ) : (
                      <span className="text-[#8a93a5]">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.pr_url ? (
                      <a href={r.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-800 underline">
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden />#{r.pr_no}
                      </a>
                    ) : (
                      <span className="text-[#8a93a5]">-</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {r.fix_sts_cd === 'DONE' ? (
                      <span className="text-emerald-700">완료 {dt(r.dply_dtm)}</span>
                    ) : r.fix_sts_cd === 'DPLY_FAIL' ? (
                      <span className="text-red-700">실패 {dt(r.dply_dtm)}</span>
                    ) : r.fix_sts_cd === 'DPLY' ? (
                      <span className="text-violet-800">배포 중</span>
                    ) : (
                      <span className="text-[#8a93a5]">-</span>
                    )}
                    {r.ahead_cnt != null && <div className="text-[11px] text-[#5b6578]">함께 나간 커밋 {r.ahead_cnt}개</div>}
                    {r.rbk_dtm && r.fix_sts_cd.startsWith('RBK') && (
                      <div className={`mt-0.5 whitespace-normal text-[11px] ${r.fix_sts_cd === 'RBK_DONE' ? 'text-emerald-700' : r.fix_sts_cd === 'RBK_FAIL' ? 'text-red-700' : 'text-violet-800'}`}>
                        되돌림 {r.fix_sts_cd === 'RBK_DONE' ? `완료 ${dt(r.rbk_dply_dtm)}` : r.fix_sts_cd === 'RBK_FAIL' ? '실패' : '배포 중'} · {who(r.rbk_usr_nm)} {dt(r.rbk_dtm)}
                        <div className="max-w-[220px]">사유 : {r.rbk_rsn_txt}</div>
                      </div>
                    )}
                    {(r.fix_sts_cd === 'DONE' || r.fix_sts_cd === 'DPLY_FAIL' || (r.fix_sts_cd === 'RBK_FAIL' && !r.rbk_cmt_txt)) && r.mrg_cmt_txt && (
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => void act(r, 'rollback')}
                        className="mt-1 block rounded border border-amber-600 bg-white px-2 py-0.5 font-semibold text-amber-800 disabled:opacity-60"
                      >
                        {busy === r.fix_id ? '되돌리는 중…' : r.fix_sts_cd === 'RBK_FAIL' ? '다시 되돌리기' : '되돌리기(수정 전으로)'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager cur={pg} pages={pages} onPage={setPg} label="AI 수정 이력 페이지" />
    </section>
  )
}

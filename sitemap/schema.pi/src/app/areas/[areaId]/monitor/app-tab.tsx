'use client'
// 애플리케이션 모니터링 탭 — schema.pi API(브라우저 계측, 분 × 경로) : TPS·평균 응답·오류율·느림, 분 단위 분포, 경로 TOP(전역 관리자만)
// 경로 TOP 은 요청 수·느림·오류 기준 정렬(타일 클릭으로도 전환), 메뉴 열(routeMenu)을 경로 왼쪽에 별도 표시
// 느린·오류 요청 상세(sql/069) : 어느 화면(pageMenu)·어떤 API·상태코드인지 개별 행 — 타일(느림·오류)·분포 막대(분)·화면별 TOP 으로 필터, 20행 페이지
// AI 원인 분석 : 경로 TOP 의 느림·오류 경로 → 설정에 등록한 AI 모델(기본 또는 패널에서 고른 모델)이 원인·해결 방안 제시(화면 표시만, 저장·자동 수정 없음)
//  결과에 사용 모델·요금제·계정·소요·토큰을 함께 표시(자료 신뢰성, 2026-10-21 마스터 지시)
//  해결 방안마다 'PR 로 해결'(2026-10-22 마스터 지시) : 같은 모델이 그 파일을 고쳐 GitHub PR 생성(/api/mon/app/fix) — 병합 전 운영 반영 없음
//  PR 을 검토한 뒤 '승인' = master 병합 + 운영 배포(/api/mon/app/fix/approve), 배포 상태를 15초마다 확인해 표시
import { piFetch } from '@pi/auth/client'
import { GitPullRequest, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AiMdl, AiResult, AiRun } from '@/lib/mon-ai'
import { pageMenu, routeMenu, SLOW_MS } from '@/lib/mon'
import { fmtN, Line, Stack, Tile, type Pt } from './charts'
import { usePoll } from './use-poll'

type Key = 'req' | 'slow' | 'err'
const KEY_NM: Record<Key, string> = { req: '요청 수', slow: '느림', err: '오류' }
const SLOW_TXT = `응답 ${SLOW_MS / 1000}초 이상`

type Evt = { occr_dtm: string; evt_cd: 'SLOW' | 'ERR'; scr_txt: string | null; route_txt: string; sts_no: number; rsp_val: number }
type Filter = { cd?: 'SLOW' | 'ERR'; t?: string; scr?: string } // t = 분(막대 bkt_dtm), scr = 화면 메뉴명
const PAGE = 20
// 상태코드 뜻(Resource Timing 은 응답 본문을 주지 않으므로 상태코드 기준)
const STS: Record<number, string> = { 0: '네트워크 실패', 400: '잘못된 요청', 401: '로그인 필요', 403: '권한 없음', 404: '없음', 409: '충돌', 413: '너무 큼', 429: '요청 과다', 500: '서버 오류', 502: '게이트웨이 오류', 503: '일시 불가', 504: '게이트웨이 시간 초과' }
const stsNm = (n: number) => STS[n] ?? (n >= 500 ? '서버 오류' : n >= 400 ? '요청 오류' : '정상 응답(느림)')
const minOf = (t: string) => Math.floor(Date.parse(t) / 60000) * 60000
const fmtS = (t: string) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

type Ai = { route: string; busy: boolean; res?: AiRun; err?: string }
// PR 상태 — 만든 뒤 '승인' = master 병합 + 운영 배포(sha), dep = Vercel 운영 배포 상태(pending·success·failure)
type Pr = { busy?: boolean; url?: string; number?: number; head?: string; err?: string; apv?: boolean; sha?: string; ahead?: number; dep?: string | null }
// 진행 단계(마스터 지시 2026-10-22) : PR 요청 → 커밋·PR 완료 → 승인·병합 → 운영 배포. 상태 = 끝남(done)·진행 중(on)·실패(bad)·대기
const STEPS = ['수정안 요청', '커밋·PR 완료', '승인·병합', '운영 배포'] as const
function stepOf(x: Pr): { at: number; on: boolean; bad: boolean } {
  if (x.dep === 'success') return { at: 4, on: false, bad: false }
  if (x.dep === 'failure' || x.dep === 'error') return { at: 3, on: false, bad: true }
  if (x.sha) return { at: 3, on: true, bad: false }
  if (x.apv) return { at: 2, on: true, bad: false }
  if (x.url) return { at: 2, on: false, bad: !!x.err }
  return { at: 0, on: !!x.busy, bad: !!x.err }
}
function Steps({ x }: { x: Pr }) {
  const st = stepOf(x)
  return (
    <ol className="mt-1 flex flex-wrap items-center gap-1 text-xs" aria-label="진행 상태">
      {STEPS.map((nm, k) => {
        const cls = k < st.at ? 'border-emerald-500 bg-emerald-600 text-white' : k === st.at && st.bad ? 'border-red-400 bg-red-50 text-red-700' : k === st.at && st.on ? 'animate-pulse border-violet-500 bg-violet-50 text-violet-800' : 'border-[#d6deeb] bg-white text-[#8a93a5]'
        const tail = k < st.at ? ' ✓' : k === st.at && st.bad ? ' ✕' : k === st.at && st.on ? ' 진행 중' : ''
        return (
          <li key={nm} className="flex items-center gap-1">
            {k > 0 && <span className="text-[#b3bccb]">→</span>}
            <span aria-current={k === st.at ? 'step' : undefined} className={`rounded-full border px-2 py-0.5 ${cls}`}>
              {k + 1}. {nm}
              {tail}
            </span>
          </li>
        )
      })}
      {x.dep === 'success' && <li className="ml-1 text-emerald-700">운영 반영 완료</li>}
      {st.bad && x.sha && <li className="ml-1 text-red-700">운영 빌드 실패 — 이전 배포가 계속 서비스됨</li>}
    </ol>
  )
}
type MdlOpt = Pick<AiMdl, 'dsp_nm' | 'plan_nm'> & { mdl_id: string; dflt_yn: 'Y' | 'N' }
const LIKE: Record<AiResult['confidence'], [string, string]> = { HIGH: ['높음', 'bg-red-100 text-red-700'], MID: ['중간', 'bg-amber-100 text-amber-800'], LOW: ['낮음', 'bg-gray-100 text-gray-600'] }

// AI 원인 분석 결과 패널 — 원인 > 해결 방안 묶음(가능성 순)을 하나씩 접고 펼침, 마지막에 조치 후 확인. 머리글 '숨기기'로 본문 전체 접기
function AiPanel({ ai, mdls, mdlId, onMdl, onClose, onRetry }: { ai: Ai; mdls: MdlOpt[]; mdlId: string; onMdl: (id: string) => void; onClose: () => void; onRetry: () => void }) {
  const [open, setOpen] = useState(true)
  const r = ai.res?.ai
  const run = ai.res
  // 해결 방안별 PR 상태(키 = 원인-해결 순번), 다시 분석하면 초기화. 같은 해결 방안은 PR 1개만(만든 뒤 버튼 = 링크)
  const [prs, setPrs] = useState<Record<string, Pr>>({})
  useEffect(() => setPrs({}), [run])
  const makePr = async (k: string, c: AiResult['causes'][number], x: AiResult['causes'][number]['fixes'][number]) => {
    if (prs[k]?.busy || prs[k]?.url) return
    if (!confirm(`'${x.title}' 수정안을 AI 가 만들어 GitHub PR 로 올립니다(병합 전에는 운영에 반영되지 않음)`)) return
    setPrs((p) => ({ ...p, [k]: { busy: true } }))
    const mdl = run?.mdl.mdl_id
    try {
      const body = { route: ai.route, cause: { title: c.title, evidence: c.evidence }, fix: x, ...(mdl ? { mdl_id: mdl } : {}) }
      const j = await (await piFetch('/api/mon/app/fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
      setPrs((p) => ({ ...p, [k]: j.ok ? { url: j.url, number: j.number, head: j.head } : { err: j.message ?? 'PR 을 만들지 못했습니다' } }))
    } catch {
      setPrs((p) => ({ ...p, [k]: { err: 'PR 을 만들지 못했습니다(네트워크)' } }))
    }
  }
  const approve = async (k: string) => {
    const cur = prs[k]
    if (!cur?.number || !cur.head || cur.apv || cur.sha) return
    if (!confirm(`PR #${cur.number} 을 승인합니다 — master 에 병합하고 바로 운영에 배포합니다(master 의 다른 미배포 커밋도 함께 나감). GitHub 에서 변경 내용을 확인하셨습니까?`)) return
    setPrs((p) => ({ ...p, [k]: { ...cur, apv: true, err: undefined } }))
    try {
      const j = await (await piFetch('/api/mon/app/fix/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: cur.number, head: cur.head }) })).json()
      setPrs((p) => ({ ...p, [k]: j.ok ? { ...cur, sha: j.sha, ahead: j.ahead, dep: 'pending' } : { ...cur, err: j.message ?? '승인하지 못했습니다' } }))
    } catch {
      setPrs((p) => ({ ...p, [k]: { ...cur, err: '승인하지 못했습니다(네트워크)' } }))
    }
  }
  // 운영 배포 상태 확인 — 진행 중인 것만 15초마다, 최대 10분(Vercel 빌드 1~3분)
  const pending = Object.entries(prs).filter(([, x]) => x.sha && (x.dep === 'pending' || x.dep === null))
  useEffect(() => {
    if (!pending.length) return
    let n = 0
    const id = setInterval(async () => {
      if (++n > 40) return clearInterval(id)
      for (const [k, x] of pending) {
        const j = await (await piFetch(`/api/mon/app/fix/approve?sha=${x.sha}`)).json().catch(() => null)
        if (j?.ok && j.state && j.state !== 'pending') setPrs((p) => ({ ...p, [k]: { ...p[k], dep: j.state } }))
      }
    }, 15_000)
    return () => clearInterval(id)
  }, [pending.map(([k]) => k).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-2 rounded-lg border border-violet-300 bg-violet-50/40 p-3 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-700" aria-hidden />
        <b className="text-[#2c3850]">AI 원인 분석</b>
        <span className="text-xs text-[#5b6578]">
          {routeMenu(ai.route)} · <span className="font-mono">{ai.route}</span>
        </span>
        {r && <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${LIKE[r.confidence][1]}`}>신뢰도 {LIKE[r.confidence][0]}</span>}
        <span className="ml-auto flex gap-1 text-xs">
          {mdls.length > 1 && (
            <select aria-label="분석 모델" value={mdlId} disabled={ai.busy} onChange={(e) => onMdl(e.target.value)} className="rounded border border-[#d6deeb] bg-white px-1 py-0.5">
              {mdls.map((m) => (
                <option key={m.mdl_id} value={m.mdl_id}>
                  {m.dsp_nm}
                  {m.dflt_yn === 'Y' ? ' (기본)' : ''}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded border border-[#d6deeb] bg-white px-2 py-0.5">
            {open ? '숨기기' : '보이기'}
          </button>
          <button
            type="button"
            disabled={ai.busy}
            onClick={() => {
              setOpen(true)
              onRetry()
            }}
            className="rounded border border-[#d6deeb] bg-white px-2 py-0.5 disabled:opacity-40">
            다시 분석
          </button>
          <button type="button" onClick={onClose} className="rounded border border-[#d6deeb] bg-white px-2 py-0.5">
            닫기
          </button>
        </span>
      </div>
      {run && (
        <p className="mt-1 text-xs text-[#5b6578]">
          분석 모델 <b className="text-[#2c3850]">{run.mdl.dsp_nm}</b> (<span className="font-mono">{run.mdl.mdl_nm}</span>) · 요금제{' '}
          {run.mdl.plan_nm && run.mdl.plan_nm !== '미등록' ? run.mdl.plan_nm : <span className="text-red-700">[미등록]</span>}
          {run.mdl.acct_nm && ` · 계정 ${run.mdl.acct_nm}`} · {(run.ms / 1000).toFixed(1)}초 · 토큰 입력 {fmtN(run.tok.in)} / 출력 {fmtN(run.tok.out)}
        </p>
      )}
      {open && (
        <div className="mt-2 space-y-2">
          {ai.busy && <p className="text-[#5b6578]">수치·개별 이력·소스 코드를 모아 분석하는 중입니다(최대 1~2분)…</p>}
          {ai.err && <p className="text-red-700">{ai.err}</p>}
          {r && (
            <>
              <p className="text-[#2c3850]">{r.summary}</p>
              {r.causes.map((c, i) => (
                <details key={i} open={i === 0} className="rounded border border-[#e2e7ef] bg-white">
                  <summary className="cursor-pointer px-2 py-1.5">
                    <span className="mr-2 text-xs text-[#5b6578]">원인 {i + 1}</span>
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${LIKE[c.likelihood][1]}`}>{LIKE[c.likelihood][0]}</span>
                    <b className="text-[#2c3850]">{c.title}</b>
                  </summary>
                  <div className="space-y-1 border-t border-[#e2e7ef] px-2 py-1.5">
                    <p className="text-xs text-[#5b6578]">{c.evidence}</p>
                    {c.fixes.map((x, j) => (
                      <div key={j} className="rounded bg-emerald-50 px-2 py-1">
                        <div className="text-[#2c3850]">
                          <span className="mr-1 text-xs font-semibold text-emerald-700">해결 ▸</span>
                          <b>{x.title}</b>
                        </div>
                        <p className="text-xs text-[#2c3850]">{x.detail}</p>
                        {x.files.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-xs text-[#5b6578]">{x.files.join(' · ')}</p>
                            {prs[`${i}-${j}`]?.url ? (
                              <span className="ml-auto flex flex-wrap items-center gap-1">
                                <a href={prs[`${i}-${j}`].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-emerald-400 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                  <GitPullRequest className="h-3.5 w-3.5" aria-hidden />
                                  PR #{prs[`${i}-${j}`].number} 열기
                                </a>
                                {prs[`${i}-${j}`].sha ? (
                                  <span className="text-xs text-[#5b6578]">운영에 나간 커밋 {prs[`${i}-${j}`].ahead}개</span>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={prs[`${i}-${j}`].apv}
                                    onClick={() => void approve(`${i}-${j}`)}
                                    className="rounded border border-violet-600 bg-violet-700 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-60">
                                    {prs[`${i}-${j}`].apv ? '승인 처리 중…' : '승인(병합·운영 배포)'}
                                  </button>
                                )}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={prs[`${i}-${j}`]?.busy}
                                onClick={() => void makePr(`${i}-${j}`, c, x)}
                                className="ml-auto inline-flex items-center gap-1 rounded border border-emerald-500 bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-60">
                                <GitPullRequest className="h-3.5 w-3.5" aria-hidden />
                                {prs[`${i}-${j}`]?.busy ? '수정안 만드는 중…(최대 2~3분)' : 'PR 로 해결'}
                              </button>
                            )}
                          </div>
                        )}
                        {prs[`${i}-${j}`] && <Steps x={prs[`${i}-${j}`]} />}
                        {prs[`${i}-${j}`]?.err && <p className="text-xs text-red-700">{prs[`${i}-${j}`].err}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              {r.checks.length > 0 && (
                <details className="rounded border border-[#e2e7ef] bg-white">
                  <summary className="cursor-pointer px-2 py-1.5 text-xs font-bold text-[#2c3850]">조치 후 확인 ({r.checks.length})</summary>
                  <ul className="list-disc border-t border-[#e2e7ef] py-1.5 pl-7 pr-2 text-xs text-[#2c3850]">
                    {r.checks.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </details>
              )}
              {r.gaps.length > 0 && <p className="text-xs text-[#5b6578]">부족한 데이터 : {r.gaps.join(' / ')}</p>}
              <p className="text-xs text-[#5b6578]">AI 추정입니다 — 'PR 로 해결'은 GitHub PR 만 만들고 운영 코드는 바꾸지 않습니다. PR 의 변경 내용과 미리보기를 확인한 뒤 '승인'을 누르면 병합·운영 배포됩니다.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

type Row = { bkt_dtm: string; route_txt: string; req_cnt: number; err_cnt: number; slow_cnt: number; rsp_sum_val: number | string; rsp_max_val: number }

export default function AppTab({ live, min }: { live: boolean; min: number }) {
  const [key, setKey] = useState<Key>('req')
  const [f, setF] = useState<Filter>({})
  const [pg, setPg] = useState(1)
  const [ai, setAi] = useState<Ai | null>(null)
  // 설정 > AI 분석 모델 목록(기본 먼저) — 패널에서 다른 모델로 다시 분석, 실패·미적용이면 빈 목록(서버가 기본 모델 사용)
  const [mdls, setMdls] = useState<MdlOpt[]>([])
  const [mdlId, setMdlId] = useState('')
  useEffect(() => {
    piFetch('/api/mon/ai-mdl')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return
        setMdls(j.items)
        setMdlId(j.items[0]?.mdl_id ?? '')
      })
      .catch(() => {})
  }, [])
  const analyze = async (route: string, id = mdlId) => {
    if (ai?.busy) return
    setAi({ route, busy: true })
    try {
      const j = await (await piFetch('/api/mon/app/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route, min, ...(id ? { mdl_id: id } : {}) }) })).json()
      setAi(j.ok ? { route, busy: false, res: { ai: j.ai, mdl: j.mdl, ms: j.ms, tok: j.tok } } : { route, busy: false, err: j.message ?? 'AI 원인 분석에 실패했습니다' })
    } catch {
      setAi({ route, busy: false, err: 'AI 원인 분석에 실패했습니다(네트워크)' })
    }
  }
  const pick = (x: Filter) => {
    setF(x)
    setPg(1)
  }
  // 타일 = 경로 표 정렬 + 상세 필터 동시 전환(다시 누르면 둘 다 해제) — 선택 상태는 상세 필터 기준
  const tile = (k: 'slow' | 'err') => {
    const cd = k === 'slow' ? 'SLOW' : 'ERR'
    const on = f.cd !== cd
    setKey(on ? k : 'req')
    pick({ ...f, cd: on ? cd : undefined })
  }
  const { data, err } = usePoll<{ rows: Row[]; evts?: Evt[] }>(`/api/mon/app?min=${min}`, live)
  const v = useMemo(() => {
    const rows = data?.rows ?? []
    const by = new Map<string, { req: number; err: number; slow: number; sum: number }>()
    const rt = new Map<string, { req: number; err: number; slow: number; sum: number; max: number }>()
    for (const r of rows) {
      const s = Number(r.rsp_sum_val)
      const b = by.get(r.bkt_dtm) ?? { req: 0, err: 0, slow: 0, sum: 0 }
      by.set(r.bkt_dtm, { req: b.req + r.req_cnt, err: b.err + r.err_cnt, slow: b.slow + r.slow_cnt, sum: b.sum + s })
      const x = rt.get(r.route_txt) ?? { req: 0, err: 0, slow: 0, sum: 0, max: 0 }
      rt.set(r.route_txt, { req: x.req + r.req_cnt, err: x.err + r.err_cnt, slow: x.slow + r.slow_cnt, sum: x.sum + s, max: Math.max(x.max, r.rsp_max_val) })
    }
    const ts = [...by.keys()].sort()
    const tot = [...by.values()].reduce((a, b) => ({ req: a.req + b.req, err: a.err + b.err, slow: a.slow + b.slow, sum: a.sum + b.sum }), { req: 0, err: 0, slow: 0, sum: 0 })
    const last5 = ts.slice(-5).reduce((n, t) => n + by.get(t)!.req, 0)
    return {
      tot,
      tps: Math.round((last5 / Math.max(1, Math.min(5, ts.length) * 60)) * 100) / 100,
      tpsPts: ts.map((t) => ({ t, v: Math.round((by.get(t)!.req / 60) * 100) / 100 })) as Pt[],
      rspPts: ts.map((t) => ({ t, v: Math.round(by.get(t)!.sum / Math.max(1, by.get(t)!.req)) })) as Pt[],
      errPts: ts.map((t) => ({ t, v: by.get(t)!.err })) as Pt[],
      bars: ts.map((t) => {
        const b = by.get(t)!
        return { t, ok: Math.max(0, b.req - b.slow - b.err), slow: b.slow, err: b.err }
      }),
      rt,
    }
  }, [data])
  // 느림·오류 기준이면 0건 경로는 빼서 문제 경로만 보이게
  const top = [...v.rt.entries()].filter(([, x]) => key === 'req' || x[key] > 0).sort((a, b) => b[1][key] - a[1][key] || b[1].req - a[1].req).slice(0, 10)

  const evts = data?.evts ?? []
  const base = evts.filter((e) => (!f.cd || e.evt_cd === f.cd) && (!f.t || minOf(e.occr_dtm) === minOf(f.t)))
  const scrTop = [
    ...base.reduce((m, e) => {
      const k = pageMenu(e.scr_txt)
      const x = m.get(k) ?? { slow: 0, err: 0 }
      x[e.evt_cd === 'ERR' ? 'err' : 'slow']++
      return m.set(k, x)
    }, new Map<string, { slow: number; err: number }>()),
  ]
    .sort((a, b) => b[1].slow + b[1].err - (a[1].slow + a[1].err))
    .slice(0, 8)
  const list = f.scr ? base.filter((e) => pageMenu(e.scr_txt) === f.scr) : base
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(pg, pages)
  const fTxt = [f.cd && (f.cd === 'SLOW' ? '느림' : '오류'), f.t && `${fmtS(f.t).slice(0, 5)} 분`, f.scr && `화면 ${f.scr}`].filter(Boolean).join(' · ')

  if (err) return <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{err}</p>
  const errPct = v.tot.req ? Math.round((v.tot.err / v.tot.req) * 1000) / 10 : 0
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#5b6578]">schema.pi 화면이 부른 API 응답을 브라우저가 재서 모은 값입니다(로그인 사용자, 1분 단위). 서버 내부 구간(SQL·외부 호출) 분해는 없습니다.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile nm="TPS(최근 5분)" val={fmtN(v.tps, 2)} sub="초당 요청" />
        <Tile nm="요청 수" val={v.tot.req.toLocaleString()} sub={`최근 ${min}분`} />
        <Tile nm="평균 응답" val={`${v.tot.req ? Math.round(v.tot.sum / v.tot.req) : 0}ms`} />
        <Tile nm="오류율" val={`${errPct}%`} sub={`${v.tot.err}건(4xx·5xx·실패)`} warn={errPct >= 5} on={f.cd === 'ERR'} onClick={() => tile('err')} title="누르면 경로 표를 오류 많은 순으로 정렬 + 아래 상세를 오류만" />
        <Tile nm="느린 요청" val={v.tot.slow.toLocaleString()} sub={SLOW_TXT} warn={v.tot.slow > 0} on={f.cd === 'SLOW'} onClick={() => tile('slow')} title={`누르면 경로 표를 느린 요청(${SLOW_TXT}) 많은 순으로 정렬 + 아래 상세를 느림만`} />
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Stack title="요청 분포(분) — 막대를 누르면 그 분의 상세" bars={v.bars} sel={f.t ?? null} onPick={(t) => pick({ ...f, t: f.t === t ? undefined : t })} />
        <Line title="TPS" pts={v.tpsPts} unit="/s" />
        <Line title="평균 응답시간" pts={v.rspPts} unit="ms" color="#0891b2" />
        <Line title="오류 수" pts={v.errPts} color="#dc2626" />
      </div>
      <section>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#2c3850]">경로 TOP 10({KEY_NM[key]})</h3>
          <span className="ml-auto flex gap-1 text-xs" role="group" aria-label="정렬 기준">
            {(Object.keys(KEY_NM) as Key[]).map((k) => (
              <button key={k} type="button" onClick={() => setKey(k)} aria-pressed={key === k} className={`rounded border px-2 py-0.5 ${key === k ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : 'border-[#d6deeb] bg-white text-[#2c3850]'}`}>
                {KEY_NM[k]}
              </button>
            ))}
          </span>
        </div>
        {key === 'slow' && <p className="mb-1 text-xs text-[#5b6578]">느림 = {SLOW_TXT} 걸린 요청(브라우저가 잰 응답 시간)</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[50rem] text-sm">
            <thead className="thead-3d">
              <tr>
                <th className="px-2 py-1 text-left">메뉴</th>
                <th className="px-2 py-1 text-left">경로</th>
                <th className="px-2 py-1">요청</th>
                <th className="px-2 py-1">평균(ms)</th>
                <th className="px-2 py-1">최대(ms)</th>
                <th className="px-2 py-1" title={SLOW_TXT}>느림</th>
                <th className="px-2 py-1">오류</th>
                <th className="px-2 py-1">AI 분석</th>
              </tr>
            </thead>
            <tbody>
              {top.map(([r, x]) => (
                <tr key={r} className="border-b">
                  <td className="whitespace-nowrap px-2 py-1 font-semibold text-[#2c3850]">{routeMenu(r)}</td>
                  <td className="px-2 py-1 font-mono text-xs text-[#5b6578]">{r}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{x.req.toLocaleString()}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{Math.round(x.sum / Math.max(1, x.req))}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{x.max}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${x.slow ? 'text-amber-700' : ''}`}>{x.slow}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${x.err ? 'text-red-700' : ''}`}>{x.err}</td>
                  <td className="px-2 py-1 text-center">
                    {(x.err > 0 || x.slow > 0) && (
                      <button
                        type="button"
                        disabled={ai?.busy}
                        onClick={() => void analyze(r)}
                        title="이 경로의 오류·느림 원인과 해결 방안을 AI 로 분석(화면 표시만)"
                        className="inline-flex items-center gap-1 rounded border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs text-violet-800 hover:border-violet-500 disabled:opacity-40"
                      >
                        <Sparkles className="h-3 w-3" aria-hidden /> {ai?.busy && ai.route === r ? '분석 중…' : '원인 분석'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!top.length && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-gray-500">
                    {!data ? '불러오는 중…' : v.rt.size ? `${KEY_NM[key]} 건이 있는 경로가 없습니다` : '아직 수집된 요청이 없습니다 — 화면을 사용하면 1분 안에 쌓입니다'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ai && <AiPanel ai={ai} mdls={mdls} mdlId={mdlId} onMdl={setMdlId} onClose={() => setAi(null)} onRetry={() => void analyze(ai.route)} />}
      </section>
      <section>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#2c3850]">느린·오류 요청 상세</h3>
          <span className="text-xs text-[#5b6578]">
            {list.length.toLocaleString()}건{evts.length >= 500 ? '(최신 500건 중)' : ''}
          </span>
          {fTxt && (
            <span className="ml-auto flex items-center gap-1 text-xs">
              <span className="rounded bg-[#e9eff9] px-2 py-0.5 text-[#1f3a68]">필터 : {fTxt}</span>
              <button
                type="button"
                onClick={() => {
                  setKey('req')
                  pick({})
                }}
                className="rounded border border-[#d6deeb] bg-white px-2 py-0.5 text-[#2c3850] hover:border-[#1f3a68]"
              >
                필터 해제
              </button>
            </span>
          )}
        </div>
        <p className="mb-1 text-xs text-[#5b6578]">
          느림 = {SLOW_TXT}, 오류 = 4xx·5xx·네트워크 실패. 오류 원인은 <b>상태코드 기준</b>입니다(브라우저 계측은 서버 오류 메시지 본문을 볼 수 없음). 타일·분포 막대·아래 화면을 누르면 걸러집니다.
        </p>
        {scrTop.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1 text-xs" aria-label="화면별 느림·오류 TOP">
            <li className="py-0.5 font-semibold text-[#2c3850]">화면별 TOP</li>
            {scrTop.map(([nm, x]) => (
              <li key={nm}>
                <button
                  type="button"
                  onClick={() => pick({ ...f, scr: f.scr === nm ? undefined : nm })}
                  aria-pressed={f.scr === nm}
                  className={`rounded border px-2 py-0.5 ${f.scr === nm ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : 'border-[#d6deeb] bg-white text-[#2c3850] hover:border-[#1f3a68]'}`}
                >
                  {nm} <span className={f.scr === nm ? '' : 'text-amber-700'}>느림 {x.slow}</span> · <span className={f.scr === nm ? '' : 'text-red-700'}>오류 {x.err}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="thead-3d">
              <tr>
                <th className="px-2 py-1 text-left">시각</th>
                <th className="px-2 py-1 text-left">화면</th>
                <th className="px-2 py-1 text-left">API</th>
                <th className="px-2 py-1 text-left">상태</th>
                <th className="px-2 py-1">응답(ms)</th>
                <th className="px-2 py-1">구분</th>
              </tr>
            </thead>
            <tbody>
              {list.slice((cur - 1) * PAGE, cur * PAGE).map((e, i) => {
                const bad = e.evt_cd === 'ERR'
                return (
                  <tr key={`${e.occr_dtm}-${i}`} className="border-b">
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums">{fmtS(e.occr_dtm)}</td>
                    <td className="px-2 py-1">
                      <div className="font-semibold text-[#2c3850]">{pageMenu(e.scr_txt)}</div>
                      <div className="font-mono text-xs text-[#5b6578]">{e.scr_txt ?? '—'}</div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-semibold text-[#2c3850]">{routeMenu(e.route_txt)}</div>
                      <div className="font-mono text-xs text-[#5b6578]">{e.route_txt}</div>
                    </td>
                    <td className={`whitespace-nowrap px-2 py-1 ${bad ? 'text-red-700' : 'text-amber-700'}`}>
                      <span className="font-mono tabular-nums">{e.sts_no}</span> {stsNm(e.sts_no)}
                    </td>
                    <td className={`px-2 py-1 text-right tabular-nums ${e.rsp_val >= SLOW_MS ? 'text-amber-700' : ''}`}>{e.rsp_val.toLocaleString()}</td>
                    <td className="px-2 py-1 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${bad ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{bad ? '오류' : '느림'}</span>
                    </td>
                  </tr>
                )
              })}
              {!list.length && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-center text-gray-500">
                    {!data ? '불러오는 중…' : evts.length ? '필터에 맞는 요청이 없습니다' : '배포 후 들어온 요청부터 화면별로 기록됩니다(느림 1초 이상·오류만)'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav className="mt-1 flex flex-wrap items-center justify-center gap-1 text-xs" aria-label="상세 페이지">
            <button type="button" disabled={cur <= 1} onClick={() => setPg(cur - 1)} className="rounded border border-[#d6deeb] bg-white px-2 py-0.5 disabled:opacity-40">
              이전
            </button>
            {/* 모바일 축약 : 처음·끝·현재 ±1 만, 넓은 화면은 ±3 — '…' 는 각 화면에 보이는 이웃 번호 기준 */}
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === pages || Math.abs(n - cur) <= 3)
              .map((n, i, a) => {
                const mob = (x: number) => x === 1 || x === pages || Math.abs(x - cur) <= 1
                const prevMob = a.slice(0, i).filter(mob).pop()
                const gapD = i > 0 && n - a[i - 1] > 1
                const gapM = mob(n) && prevMob !== undefined && n - prevMob > 1
                const dot = gapD && gapM ? 'inline' : gapM ? 'sm:hidden' : gapD ? 'hidden sm:inline' : ''
                return (
                <span key={n} className={`items-center gap-1 ${mob(n) ? 'flex' : 'hidden sm:flex'}`}>
                  {dot && <span className={`text-[#5b6578] ${dot}`}>…</span>}
                  <button
                    type="button"
                    onClick={() => setPg(n)}
                    aria-current={n === cur ? 'page' : undefined}
                    className={`rounded border px-2 py-0.5 tabular-nums ${n === cur ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : 'border-[#d6deeb] bg-white text-[#2c3850]'}`}
                  >
                    {n}
                  </button>
                </span>
                )
              })}
            <button type="button" disabled={cur >= pages} onClick={() => setPg(cur + 1)} className="rounded border border-[#d6deeb] bg-white px-2 py-0.5 disabled:opacity-40">
              다음
            </button>
          </nav>
        )}
      </section>
    </div>
  )
}

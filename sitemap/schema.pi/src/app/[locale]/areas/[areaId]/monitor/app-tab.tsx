'use client'
// 애플리케이션 모니터링 탭 — schema.pi API(브라우저 계측, 분 × 경로) : TPS·평균 응답·오류율·느림, 분 단위 분포, 경로 TOP(전역 관리자만)
// 경로 TOP 은 요청 수·느림·오류 기준 정렬(타일 클릭으로도 전환), 메뉴 열(routeMenu)을 경로 왼쪽에 별도 표시
// 느린·오류 요청 상세(sql/069) : 어느 화면(pageMenu)·어떤 API·상태코드인지 개별 행 — 타일(느림·오류)·분포 막대(분)·화면별 TOP 으로 필터, 20행 페이지
// AI 원인 분석 : 경로 TOP 의 느림·오류 경로 → 설정에 등록한 AI 모델(기본 또는 패널에서 고른 모델)이 원인·해결 방안 제시(화면 표시만, 저장·자동 수정 없음)
//  결과에 사용 모델·요금제·계정·소요·토큰을 함께 표시(자료 신뢰성, 2026-10-21 마스터 지시)
//  해결 방안마다 'PR 로 해결'(2026-10-22 마스터 지시) : 같은 모델이 그 파일을 고쳐 GitHub PR 생성(/api/mon/app/fix) — 병합 전 운영 반영 없음
//  PR 을 검토한 뒤 '승인' = master 병합 + 운영 배포(/api/mon/app/fix/approve), 배포 상태를 15초마다 확인해 표시
import { piFetch } from '@pi/auth/client'
import { GitPullRequest, TriangleAlert } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { InfoTip } from '@/components/page-head'
import type { AiMdl, AiResult, AiRun } from '@/lib/mon-ai'
import { mainOf, pageMenu, routeMenu, SLOW_MS, SYSTEMS, type SysCd } from '@/lib/mon'
import { fmtN, Line, Stack, Tile, type Pt } from './charts'
import { normFile } from '@/lib/mon-fix-patch'
import { Pager, StepBar, type Step } from './fix-steps'
import VerifyPanel from './verify-panel'
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
// 오늘이 아니면 날짜까지(재사용·직전 분석은 어제일 수 있음)
const fmtDT = (t: string) => (new Date(t).toDateString() === new Date().toDateString() ? fmtS(t) : new Date(t).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }))

type Ai = { route: string; busy: boolean; res?: AiRun; err?: string; verify?: boolean; info?: boolean } // info = 문제 없음 안내(오류 아님) // verify = AI 수정 배포 직후라 재분석 차단(실시간 확인 표시)
// PR 상태 — 만든 뒤 '승인' = master 병합 + 운영 배포(sha), dep = Vercel 운영 배포 상태(pending·success·failure)
type Pr = { busy?: boolean; url?: string; number?: number; head?: string; err?: string; apv?: boolean; sha?: string; ahead?: number; dep?: string | null; rej?: boolean; rjb?: boolean } // rej = 반려(PR 닫힘, 수정 전 유지), rjb = 반려 처리 중
// 진행 단계(공용 fix-steps.tsx) — 화면 상태로 계산
function stepOf(x: Pr): Step {
  if (x.dep === 'success') return { at: 4, on: false, bad: false }
  if (x.dep === 'failure' || x.dep === 'error') return { at: 3, on: false, bad: true }
  if (x.sha) return { at: 3, on: true, bad: false }
  if (x.apv) return { at: 2, on: true, bad: false }
  if (x.rej) return { at: 2, on: false, bad: true }
  if (x.url) return { at: 2, on: false, bad: !!x.err }
  return { at: 0, on: !!x.busy, bad: !!x.err }
}
function Steps({ x }: { x: Pr }) {
  const st = stepOf(x)
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      <StepBar st={st} />
      {x.dep === 'success' && <span className="ms-1 text-ok">운영 반영 완료</span>}
      {st.bad && x.sha && <span className="ms-1 text-danger">운영 빌드 실패 — 이전 배포가 계속 서비스됨</span>}
    </div>
  )
}
type MdlOpt = Pick<AiMdl, 'dsp_nm' | 'plan_nm'> & { mdl_id: string; dflt_yn: 'Y' | 'N' }
// 가능성·신뢰도 → 이름·배지 색조(badge data-tone)
const LIKE: Record<AiResult['confidence'], [string, 'danger' | 'warn' | undefined]> = { HIGH: ['높음', 'danger'], MID: ['중간', 'warn'], LOW: ['낮음', undefined] }

// AI 원인 분석 결과 패널 — 원인 > 해결 방안 묶음(가능성 순)을 하나씩 접고 펼침, 마지막에 조치 후 확인. 머리글 '숨기기'로 본문 전체 접기
// canApv = 결재(승인·반려) 권한(MON_FIX_APV = DA 역할 ∩ 요금제4) — 없으면 버튼 대신 'DA 결재 대기'
function AiPanel({ ai, mdls, mdlId, onMdl, onClose, onRetry, canApv }: { ai: Ai; mdls: MdlOpt[]; mdlId: string; onMdl: (id: string) => void; onClose: () => void; onRetry: () => void; canApv: boolean }) {
  const { areaId } = useParams<{ areaId: string }>()
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
      const body = { area_id: areaId, route: ai.route, cause: { title: c.title, evidence: c.evidence }, fix: x, ...(mdl ? { mdl_id: mdl } : {}) }
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
      const j = await (await piFetch('/api/mon/app/fix/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area_id: areaId, number: cur.number, head: cur.head }) })).json()
      setPrs((p) => ({ ...p, [k]: j.ok ? { ...cur, sha: j.sha, ahead: j.ahead, dep: 'pending' } : { ...cur, err: j.message ?? '승인하지 못했습니다' } }))
    } catch {
      setPrs((p) => ({ ...p, [k]: { ...cur, err: '승인하지 못했습니다(네트워크)' } }))
    }
  }
  // 반려(2026-10-22) — PR 닫기·브랜치 삭제, 병합 안 함 = 운영 코드는 수정 전 그대로. 사유 필수
  const reject = async (k: string) => {
    const cur = prs[k]
    if (!cur?.number || cur.apv || cur.rjb || cur.sha || cur.rej) return
    const reason = prompt(`PR #${cur.number} 반려 — PR 을 닫고 병합하지 않습니다(운영 코드는 수정 전 그대로)\n\n사유를 입력하십시오(2자 이상)`)?.trim()
    if (!reason) return
    if (reason.length < 2) return setPrs((p) => ({ ...p, [k]: { ...cur, err: '반려 사유를 2자 이상 입력하십시오' } }))
    setPrs((p) => ({ ...p, [k]: { ...cur, rjb: true, err: undefined } }))
    try {
      const j = await (await piFetch('/api/mon/app/fix/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area_id: areaId, number: cur.number, reason }) })).json()
      setPrs((p) => ({ ...p, [k]: j.ok ? { ...cur, rej: true, rjb: false, err: `반려 — ${reason}` } : { ...cur, rjb: false, err: j.message ?? '반려하지 못했습니다' } }))
    } catch {
      setPrs((p) => ({ ...p, [k]: { ...cur, rjb: false, err: '반려하지 못했습니다(네트워크)' } }))
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
        const j = await (await piFetch(`/api/mon/app/fix/approve?area=${areaId}&sha=${x.sha}`)).json().catch(() => null)
        if (j?.ok && j.state && j.state !== 'pending') setPrs((p) => ({ ...p, [k]: { ...p[k], dep: j.state } }))
      }
    }, 15_000)
    return () => clearInterval(id)
  }, [pending.map(([k]) => k).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="panel mt-2 p-4 text-sm" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">원인 분석</span>
        <span className="text-xs text-ink-3">
          {routeMenu(ai.route)} · <span className="font-mono">{ai.route}</span>
        </span>
        {r && (
          <span className="badge" data-tone={LIKE[r.confidence][1]}>
            신뢰도 {LIKE[r.confidence][0]}
          </span>
        )}
        <span className="ms-auto flex items-center gap-1">
          {mdls.length > 1 && (
            <select aria-label="분석 모델" value={mdlId} disabled={ai.busy} onChange={(e) => onMdl(e.target.value)} className="input-sm w-auto">
              {mdls.map((m) => (
                <option key={m.mdl_id} value={m.mdl_id}>
                  {m.dsp_nm}
                  {m.dflt_yn === 'Y' ? ' (기본)' : ''}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn-ghost btn-sm">
            {open ? '숨기기' : '보이기'}
          </button>
          <button
            type="button"
            disabled={ai.busy}
            onClick={() => {
              setOpen(true)
              onRetry()
            }}
            className="btn-key btn-sm">
            다시 분석
          </button>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm">
            닫기
          </button>
        </span>
      </div>
      {run && (
        <p className="mt-2 text-xs text-ink-3">
          분석 모델 <span className="font-medium text-ink">{run.mdl.dsp_nm}</span> (<span className="font-mono">{run.mdl.mdl_nm}</span>) · 요금제{' '}
          {run.mdl.plan_nm && run.mdl.plan_nm !== '미등록' ? run.mdl.plan_nm : <span className="text-danger">[미등록]</span>}
          {run.mdl.acct_nm && ` · 계정 ${run.mdl.acct_nm}`} · {(run.ms / 1000).toFixed(1)}초 · 토큰 입력 {fmtN(run.tok.in)} / 출력 {fmtN(run.tok.out)}
        </p>
      )}
      {run?.basis && (
        // 분석 근거(마스터 지시 2026-10-22) — 결과가 달라질 때 구간·표본·소스가 달라서인지 바로 보이게
        <p className="mt-1 text-xs text-ink-3">
          {run.reused && <span className="badge me-1">이전 분석 재사용 — 데이터·소스 변화 없음</span>}
          근거 : {fmtDT(run.basis.at)} 분석 · 구간 {fmtDT(run.basis.from)} ~ {fmtDT(run.basis.to)}
          {run.basis.floor === 'DEPLOY' && ' (최근 AI 수정 배포 이후만)'} · 요청 {fmtN(run.basis.req)} / 오류 {fmtN(run.basis.err)} · 이력 {run.basis.evt}건 · 소스 {run.basis.src ?? '로컬'}
          {run.basis.cut && <span className="text-warn"> · 상한 도달(최근 일부만 분석)</span>}
        </p>
      )}
      {run?.prev && r && (
        <p className="mt-1 text-xs">
          <span className="badge" data-tone={run.prev.main === mainOf(r) ? 'ok' : 'warn'}>
            직전 분석({fmtDT(run.prev.at)} · {run.prev.mdl}) 대비 주원인 {run.prev.main === mainOf(r) ? '같음' : '바뀜'}
          </span>
          <span className="ms-1 text-ink-3">
            {run.prev.main !== mainOf(r) && `직전 : ${run.prev.main ?? '-'} · `}
            직전 요청 {fmtN(run.prev.req)}/오류 {fmtN(run.prev.err)} → 지금 {fmtN(run.basis.req)}/{fmtN(run.basis.err)}
            {run.prev.src !== run.basis.src && ` · 소스 다름(${run.prev.src ?? '로컬'} → ${run.basis.src ?? '로컬'})`}
            {run.prev.mdl !== run.mdl.dsp_nm && ' · 모델 다름'}
          </span>
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          {ai.busy && <p className="text-ink-3">수치·개별 이력·소스 코드 분석 중(최대 1~2분)…</p>}
          {ai.err && <p className={ai.info ? 'text-ok' : ai.verify ? 'text-warn' : 'text-danger'}>{ai.err}</p>}
          {(ai.verify || Object.values(prs).some((x) => x.sha)) && <VerifyPanel route={ai.route} />}
          {r && (
            <>
              <p className="text-ink">{r.summary}</p>
              {r.causes.map((c, i) => (
                <details key={i} open={i === 0} className="rounded-card border border-line bg-surface">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                    <span className="font-mono text-xs text-ink-3">원인 {i + 1}</span>
                    <span className="badge" data-tone={LIKE[c.likelihood][1]}>
                      {LIKE[c.likelihood][0]}
                    </span>
                    <span className="font-medium text-ink">{c.title}</span>
                  </summary>
                  <div className="space-y-2 border-t border-line px-3 py-2">
                    <p className="text-xs text-ink-3">{c.evidence}</p>
                    {c.fixes.map((x, j) => (
                      <div key={j} className="space-y-1 rounded-control bg-well px-3 py-2">
                        <div className="flex items-center gap-2 text-ink">
                          <span className="badge" data-tone="ok">
                            해결
                          </span>
                          <span className="font-medium">{x.title}</span>
                        </div>
                        <p className="text-xs text-ink-2">{x.detail}</p>
                        {x.code === false ? (
                          <p className="text-xs font-medium text-ok">코드 변경 없는 조치 — PR 불필요</p>
                        ) : x.files.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-xs text-ink-3">{x.files.join(' · ')}</p>
                            {x.files.every((f) => !normFile(f)) ? (
                              <span className="badge ms-auto" data-tone="warn" title="인증·권한·결제·요금제·환경 파일과 AI 수정 기능 자신은 사람만 수정, 그 밖에 이 앱 src 아래 ts·tsx 만 AI 수정 대상">
                                사람 수정 필요
                              </span>
                            ) : prs[`${i}-${j}`]?.url ? (
                              <span className="ms-auto flex flex-wrap items-center gap-1">
                                <a href={prs[`${i}-${j}`].url} target="_blank" rel="noreferrer" className="btn-key btn-sm">
                                  <GitPullRequest aria-hidden />
                                  PR #{prs[`${i}-${j}`].number}
                                </a>
                                {prs[`${i}-${j}`].sha ? (
                                  <span className="text-xs text-ink-3">운영에 나간 커밋 {prs[`${i}-${j}`].ahead}개 · 되돌리기는 'AI 수정 이력' 탭</span>
                                ) : prs[`${i}-${j}`].rej ? (
                                  <span className="badge" data-tone="danger">반려됨 — 수정 전 코드 유지</span>
                                ) : !canApv ? (
                                  <span className="badge" data-tone="warn" title="결재(승인·반려)는 DA 역할 ∩ 요금제4(DA)만">DA 결재 대기</span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      disabled={prs[`${i}-${j}`].apv || prs[`${i}-${j}`].rjb}
                                      onClick={() => void approve(`${i}-${j}`)}
                                      className="btn-key btn-sm">
                                      {prs[`${i}-${j}`].apv ? '처리 중…' : '승인(병합·배포)'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={prs[`${i}-${j}`].apv || prs[`${i}-${j}`].rjb}
                                      onClick={() => void reject(`${i}-${j}`)}
                                      className="btn-danger btn-sm">
                                      {prs[`${i}-${j}`].rjb ? '반려 중…' : '반려'}
                                    </button>
                                  </>
                                )}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={prs[`${i}-${j}`]?.busy}
                                onClick={() => void makePr(`${i}-${j}`, c, x)}
                                className="btn-key btn-sm ms-auto">
                                <GitPullRequest aria-hidden />
                                {prs[`${i}-${j}`]?.busy ? '수정안 만드는 중…(최대 3~5분)' : 'PR 로 해결'}
                              </button>
                            )}
                          </div>
                        )}
                        {prs[`${i}-${j}`] && <Steps x={prs[`${i}-${j}`]} />}
                        {prs[`${i}-${j}`]?.err && <p className={`text-xs ${prs[`${i}-${j}`].err!.includes('AI 판단 : 바꿀 코드가 없습니다') ? 'text-warn' : 'text-danger'}`}>{prs[`${i}-${j}`].err}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              {r.checks.length > 0 && (
                <details className="rounded-card border border-line bg-surface">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink">조치 후 확인 ({r.checks.length})</summary>
                  <ul className="list-disc border-t border-line py-2 ps-7 pe-3 text-xs text-ink-2">
                    {r.checks.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </details>
              )}
              {r.gaps.length > 0 && <p className="text-xs text-ink-3">부족한 데이터 : {r.gaps.join(' / ')}</p>}
              <p className="flex items-center gap-1 text-xs text-ink-3">
                AI 추정
                <InfoTip>'PR 로 해결'은 GitHub PR 만 만들고 운영 코드는 바꾸지 않습니다. PR 의 변경 내용과 미리보기를 확인한 뒤 '승인'을 누르면 병합·운영 배포됩니다.</InfoTip>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

type Row = { bkt_dtm: string; route_txt: string; req_cnt: number; err_cnt: number; slow_cnt: number; rsp_sum_val: number | string; rsp_max_val: number }

export default function AppTab({ live, min, canApv }: { live: boolean; min: number; canApv: boolean }) {
  const { areaId } = useParams<{ areaId: string }>()
  // 시스템 선택(2026-10-24, sql/075) — schema.pi 외 시스템(cafe.pi·sitemap.pi)은 서버가 전역 관리자에게만 선택지로 내려줌. AI 원인 분석·수정은 schema.pi 소스 대상이라 schema.pi 에서만
  const [sys, setSys] = useState<SysCd>('SCHEMA')
  const own = sys === 'SCHEMA'
  const rMenu = (r: string) => (own ? routeMenu(r) : r.split('/').slice(2, 4).join('/') || r)
  const pMenu = (p: string | null) => (own ? pageMenu(p) : (p ?? '-'))
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
      const j = await (await piFetch('/api/mon/app/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area_id: areaId, route, min, ...(id ? { mdl_id: id } : {}) }) })).json()
      setAi(j.ok ? { route, busy: false, res: { ai: j.ai, mdl: j.mdl, ms: j.ms, tok: j.tok, basis: j.basis, reused: j.reused, prev: j.prev } } : { route, busy: false, err: j.message ?? 'AI 원인 분석에 실패했습니다', verify: j.code === 'MON_AI_VERIFY', info: j.code === 'MON_AI_EMPTY' })
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
  const { data, err } = usePoll<{ rows: Row[]; evts?: Evt[]; systems?: SysCd[] }>(`/api/mon/app?area=${areaId}&min=${min}&sys=${sys}`, live)
  const pickSys = (v: SysCd) => {
    setSys(v)
    setF({})
    setPg(1)
    setAi(null)
  }
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
      const k = pMenu(e.scr_txt)
      const x = m.get(k) ?? { slow: 0, err: 0 }
      x[e.evt_cd === 'ERR' ? 'err' : 'slow']++
      return m.set(k, x)
    }, new Map<string, { slow: number; err: number }>()),
  ]
    .sort((a, b) => b[1].slow + b[1].err - (a[1].slow + a[1].err))
    .slice(0, 8)
  const list = f.scr ? base.filter((e) => pMenu(e.scr_txt) === f.scr) : base
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const cur = Math.min(pg, pages)
  const fTxt = [f.cd && (f.cd === 'SLOW' ? '느림' : '오류'), f.t && `${fmtS(f.t).slice(0, 5)} 분`, f.scr && `화면 ${f.scr}`].filter(Boolean).join(' · ')

  if (err)
    return (
      <p role="status" className="flex items-center gap-1.5 text-dense text-danger">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        {err}
      </p>
    )
  const errPct = v.tot.req ? Math.round((v.tot.err / v.tot.req) * 1000) / 10 : 0
  return (
    <div className="space-y-6">
      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(data?.systems?.length ?? 0) > 1 && (
          <select aria-label="모니터링 시스템" value={sys} onChange={(e) => pickSys(e.target.value as SysCd)} className="input-sm w-auto font-medium">
            {data!.systems!.map((x) => (
              <option key={x} value={x}>
                {SYSTEMS[x]}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-ink-3">{SYSTEMS[sys]} · 브라우저 계측</span>
        <InfoTip>
          {SYSTEMS[sys]} 화면이 부른 API 응답을 브라우저가 재서 모은 값입니다(로그인 사용자, 1분 단위, 운영 배포만). 서버 내부 구간(SQL·외부 호출) 분해는 없습니다.{!own && ' AI 원인 분석·수정은 schema.pi 에서만 제공합니다.'}
        </InfoTip>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile nm="TPS(최근 5분)" val={fmtN(v.tps, 2)} sub="초당 요청" />
        <Tile nm="요청 수" val={v.tot.req.toLocaleString()} sub={`최근 ${min}분`} />
        <Tile nm="평균 응답" val={`${v.tot.req ? Math.round(v.tot.sum / v.tot.req) : 0}ms`} />
        <Tile nm="오류율" val={`${errPct}%`} sub={`${v.tot.err}건(4xx·5xx·실패)`} warn={errPct >= 5} on={f.cd === 'ERR'} onClick={() => tile('err')} title="누르면 경로 표를 오류 많은 순으로 정렬 + 아래 상세를 오류만" />
        <Tile nm="느린 요청" val={v.tot.slow.toLocaleString()} sub={SLOW_TXT} warn={v.tot.slow > 0} on={f.cd === 'SLOW'} onClick={() => tile('slow')} title={`누르면 경로 표를 느린 요청(${SLOW_TXT}) 많은 순으로 정렬 + 아래 상세를 느림만`} />
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Stack title="요청 분포(분)" bars={v.bars} sel={f.t ?? null} onPick={(t) => pick({ ...f, t: f.t === t ? undefined : t })} />
        <Line title="TPS" pts={v.tpsPts} unit="/s" />
        <Line title="평균 응답시간" pts={v.rspPts} unit="ms" color="var(--ink-3)" />
        <Line title="오류 수" pts={v.errPts} color="var(--danger)" />
      </div>
      </div>
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">경로 TOP 10</h3>
          {key === 'slow' && <InfoTip>느림 = {SLOW_TXT} 걸린 요청(브라우저가 잰 응답 시간)</InfoTip>}
          <span className="seg ms-auto" role="group" aria-label="정렬 기준">
            {(Object.keys(KEY_NM) as Key[]).map((k) => (
              <button key={k} type="button" onClick={() => setKey(k)} aria-pressed={key === k} className="seg-item">
                {KEY_NM[k]}
              </button>
            ))}
          </span>
        </div>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[50rem] text-dense">
            <thead className="thead-3d">
              <tr>
                <th className="px-3 py-2 text-start">메뉴</th>
                <th className="px-3 py-2 text-start">경로</th>
                <th className="px-3 py-2 text-right">요청</th>
                <th className="px-3 py-2 text-right">평균(ms)</th>
                <th className="px-3 py-2 text-right">최대(ms)</th>
                <th className="px-3 py-2 text-right" title={SLOW_TXT}>느림</th>
                <th className="px-3 py-2 text-right">오류</th>
                {own && <th className="px-3 py-2">원인</th>}
              </tr>
            </thead>
            <tbody>
              {top.map(([r, x]) => (
                <tr key={r} className="border-b border-line">
                  <td className="px-3 py-1 font-medium whitespace-nowrap text-ink">{rMenu(r)}</td>
                  <td className="px-3 py-1 font-mono text-xs text-ink-3">{r}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{x.req.toLocaleString()}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{Math.round(x.sum / Math.max(1, x.req))}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{x.max}</td>
                  <td className={`px-3 py-1 text-right tabular-nums ${x.slow ? 'text-warn' : ''}`}>{x.slow}</td>
                  <td className={`px-3 py-1 text-right tabular-nums ${x.err ? 'text-danger' : ''}`}>{x.err}</td>
                  {own && <td className="px-3 py-1 text-center">
                    {(x.err > 0 || x.slow > 0) && (
                      <button
                        type="button"
                        disabled={ai?.busy}
                        onClick={() => void analyze(r)}
                        title="이 경로의 오류·느림 원인과 해결 방안을 AI 로 분석(화면 표시만)"
                        className="btn-key btn-sm"
                      >
                        {ai?.busy && ai.route === r ? '분석 중…' : '원인 분석'}
                      </button>
                    )}
                  </td>}
                </tr>
              ))}
              {!top.length && (
                <tr>
                  <td colSpan={own ? 8 : 7} className="py-6 text-center text-dense text-ink-3">
                    {!data ? '불러오는 중…' : v.rt.size ? `${KEY_NM[key]} 건이 있는 경로 없음` : '수집된 요청 없음'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ai && <AiPanel ai={ai} mdls={mdls} mdlId={mdlId} onMdl={setMdlId} onClose={() => setAi(null)} onRetry={() => void analyze(ai.route)} canApv={canApv} />}
      </section>
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">느린·오류 요청</h3>
          <InfoTip>느림 = {SLOW_TXT}, 오류 = 4xx·5xx·네트워크 실패. 오류 원인은 상태코드 기준입니다(브라우저 계측은 서버 오류 메시지 본문을 볼 수 없음). 타일·분포 막대·화면을 누르면 걸러집니다.</InfoTip>
          <span className="font-mono text-xs text-ink-3 tabular-nums">
            {list.length.toLocaleString()}건{evts.length >= 500 ? '(최신 500건 중)' : ''}
          </span>
          {fTxt && (
            <span className="ms-auto flex items-center gap-1">
              <span className="badge" data-tone="accent">필터 : {fTxt}</span>
              <button
                type="button"
                onClick={() => {
                  setKey('req')
                  pick({})
                }}
                className="btn-ghost btn-sm"
              >
                필터 해제
              </button>
            </span>
          )}
        </div>
        {scrTop.length > 0 && (
          <ul className="mb-2 flex flex-wrap items-center gap-1" aria-label="화면별 느림·오류 TOP">
            <li className="me-1 text-xs font-medium text-ink-2">화면별 TOP</li>
            {scrTop.map(([nm, x]) => (
              <li key={nm}>
                <button
                  type="button"
                  onClick={() => pick({ ...f, scr: f.scr === nm ? undefined : nm })}
                  aria-pressed={f.scr === nm}
                  className="btn-key btn-sm"
                >
                  {nm} <span className="text-warn tabular-nums">느림 {x.slow}</span> · <span className="text-danger tabular-nums">오류 {x.err}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[48rem] text-dense">
            <thead className="thead-3d">
              <tr>
                <th className="px-3 py-2 text-start">시각</th>
                <th className="px-3 py-2 text-start">화면</th>
                <th className="px-3 py-2 text-start">API</th>
                <th className="px-3 py-2 text-start">상태</th>
                <th className="px-3 py-2 text-right">응답(ms)</th>
                <th className="px-3 py-2">구분</th>
              </tr>
            </thead>
            <tbody>
              {list.slice((cur - 1) * PAGE, cur * PAGE).map((e, i) => {
                const bad = e.evt_cd === 'ERR'
                return (
                  <tr key={`${e.occr_dtm}-${i}`} className="border-b border-line">
                    <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap tabular-nums">{fmtS(e.occr_dtm)}</td>
                    <td className="px-3 py-1.5">
                      <div className="font-medium text-ink">{pMenu(e.scr_txt)}</div>
                      <div className="font-mono text-xs text-ink-3">{e.scr_txt ?? '—'}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="font-medium text-ink">{rMenu(e.route_txt)}</div>
                      <div className="font-mono text-xs text-ink-3">{e.route_txt}</div>
                    </td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${bad ? 'text-danger' : 'text-warn'}`}>
                      <span className="font-mono tabular-nums">{e.sts_no}</span> {stsNm(e.sts_no)}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${e.rsp_val >= SLOW_MS ? 'text-warn' : ''}`}>{e.rsp_val.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="badge" data-tone={bad ? 'danger' : 'warn'}>
                        {bad ? '오류' : '느림'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {!list.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-dense text-ink-3">
                    {!data ? '불러오는 중…' : evts.length ? '필터에 맞는 요청 없음' : '느림·오류 요청 없음'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager cur={cur} pages={pages} onPage={setPg} label="상세 페이지" />
      </section>
    </div>
  )
}

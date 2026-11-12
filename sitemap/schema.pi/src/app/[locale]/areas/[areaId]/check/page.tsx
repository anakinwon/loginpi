'use client'
import { piFetch } from '@pi/auth/client'
// 표준 점검 화면(P17~P19) — 점검 실행 → 대상 유형별 준수율·등급별·규칙별 건수, 위반 목록(등급·규칙 필터, 100건씩), CSV 내려받기
import { ChevronLeft, ChevronRight, Download, TriangleAlert } from 'lucide-react'
import { use, useMemo, useState } from 'react'
import { Icon3D } from '@/components/icon-3d'
import { InfoTip, PageHead } from '@/components/page-head'
import { MENU_ICON } from '@/lib/menu-icons'

interface Rule {
  id: string
  tp: 'DIC' | 'DOM' | 'TERM'
  grade: 'P1' | 'P2' | 'P3'
  nm: string
  cnt: number
}
interface Viol {
  rule: string
  grade: string
  tp: string
  id: string
  name: string
  detail: string
}
interface Res {
  at: string
  summary: { tp: string; total: number; ok: number; rate: number }[]
  nstd: number
  by_rule: Rule[]
  by_grade: Record<string, number>
  violations: Viol[]
}
const TP_NM: Record<string, string> = { DIC: '단어', DOM: '도메인', TERM: '용어' }
// 등급 → 배지 색조(P1 치명 = danger, P2 중대 = warn, P3 경미 = 기본)
const GRADE_TONE: Record<string, 'danger' | 'warn' | undefined> = { P1: 'danger', P2: 'warn', P3: undefined }
const PAGE = 100

export default function CheckPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const [res, setRes] = useState<Res | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [flt, setFlt] = useState({ grade: '', rule: '', page: 1 })

  const run = async () => {
    setBusy(true)
    setMsg('')
    const j = await (await piFetch(`/api/areas/${areaId}/check`)).json().catch(() => null)
    setBusy(false)
    if (!j?.ok) return setMsg(j?.message ?? '점검에 실패했습니다')
    setRes(j)
    setFlt({ grade: '', rule: '', page: 1 })
  }
  const list = useMemo(() => (res?.violations ?? []).filter((v) => (!flt.grade || v.grade === flt.grade) && (!flt.rule || v.rule === flt.rule)), [res, flt.grade, flt.rule])
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const rn = Object.fromEntries((res?.by_rule ?? []).map((r) => [r.id, r.nm]))
  const badge = (g: string) => (
    <span className="badge font-mono" data-tone={GRADE_TONE[g]}>
      {g}
    </span>
  )

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead
        title="표준 점검"
        info="승인완료 단어·도메인·용어를 규칙 13종으로 전수 검사합니다. 등급은 품질관리 지침(안) 별표 2(P1 치명·P2 중대·P3 경미), 준수율은 P1·P2 위반이 없는 대상의 비율입니다."
        sub={res ? <span className="font-mono">점검 {new Date(res.at).toLocaleString('ko-KR')}</span> : undefined}
        actions={
          <>
            {res && (
              <a href={`/api/areas/${areaId}/check?format=csv`} className="btn-key" download>
                <Download aria-hidden /> 엑셀
              </a>
            )}
            <button onClick={run} disabled={busy} className="btn-3d">
              {busy ? '점검 중…' : res ? '다시 점검' : '점검 실행'}
            </button>
          </>
        }
      />
      {msg && (
        <p role="status" className="mb-4 flex items-center gap-1.5 text-dense text-danger">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
          {msg}
        </p>
      )}

      {!res && (
        <div className="panel empty">
          <Icon3D icon={MENU_ICON.settings} />
          <p>점검 결과 없음</p>
        </div>
      )}

      {res && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {res.summary.map((s) => (
              <div key={s.tp} className="panel min-h-22 px-4 py-3">
                <p className="text-xs text-ink-3">{TP_NM[s.tp]} 준수율</p>
                <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{s.rate}%</p>
                <p className="text-xs text-ink-3 tabular-nums">
                  {s.ok.toLocaleString()} / {s.total.toLocaleString()}건{s.tp === 'TERM' && res.nstd ? ` · 비표준 수용 ${res.nstd}건 제외` : ''}
                </p>
              </div>
            ))}
            <div className="panel min-h-22 px-4 py-3">
              <p className="text-xs text-ink-3">등급별 위반</p>
              <div className="mt-1 space-y-1 text-dense tabular-nums">
                {(['P1', 'P2', 'P3'] as const).map((g) => (
                  <p key={g} className="flex items-center gap-2">
                    {badge(g)} {res.by_grade[g].toLocaleString()}건
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-1">
              <h2 className="text-sm font-semibold text-ink">규칙별 결과</h2>
              <InfoTip>행을 누르면 그 규칙의 위반만 아래에 표시합니다. W02·W03 등급은 잠정값입니다(별표 2에 단어 약어 항목 없음).</InfoTip>
            </div>
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
              <thead className="thead-3d">
                <tr>
                  {['규칙', '대상', '등급', '규칙명', '위반'].map((h) => (
                    <th key={h} className={`px-3 py-2 ${h === '규칙명' ? 'text-start' : h === '위반' ? 'text-right' : 'text-center'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.by_rule.map((r) => (
                  <tr key={r.id} onClick={() => r.cnt && setFlt({ grade: '', rule: r.id, page: 1 })} aria-selected={flt.rule === r.id || undefined} className={`border-b border-line ${r.cnt ? 'cursor-pointer' : ''}`}>
                    <td className="px-3 py-1.5 text-center font-mono text-xs">{r.id}</td>
                    <td className="px-3 py-1.5 text-center"><span className="badge">{TP_NM[r.tp]}</span></td>
                    <td className="px-3 py-1.5 text-center">{badge(r.grade)}</td>
                    <td className="w-full px-3 py-1.5">{r.nm}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.cnt ? 'font-medium text-danger' : 'text-ink-off'}`}>{r.cnt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">위반 목록</h2>
              <select value={flt.grade} onChange={(e) => setFlt({ ...flt, grade: e.target.value, page: 1 })} className="input-sm w-auto" aria-label="등급">
                <option value="">전체 등급</option>
                {['P1', 'P2', 'P3'].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              <select value={flt.rule} onChange={(e) => setFlt({ ...flt, rule: e.target.value, page: 1 })} className="input-sm w-auto max-w-full" aria-label="규칙">
                <option value="">전체 규칙</option>
                {res.by_rule.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} {r.nm}
                  </option>
                ))}
              </select>
              <span className="ms-auto font-mono text-xs text-ink-3 tabular-nums">총 {list.length.toLocaleString()}건</span>
            </div>
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
              <thead className="thead-3d">
                <tr>
                  {['#', '등급', '규칙', '대상', '이름', '내용'].map((h) => (
                    <th key={h} className={`px-3 py-2 ${h === '#' ? 'text-right' : h === '등급' || h === '대상' ? 'text-center' : 'text-start'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-dense text-ink-3">
                      위반 없음
                    </td>
                  </tr>
                ) : (
                  list.slice((flt.page - 1) * PAGE, flt.page * PAGE).map((v, i) => (
                    <tr key={`${v.rule}-${v.id}`} className="border-b border-line">
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-3 tabular-nums">{((flt.page - 1) * PAGE + i + 1).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-center">{badge(v.grade)}</td>
                      <td className="px-3 py-1.5 text-ink-2" title={rn[v.rule]}>
                        <span className="font-mono text-xs text-ink">{v.rule}</span> {rn[v.rule]}
                      </td>
                      <td className="px-3 py-1.5 text-center"><span className="badge">{TP_NM[v.tp]}</span></td>
                      <td className="px-3 py-1.5 font-medium text-ink">{v.name}</td>
                      <td className="w-full px-3 py-1.5 !whitespace-normal text-ink-2">{v.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            {pages > 1 && (
              <div className="mt-2 flex items-center justify-center gap-1">
                <button onClick={() => setFlt({ ...flt, page: flt.page - 1 })} disabled={flt.page <= 1} aria-label="이전" title="이전" className="btn-ghost btn-icon btn-sm">
                  <ChevronLeft className="rtl:rotate-180" aria-hidden />
                </button>
                <span className="px-1 font-mono text-xs text-ink-2 tabular-nums">
                  {flt.page} / {pages}
                </span>
                <button onClick={() => setFlt({ ...flt, page: flt.page + 1 })} disabled={flt.page >= pages} aria-label="다음" title="다음" className="btn-ghost btn-icon btn-sm">
                  <ChevronRight className="rtl:rotate-180" aria-hidden />
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

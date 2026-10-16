'use client'
import { piFetch } from '@pi/auth/client'
// 표준 점검 화면(P17~P19) — 점검 실행 → 대상 유형별 준수율·등급별·규칙별 건수, 위반 목록(등급·규칙 필터, 100건씩), CSV 내려받기
import Link from 'next/link'
import { use, useMemo, useState } from 'react'

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
const GRADE_CLS: Record<string, string> = { P1: 'bg-red-100 text-red-700 border-red-300', P2: 'bg-orange-100 text-orange-800 border-orange-300', P3: 'bg-gray-100 text-gray-600 border-gray-300' }
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
  const badge = (g: string) => <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${GRADE_CLS[g] ?? ''}`}>{g}</span>

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">표준 점검</h1>
      <p className="mt-1 text-sm text-gray-600">승인완료 단어·도메인·용어를 규칙 13종으로 전수 검사합니다. 등급은 품질관리 지침(안) 별표 2(P1 치명·P2 중대·P3 경미), 준수율은 P1·P2 위반이 없는 대상의 비율입니다.</p>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={run} disabled={busy} className="btn-3d px-8 disabled:opacity-40">
          {busy ? '점검 중…' : res ? '다시 점검' : '점검 실행'}
        </button>
        {res && (
          <a href={`/api/areas/${areaId}/check?format=csv`} className="btn-3d btn-3d-green" download>
            위반 목록 엑셀 다운로드
          </a>
        )}
        {res && <span className="text-xs text-gray-500">점검일시 {new Date(res.at).toLocaleString('ko-KR')}</span>}
        {msg && <span className="text-sm text-red-700">{msg}</span>}
      </div>

      {res && (
        <>
          <section className="mt-6 grid gap-3 md:grid-cols-4">
            {res.summary.map((s) => (
              <div key={s.tp} className="rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] p-4 shadow-sm">
                <p className="text-sm text-gray-600">{TP_NM[s.tp]} 준수율</p>
                <p className="mt-1 text-3xl font-bold text-[#1f3a68] tabular-nums">{s.rate}%</p>
                <p className="text-xs text-gray-500 tabular-nums">
                  {s.ok.toLocaleString()} / {s.total.toLocaleString()}건{s.tp === 'TERM' && res.nstd ? ` · 비표준 수용 ${res.nstd}건 제외` : ''}
                </p>
              </div>
            ))}
            <div className="rounded-xl border border-[#c7d2e6] bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">등급별 위반</p>
              <div className="mt-2 space-y-1 text-sm tabular-nums">
                {(['P1', 'P2', 'P3'] as const).map((g) => (
                  <p key={g}>
                    {badge(g)} {res.by_grade[g].toLocaleString()}건
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="text-lg font-semibold">규칙별 결과</h2>
            <table className="mt-2 w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap">
              <thead>
                <tr className="thead-3d text-center">
                  {['규칙', '대상', '등급', '규칙명', '위반'].map((h) => (
                    <th key={h} className="border px-2 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.by_rule.map((r) => (
                  <tr key={r.id} onClick={() => r.cnt && setFlt({ grade: '', rule: r.id, page: 1 })} className={r.cnt ? 'cursor-pointer hover:bg-[#e9eff9]' : ''}>
                    <td className="border px-2 py-1 text-center font-mono">{r.id}</td>
                    <td className="border px-2 py-1 text-center">{TP_NM[r.tp]}</td>
                    <td className="border px-2 py-1 text-center">{badge(r.grade)}</td>
                    <td className="w-full border px-2 py-1">{r.nm}</td>
                    <td className={`border px-2 py-1 text-right tabular-nums ${r.cnt ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{r.cnt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-gray-500">행을 누르면 그 규칙의 위반만 아래에 표시합니다. W02·W03 등급은 잠정값입니다(별표 2에 단어 약어 항목 없음).</p>
          </section>

          <section className="mt-6">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">위반 목록</h2>
              <select value={flt.grade} onChange={(e) => setFlt({ ...flt, grade: e.target.value, page: 1 })} className="rounded border px-2 py-1 text-sm" aria-label="등급">
                <option value="">전체 등급</option>
                {['P1', 'P2', 'P3'].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              <select value={flt.rule} onChange={(e) => setFlt({ ...flt, rule: e.target.value, page: 1 })} className="rounded border px-2 py-1 text-sm" aria-label="규칙">
                <option value="">전체 규칙</option>
                {res.by_rule.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} {r.nm}
                  </option>
                ))}
              </select>
              <span className="text-sm text-gray-600 tabular-nums">{list.length.toLocaleString()}건</span>
            </div>
            <table className="mt-2 w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap">
              <thead>
                <tr className="thead-3d text-center">
                  {['#', '등급', '규칙', '대상', '이름', '내용'].map((h) => (
                    <th key={h} className="border px-2 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="border px-2 py-4 text-center text-gray-500">
                      위반이 없습니다
                    </td>
                  </tr>
                ) : (
                  list.slice((flt.page - 1) * PAGE, flt.page * PAGE).map((v, i) => (
                    <tr key={`${v.rule}-${v.id}`} className="hover:bg-gray-50">
                      <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((flt.page - 1) * PAGE + i + 1).toLocaleString()}</td>
                      <td className="border px-2 py-1 text-center">{badge(v.grade)}</td>
                      <td className="border px-2 py-1" title={rn[v.rule]}>
                        <span className="font-mono">{v.rule}</span> {rn[v.rule]}
                      </td>
                      <td className="border px-2 py-1 text-center">{TP_NM[v.tp]}</td>
                      <td className="border px-2 py-1 font-medium">{v.name}</td>
                      <td className="w-full border px-2 py-1 !whitespace-normal">{v.detail}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <button onClick={() => setFlt({ ...flt, page: flt.page - 1 })} disabled={flt.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                ‹
              </button>
              <span className="tabular-nums">
                {flt.page} / {pages}
              </span>
              <button onClick={() => setFlt({ ...flt, page: flt.page + 1 })} disabled={flt.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
                ›
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

'use client'
// URL 모니터링 탭 — 등록 URL 의 현재 상태코드·응답시간 추이(1분 1회, 화면이 열린 동안 + 주기 수집), 상태 요약(전체·성공·리다이렉트·요청 오류·서버 오류·실패), 등록·삭제
import { piFetch } from '@pi/auth/client'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { stsCls, type StsCls } from '@/lib/mon'
import { Spark } from './charts'
import { usePoll } from './use-poll'

type Url = { url_id: string; url_nm: string; chk_url: string; use_yn: string; ver_no: number }
type H = { url_id: string; bkt_dtm: string; sts_no: number; rsp_val: number; err_txt: string | null }
const CLS: Record<StsCls, [string, string]> = {
  OK: ['성공', 'bg-emerald-600'],
  REDIR: ['리다이렉트', 'bg-sky-600'],
  CLIENT: ['요청 오류', 'bg-amber-500'],
  SERVER: ['서버 오류', 'bg-red-600'],
  FAIL: ['실패', 'bg-gray-700'],
}

export default function UrlTab({ areaId, live, min, editor }: { areaId: string; live: boolean; min: number; editor: boolean }) {
  const base = `/api/areas/${areaId}/mon/url`
  const { data, err, reload } = usePoll<{ urls: Url[]; hist: H[] }>(`${base}?min=${min}&live=1`, live, 30_000)
  const [nm, setNm] = useState('')
  const [url, setUrl] = useState('https://')
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const rows = useMemo(
    () =>
      (data?.urls ?? []).map((u) => {
        const hs = (data?.hist ?? []).filter((h) => h.url_id === u.url_id)
        const l = hs[hs.length - 1]
        return { u, l, cls: l ? stsCls(l.sts_no) : null, hs }
      }),
    [data],
  )
  const cnt = (c: StsCls) => rows.filter((r) => r.cls === c).length
  const shown = rows.filter((r) => !q || `${r.u.url_nm} ${r.u.chk_url}`.toLowerCase().includes(q.toLowerCase()))

  async function add() {
    setMsg('')
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url_nm: nm, chk_url: url.trim() }) })).json()
    if (!j.ok) return setMsg(j.message ?? '등록하지 못했습니다')
    setNm('')
    setUrl('https://')
    void reload()
  }
  async function del(u: Url) {
    if (!confirm(`${u.url_nm} 를 모니터링에서 뺄까요?`)) return
    const j = await (await piFetch(`${base}?url=${u.url_id}&ver_no=${u.ver_no}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message ?? '삭제하지 못했습니다')
    void reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="rounded bg-[#3b4a66] px-2 py-0.5 text-white">전체 {rows.length}</span>
        {(Object.keys(CLS) as StsCls[]).map((c) => (
          <span key={c} className={`rounded px-2 py-0.5 text-white ${CLS[c][1]}`}>
            {CLS[c][0]} {cnt(c)}
          </span>
        ))}
        <input className="ml-auto w-44 rounded border px-2 py-1" placeholder="이름·URL 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="URL 검색" />
      </div>
      {editor && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-[#d6deeb] bg-[#f4f7fc] p-2">
          <input className="w-40 rounded border px-2 py-1 text-sm" maxLength={100} placeholder="이름" value={nm} onChange={(e) => setNm(e.target.value)} aria-label="URL 이름" />
          <input className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-sm" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="점검 URL" />
          <button type="button" className="flex items-center gap-1 rounded bg-[#1f3a68] px-3 py-1 text-sm font-semibold text-white disabled:opacity-40" disabled={!nm.trim() || !/^https?:\/\/.+/.test(url.trim())} onClick={() => void add()}>
            <Plus className="h-4 w-4" aria-hidden /> URL 추가
          </button>
        </div>
      )}
      {(msg || err) && <p className="text-sm text-red-700">{msg || err}</p>}
      <p className="text-xs text-[#5b6578]">공인 주소만 점검합니다(사설·내부망 차단). GET 1회, 10초 제한, 리다이렉트는 따라가지 않고 상태 그대로 기록합니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="thead-3d">
            <tr>
              <th className="px-2 py-1">현재 상태</th>
              <th className="px-2 py-1 text-left">이름 / URL</th>
              <th className="px-2 py-1">응답</th>
              <th className="px-2 py-1 text-left">응답 시간 추이(최근 {min}분)</th>
              {editor && <th className="px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ u, l, cls, hs }) => (
              <tr key={u.url_id} className="border-b">
                <td className="px-2 py-1 text-center">
                  {cls ? (
                    <span className={`inline-block min-w-[3rem] rounded px-1.5 py-0.5 font-bold text-white ${CLS[cls][1]}`} title={l?.err_txt ?? CLS[cls][0]}>
                      {l!.sts_no || 'ERR'}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">대기</span>
                  )}
                </td>
                <td className="max-w-[18rem] px-2 py-1">
                  <div className="font-semibold text-[#2c3850]">{u.url_nm}</div>
                  <div className="truncate font-mono text-xs text-[#5b6578]" title={u.chk_url}>
                    {u.chk_url}
                  </div>
                  {l?.err_txt && <div className="text-xs text-red-700">{l.err_txt}</div>}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{l ? `${l.rsp_val}ms` : '—'}</td>
                <td className="px-2 py-1">
                  <Spark pts={hs.map((h) => ({ t: h.bkt_dtm, v: h.rsp_val }))} bad={hs.map((h) => stsCls(h.sts_no) !== 'OK' && stsCls(h.sts_no) !== 'REDIR')} />
                </td>
                {editor && (
                  <td className="px-2 py-1 text-center">
                    <button type="button" className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => void del(u)} aria-label={`${u.url_nm} 삭제`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data && !shown.length && (
              <tr>
                <td colSpan={editor ? 5 : 4} className="px-2 py-4 text-center text-gray-500">
                  {rows.length ? '검색 결과가 없습니다' : '등록된 URL 이 없습니다'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

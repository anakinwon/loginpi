'use client'
// URL 모니터링 탭 — 등록 URL 의 현재 상태코드·응답시간 추이(1분 1회, 화면이 열린 동안 + 주기 수집), 상태 요약(전체·성공·리다이렉트·요청 오류·서버 오류·실패), 등록·삭제
import { piFetch } from '@pi/auth/client'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { InfoTip } from '@/components/page-head'
import { stsCls, type StsCls } from '@/lib/mon'
import { Spark } from './charts'
import { usePoll } from './use-poll'

type Url = { url_id: string; url_nm: string; chk_url: string; use_yn: string; ver_no: number }
type H = { url_id: string; bkt_dtm: string; sts_no: number; rsp_val: number; err_txt: string | null }
// 상태 분류 → 이름·배지 색조(badge data-tone, 2026-11-12 디자인 개편 — 진한 바탕 배지 폐지)
const CLS: Record<StsCls, [string, 'ok' | 'warn' | 'danger' | undefined]> = {
  OK: ['성공', 'ok'],
  REDIR: ['리다이렉트', undefined],
  CLIENT: ['요청 오류', 'warn'],
  SERVER: ['서버 오류', 'danger'],
  FAIL: ['실패', 'danger'],
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
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="badge" data-tone="accent">
          전체 <span className="tabular-nums">{rows.length}</span>
        </span>
        {(Object.keys(CLS) as StsCls[]).map((c) => (
          <span key={c} className="badge" data-tone={CLS[c][1]}>
            {CLS[c][0]} <span className="tabular-nums">{cnt(c)}</span>
          </span>
        ))}
        <InfoTip>공인 주소만 점검합니다(사설·내부망 차단). GET 1회, 10초 제한, 리다이렉트는 따라가지 않고 상태 그대로 기록합니다.</InfoTip>
        <input className="input-sm ms-auto w-44" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="URL 검색" />
      </div>
      {editor && (
        <div className="panel flex flex-wrap items-center gap-2 p-3">
          <input className="input w-40" maxLength={100} placeholder="이름" value={nm} onChange={(e) => setNm(e.target.value)} aria-label="URL 이름" />
          <input className="input min-w-0 flex-1 font-mono" maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="점검 URL" />
          <button type="button" className="btn-3d" disabled={!nm.trim() || !/^https?:\/\/.+/.test(url.trim())} onClick={() => void add()}>
            <Plus aria-hidden /> URL 추가
          </button>
        </div>
      )}
      {(msg || err) && <p role="status" className="text-dense text-danger">{msg || err}</p>}
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[44rem] text-dense">
          <thead className="thead-3d">
            <tr>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2 text-start">이름 / URL</th>
              <th className="px-3 py-2 text-right">응답</th>
              <th className="px-3 py-2 text-start">응답 시간 추이(최근 {min}분)</th>
              {editor && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ u, l, cls, hs }) => (
              <tr key={u.url_id} className="border-b border-line">
                <td className="px-3 py-1 text-center">
                  {cls ? (
                    <span className="badge font-mono" data-tone={CLS[cls][1]} title={l?.err_txt ?? CLS[cls][0]}>
                      {l!.sts_no || 'ERR'}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">대기</span>
                  )}
                </td>
                <td className="max-w-[18rem] px-3 py-1">
                  <div className="font-medium text-ink">{u.url_nm}</div>
                  <div className="truncate font-mono text-xs text-ink-3" title={u.chk_url}>
                    {u.chk_url}
                  </div>
                  {l?.err_txt && <div className="text-xs text-danger">{l.err_txt}</div>}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{l ? `${l.rsp_val}ms` : '—'}</td>
                <td className="px-3 py-1">
                  <Spark pts={hs.map((h) => ({ t: h.bkt_dtm, v: h.rsp_val }))} bad={hs.map((h) => stsCls(h.sts_no) !== 'OK' && stsCls(h.sts_no) !== 'REDIR')} />
                </td>
                {editor && (
                  <td className="px-3 py-1 text-center">
                    <button type="button" className="btn-ghost btn-icon btn-sm hover:text-danger" onClick={() => void del(u)} aria-label={`${u.url_nm} 삭제`} title="삭제">
                      <Trash2 aria-hidden />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data && !shown.length && (
              <tr>
                <td colSpan={editor ? 5 : 4} className="py-6 text-center text-dense text-ink-3">
                  {rows.length ? '검색 결과 없음' : '등록된 URL 없음'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

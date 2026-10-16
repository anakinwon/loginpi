'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 속성 패널(MD3, sql/025) — 등록된 속성(주식별자·필수·용어·물리명·도메인) + 주식별자·필수 속성 추천 체크 목록 → 선택 등록(반자동)
// 추천은 저장하지 않음(GET …/attributes/suggest), 고른 것만 POST …/attributes. 용어 없는 후보는 빨강·체크 불가·용어 신청 링크(표준 선행)
// 물리명은 물리 모델 전환 전까지 항상 대문자(PRD §2.6)
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { confirmSave } from '../words/word-board'

interface Attr {
  attr_id: string
  term_id: string
  pk_yn: string
  pk_seq: number | null
  esntl_yn: string
  fk_rel_id: string | null
  ver_no: number
  std_term: { term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null } | null
}
interface Cand {
  term_log_nm: string
  term_id?: string
  term_phy_nm?: string
  dom_nm?: string | null
  role: 'PK' | 'FK' | 'REQ'
  esntl: boolean
  src: 'industry' | 'rule' | 'inherit'
  reason: string
  missing: boolean
  fk_rel_id?: string
}
const ROLE_NM = { PK: '주식별자', FK: '참조(FK)', REQ: '필수' } as const
const SRC_NM = { industry: '업종', rule: '규칙', inherit: '상속' } as const

export default function Attrs({ api, areaId, entId, entNm, editor }: { api: string; areaId: string; entId: string; entNm: string; editor: boolean }) {
  const base = `${api}/entities/${entId}/attributes`
  const [items, setItems] = useState<Attr[]>([])
  const [sug, setSug] = useState<{ pk: Cand[]; required: Cand[]; warn: string[] }>({ pk: [], required: [], warn: [] })
  const [chk, setChk] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([piFetch(base).then((r) => r.json()), piFetch(`${base}/suggest`).then((r) => r.json())])
    if (a.ok) setItems(a.items)
    if (s.ok) {
      setSug({ pk: s.pk, required: s.required, warn: s.warn })
      // 기본 체크 = 용어가 있는 주식별자·필수 후보(선택 FK 는 해제)
      setChk(new Set([...s.pk, ...s.required].filter((c: Cand) => !c.missing && (c.role === 'PK' || c.esntl)).map((c: Cand) => c.term_log_nm)))
    }
  }, [base])
  useEffect(() => {
    void load()
  }, [load])

  const all = [...sug.pk, ...sug.required]
  const addSel = async () => {
    const list = all.filter((c) => !c.missing && chk.has(c.term_log_nm))
    if (!list.length || !confirmSave(false, `${entNm} 속성 ${list.length}건(${list.map((c) => c.term_log_nm).join(', ')})을 `)) return
    setBusy(true)
    let n = 0
    const fail: string[] = []
    for (const c of list) {
      const j = await (
        await piFetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term_id: c.term_id, pk_yn: c.role === 'PK' ? 'Y' : 'N', esntl_yn: c.esntl ? 'Y' : 'N', fk_rel_id: c.fk_rel_id ?? null }) })
      ).json()
      if (j.ok) n++
      else fail.push(`${c.term_log_nm}(${j.message ?? ''})`)
    }
    setBusy(false)
    setMsg(`속성 ${n}건 등록${fail.length ? ` · 실패 ${fail.join(', ')}` : ''}`)
    void load()
  }
  const patch = async (a: Attr, set: { pk_yn?: string; esntl_yn?: string }) => {
    const j = await (await piFetch(`${base}/${a.attr_id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ver_no: a.ver_no, ...set }) })).json()
    setMsg(j.ok ? '' : j.message)
    void load()
  }
  const del = async (a: Attr) => {
    if (!confirm(`속성 ${a.std_term?.term_log_nm} 을(를) 삭제하시겠습니까?`)) return
    const j = await (await piFetch(`${base}/${a.attr_id}?ver_no=${a.ver_no}`, { method: 'DELETE' })).json()
    setMsg(j.ok ? '속성을 삭제했습니다' : j.message)
    void load()
  }

  const row = (c: Cand) => (
    <li key={`${c.role}-${c.term_log_nm}`} className={`flex items-start gap-2 py-1 ${c.missing ? 'text-red-700' : ''}`} title={c.reason}>
      <input
        type="checkbox"
        className="mt-0.5"
        disabled={c.missing || !editor}
        checked={chk.has(c.term_log_nm)}
        onChange={() => setChk((s) => (s.has(c.term_log_nm) ? new Set([...s].filter((x) => x !== c.term_log_nm)) : new Set([...s, c.term_log_nm])))}
        aria-label={`${c.term_log_nm} 선택`}
      />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">
          {c.role === 'PK' && '🔑 '}
          {c.term_log_nm}
        </span>{' '}
        {!c.missing && <span className="font-mono text-gray-500">{c.term_phy_nm}</span>} <span className="text-gray-500">{c.dom_nm}</span>{' '}
        <span className="rounded bg-gray-100 px-1 text-[0.65rem] text-gray-600">
          {ROLE_NM[c.role]}
          {c.role !== 'PK' && !c.esntl ? '·선택' : ''} · {SRC_NM[c.src]}
        </span>
        {c.missing && (
          <Link href={`/areas/${areaId}/terms?new=${encodeURIComponent(c.term_log_nm)}`} className="ml-1 underline">
            용어 신청 필요
          </Link>
        )}
        <span className="block truncate text-[0.65rem] text-gray-500">{c.reason}</span>
      </span>
    </li>
  )

  return (
    <div className="space-y-2 rounded border border-[#d5ddec] bg-[#f8fafd] p-3 text-xs">
      <table className="w-full border-collapse bg-white">
        <thead>
          <tr className="thead-3d text-center">
            {['PK', '필수', '속성(용어)', '물리명', '도메인', '처리'].map((h) => (
              <th key={h} className="border px-2 py-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} className="border px-2 py-2 text-center text-gray-500">
                등록된 속성이 없습니다 — 아래 추천에서 골라 등록하십시오
              </td>
            </tr>
          ) : (
            items.map((a) => (
              <tr key={a.attr_id}>
                <td className="border px-2 py-1 text-center">
                  {editor ? (
                    <button type="button" onClick={() => void patch(a, { pk_yn: a.pk_yn === 'Y' ? 'N' : 'Y' })} title="주식별자 지정·해제">
                      {a.pk_yn === 'Y' ? `🔑${a.pk_seq}` : '·'}
                    </button>
                  ) : a.pk_yn === 'Y' ? (
                    `🔑${a.pk_seq}`
                  ) : (
                    ''
                  )}
                </td>
                <td className="border px-2 py-1 text-center">
                  <input type="checkbox" disabled={!editor || a.pk_yn === 'Y'} checked={a.esntl_yn === 'Y'} onChange={() => void patch(a, { esntl_yn: a.esntl_yn === 'Y' ? 'N' : 'Y' })} aria-label="필수" />
                </td>
                <td className="border px-2 py-1 font-medium">
                  {a.std_term?.term_log_nm}
                  {a.fk_rel_id && <span className="ml-1 text-gray-500">(상속)</span>}
                </td>
                <td className="border px-2 py-1 font-mono text-[#1f3a68]">{a.std_term?.term_phy_nm}</td>
                <td className="border px-2 py-1">{a.std_term?.std_dom?.dom_nm}</td>
                <td className="border px-2 py-1 text-center">
                  {editor && (
                    <button type="button" onClick={() => void del(a)} className="text-red-700 underline">
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {all.length > 0 && (
        <div className="rounded border border-[#d5ddec] bg-white p-2">
          <p className="mb-1 font-semibold text-[#1f3a68]">주식별자·필수 속성 추천(체크 후 선택 등록, 빨강 = 표준용어 신청 필요, 행에 마우스를 올리면 근거)</p>
          {sug.pk.length > 0 && <ul className="divide-y divide-[#eef2f8]">{sug.pk.map(row)}</ul>}
          {sug.required.length > 0 && <ul className="mt-1 divide-y divide-[#eef2f8] border-t border-[#d5ddec]">{sug.required.map(row)}</ul>}
          {editor && (
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={() => setChk(new Set(all.filter((c) => !c.missing).map((c) => c.term_log_nm)))} className="underline">
                전체 선택
              </button>
              <button type="button" onClick={() => setChk(new Set())} className="underline">
                선택 해제
              </button>
              <button type="button" onClick={() => void addSel()} disabled={busy || !all.some((c) => !c.missing && chk.has(c.term_log_nm))} className="btn-3d ml-auto px-4 py-0.5 disabled:opacity-40">
                선택 등록({all.filter((c) => !c.missing && chk.has(c.term_log_nm)).length})
              </button>
            </div>
          )}
        </div>
      )}
      {sug.warn.map((w) => (
        <p key={w} className="text-amber-700">
          ⚠ {w}
        </p>
      ))}
      {msg && <p className="text-[#1f3a68]">{msg}</p>}
    </div>
  )
}

'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 속성 패널(MD3, sql/025) — 등록된 속성(주식별자·필수·용어·물리명·도메인) + 주식별자·필수 속성 추천 체크 목록 → 선택 등록(반자동)
// 추천은 저장하지 않음(GET …/attributes/suggest), 고른 것만 POST …/attributes. 용어 없는 후보는 빨강·체크 불가·용어 신청 링크(표준 선행)
// 물리명은 물리 모델 전환 전까지 항상 대문자(PRD §2.6). 순서 = ▲▼(주식별자는 앞 묶음 안에서만, 일반 속성은 그 뒤에서만 이동, PUT …/attributes/order)
// 자유 추가·용어 교체 = 승인 표준용어 검색(GET /terms?q=&sts=CNFM, 2글자 이상·0.3초 지연·20건), 없으면 용어 신청. 관계 상속 속성은 용어 교체 잠금(설명만)
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
  attr_desc: string | null
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
  must?: 'name' | 'dt' | 'st'
}
// 필수 4종(마스터 지시 2026-10-17) : 주식별자·주식별자 명칭·행위 일시·행위 상태코드
type Must = { pk: boolean; name: boolean; dt: boolean; st: boolean }
const MUST_NM: Record<keyof Must, string> = { pk: '주식별자', name: '주식별자 명칭', dt: '행위 일시', st: '행위 상태코드' }
const ROLE_NM = { PK: '주식별자', FK: '참조(FK)', REQ: '필수' } as const
const SRC_NM = { industry: '업종', rule: '규칙', inherit: '상속' } as const
const SEARCH = { min: 2, delay: 300, size: 20 }
type Term = { term_id: string; term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null }

// 승인 표준용어 검색 선택 — 고르면 onPick, 결과 없음 = 용어 신청 링크
function TermPick({ api, areaId, picked, onPick, label }: { api: string; areaId: string; picked: Term | null; onPick: (t: Term | null) => void; label: string }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Term[] | null>(null)
  useEffect(() => {
    const k = q.trim()
    if (k.length < SEARCH.min) return setHits(null)
    let live = true
    const t = setTimeout(async () => {
      const j = await (await piFetch(`${api}/terms?${new URLSearchParams({ q: k, sts: 'CNFM', size: String(SEARCH.size) })}`)).json()
      if (live) setHits(j.ok ? j.terms : [])
    }, SEARCH.delay)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [api, q])
  if (picked)
    return (
      <span className="inline-flex items-center gap-1">
        <b>{picked.term_log_nm}</b> <span className="font-mono text-gray-500">{picked.term_phy_nm}</span> <span className="text-gray-500">{picked.std_dom?.dom_nm}</span>
        <button type="button" onClick={() => onPick(null)} className="underline" aria-label="용어 다시 고르기">
          다시
        </button>
      </span>
    )
  return (
    <span className="relative inline-block w-full max-w-sm">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`표준용어 검색(${SEARCH.min}글자 이상, 논리명·물리명)`} className="w-full rounded border px-2 py-0.5" aria-label={label} />
      {hits && (
        <ul className="absolute z-10 mt-0.5 max-h-56 w-full overflow-auto rounded border bg-white shadow">
          {hits.length === 0 ? (
            <li className="px-2 py-1 text-red-700">
              승인된 용어가 없습니다 —{' '}
              <Link href={`/areas/${areaId}/terms?new=${encodeURIComponent(q.trim())}`} className="underline">
                표준용어 신청
              </Link>
            </li>
          ) : (
            hits.map((t) => (
              <li key={t.term_id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(t)
                    setQ('')
                  }}
                  className="w-full px-2 py-1 text-left hover:bg-[#eef2f8]"
                >
                  <b>{t.term_log_nm}</b> <span className="font-mono text-gray-500">{t.term_phy_nm}</span> <span className="text-gray-500">{t.std_dom?.dom_nm}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </span>
  )
}

export default function Attrs({ api, areaId, entId, entNm, editor }: { api: string; areaId: string; entId: string; entNm: string; editor: boolean }) {
  const base = `${api}/entities/${entId}/attributes`
  const [items, setItems] = useState<Attr[]>([])
  const [sug, setSug] = useState<{ pk: Cand[]; required: Cand[]; warn: string[]; must?: Must }>({ pk: [], required: [], warn: [] })
  const [chk, setChk] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  // 자유 추가(검색 용어·PK·필수), 행 수정(용어 교체·설명)
  const [nw, setNw] = useState<{ t: Term | null; pk: boolean; es: boolean }>({ t: null, pk: false, es: true })
  const [ed, setEd] = useState<{ id: string; t: Term | null; desc: string } | null>(null)

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([piFetch(base).then((r) => r.json()), piFetch(`${base}/suggest`).then((r) => r.json())])
    if (a.ok) setItems(a.items)
    if (s.ok) {
      setSug({ pk: s.pk, required: s.required, warn: s.warn, must: s.must })
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
  const patch = async (a: Attr, set: { pk_yn?: string; esntl_yn?: string; term_id?: string; attr_desc?: string | null; propagate?: boolean }) => {
    const j = await (await piFetch(`${base}/${a.attr_id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ver_no: a.ver_no, ...set }) })).json()
    setMsg(j.ok ? (j.propagated || j.propagate_fail?.length ? `자식 FK ${j.propagated}건 함께 변경${j.propagate_fail?.length ? ` · 실패 ${j.propagate_fail.join(', ')}` : ''}` : '') : j.message)
    void load()
    return !!j.ok
  }
  const addOne = async () => {
    if (!nw.t) return
    setBusy(true)
    const j = await (await piFetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term_id: nw.t.term_id, pk_yn: nw.pk ? 'Y' : 'N', esntl_yn: nw.pk || nw.es ? 'Y' : 'N' }) })).json()
    setBusy(false)
    setMsg(j.ok ? `속성 ${nw.t.term_log_nm} 등록` : j.message)
    if (j.ok) setNw({ t: null, pk: false, es: true })
    void load()
  }
  const saveEd = async (a: Attr) => {
    if (!ed) return
    const set: { term_id?: string; attr_desc?: string | null; propagate?: boolean } = {}
    if (ed.t && ed.t.term_id !== a.term_id) set.term_id = ed.t.term_id
    if (ed.desc.trim() !== (a.attr_desc ?? '')) set.attr_desc = ed.desc.trim() || null
    if (!Object.keys(set).length) return setEd(null)
    // 주식별자 용어 교체 : 같은 용어로 상속한 자식 속성 전파 여부(미리보기)
    if (set.term_id && a.pk_yn === 'Y') {
      const hj = await (await piFetch(`${base}/${a.attr_id}`)).json().catch(() => null)
      const heirs: { ent_log_nm: string }[] = hj?.ok ? hj.heirs : []
      if (heirs.length) set.propagate = confirm(`이 주식별자를 상속한 자식 속성 ${heirs.length}건(${heirs.map((h) => h.ent_log_nm).join(', ')})도 ${ed.t?.term_log_nm}(으)로 바꿀까요?\n\n확인 = 함께 변경 / 취소 = 부모만 변경(자식은 FK 점검에서 누락으로 표시)`)
    }
    if (await patch(a, set)) setEd(null)
  }
  // 순서 이동 — 같은 묶음(주식별자 / 일반) 안에서 이웃과 맞바꿔 전체 순서 저장
  const move = async (k: number, d: -1 | 1) => {
    const j = k + d
    if (j < 0 || j >= items.length || items[j].pk_yn !== items[k].pk_yn) return
    const ids = items.map((a) => a.attr_id)
    ;[ids[k], ids[j]] = [ids[j], ids[k]]
    setItems((xs) => ids.map((id) => xs.find((x) => x.attr_id === id)!))
    const r = await (await piFetch(`${base}/order`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) })).json()
    setMsg(r.ok ? '' : r.message)
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
        {(c.role === 'PK' || c.must) && <span className="rounded bg-amber-200 px-1 text-[0.65rem] text-amber-900">필수 4종</span>}{' '}
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
      {sug.must && (
        <p className="flex flex-wrap items-center gap-1" aria-label="필수 4종 점검">
          <span className="font-semibold text-[#1f3a68]">필수 4종 점검 :</span>
          {(Object.keys(MUST_NM) as (keyof Must)[]).map((k) => (
            <span key={k} className={`rounded px-1.5 py-0.5 ${sug.must![k] ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
              {sug.must![k] ? '✓' : '✗'} {MUST_NM[k]}
            </span>
          ))}
        </p>
      )}
      <table className="w-full border-collapse bg-white">
        <thead>
          <tr className="thead-3d text-center">
            {['순서', 'PK', '필수', '속성(용어)', '물리명', '도메인', '처리'].map((h) => (
              <th key={h} className="border px-2 py-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="border px-2 py-2 text-center text-gray-500">
                등록된 속성이 없습니다 — 아래 추천에서 고르거나 표준용어를 검색해 추가하십시오
              </td>
            </tr>
          ) : (
            items.map((a, k) => [
              <tr key={a.attr_id}>
                <td className="border px-1 py-1 text-center whitespace-nowrap">
                  <span className="mr-1 tabular-nums text-gray-500">{k + 1}</span>
                  {editor && (
                    <>
                      <button type="button" onClick={() => void move(k, -1)} disabled={k === 0 || items[k - 1].pk_yn !== a.pk_yn} className="px-0.5 disabled:opacity-20" aria-label={`${a.std_term?.term_log_nm} 위로`} title="위로">
                        ▲
                      </button>
                      <button type="button" onClick={() => void move(k, 1)} disabled={k === items.length - 1 || items[k + 1].pk_yn !== a.pk_yn} className="px-0.5 disabled:opacity-20" aria-label={`${a.std_term?.term_log_nm} 아래로`} title="아래로">
                        ▼
                      </button>
                    </>
                  )}
                </td>
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
                  {a.attr_desc && <span className="block text-[0.65rem] font-normal text-gray-500">{a.attr_desc}</span>}
                </td>
                <td className="border px-2 py-1 font-mono text-[#1f3a68]">{a.std_term?.term_phy_nm}</td>
                <td className="border px-2 py-1">{a.std_term?.std_dom?.dom_nm}</td>
                <td className="border px-2 py-1 text-center">
                  {editor && (
                    <>
                      <button type="button" onClick={() => setEd(ed?.id === a.attr_id ? null : { id: a.attr_id, t: null, desc: a.attr_desc ?? '' })} className="mr-2 underline">
                        수정
                      </button>
                      <button type="button" onClick={() => void del(a)} className="text-red-700 underline">
                        삭제
                      </button>
                    </>
                  )}
                </td>
              </tr>,
              ed?.id === a.attr_id && (
                <tr key={`${a.attr_id}-ed`} className="bg-[#fffbea]">
                  <td colSpan={7} className="border px-2 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">용어</span>
                      {a.fk_rel_id ? (
                        <span className="text-gray-600" title="관계로 상속된 속성은 부모 식별자와 같아야 합니다">
                          🔒 {a.std_term?.term_log_nm} (상속 — 용어 교체 불가, 관계·부모 식별자에서 바꾸십시오)
                        </span>
                      ) : (
                        <TermPick api={api} areaId={areaId} picked={ed.t} onPick={(t) => setEd({ ...ed, t })} label={`${a.std_term?.term_log_nm} 교체 용어 검색`} />
                      )}
                      {!a.fk_rel_id && !ed.t && <span className="text-gray-500">(비우면 {a.std_term?.term_log_nm} 유지 — 자리·PK·필수는 그대로)</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-semibold">설명</span>
                      <input value={ed.desc} onChange={(e) => setEd({ ...ed, desc: e.target.value })} maxLength={4000} className="flex-1 rounded border px-2 py-0.5" aria-label="속성 설명" />
                      <button type="button" onClick={() => void saveEd(a)} className="btn-3d px-3 py-0.5">
                        저장
                      </button>
                      <button type="button" onClick={() => setEd(null)} className="underline">
                        취소
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            ])
          )}
        </tbody>
      </table>
      {editor && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-[#d5ddec] bg-white p-2">
          <span className="font-semibold text-[#1f3a68]">＋ 속성 추가</span>
          <TermPick api={api} areaId={areaId} picked={nw.t} onPick={(t) => setNw({ ...nw, t })} label="추가할 표준용어 검색" />
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={nw.pk} onChange={() => setNw({ ...nw, pk: !nw.pk })} /> 주식별자
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={nw.pk || nw.es} disabled={nw.pk} onChange={() => setNw({ ...nw, es: !nw.es })} /> 필수
          </label>
          <button type="button" onClick={() => void addOne()} disabled={busy || !nw.t} className="btn-3d ml-auto px-4 py-0.5 disabled:opacity-40">
            추가
          </button>
        </div>
      )}
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

'use client'
// 개념 모델 화면(PRD §2.5 MD1) — 상단 프로젝트(여러 개) 선택·등록, 그 아래 왼쪽 주제영역(2레벨·약어 3자) 트리·등록·수정·삭제, 오른쪽 선택 주제영역의 핵심 엔터티 등록(표준단어 분해 → 논리명·물리 테이블명 미리보기)·목록
// 주제영역명 입력 시 약어 3자·설명 자동 채움(/subjects/suggest, 저장 안 함), 선택 주제영역의 핵심 엔터티 추천 칩(누르면 엔터티명 채움)
// 엔터티 이름은 승인완료 표준단어로만 생성(미등록 단어는 표준단어 신청), 끝 단어 엔터티 분류어 → 테이블 접미어(TB_주제영역_단어_접미어)
import Link from 'next/link'
import { use, useCallback, useEffect, useRef, useState } from 'react'
import { can, type MbrRole } from '@/lib/roles'
import { ActorCells, noEnterSubmit } from '../words/word-board'

interface Prj {
  prj_id: string
  prj_nm: string
  prj_desc: string | null
  sort_seq: number
  ver_no: number
}
interface Subj {
  prj_id: string
  subj_id: string
  up_subj_id: string | null
  subj_nm: string
  subj_abbr_nm: string
  subj_desc: string | null
  sort_seq: number
  ver_no: number
}
interface Ent {
  ent_id: string
  ent_log_nm: string
  ent_tp_cd: string
  ent_desc: string | null
  ver_no: number
  tbl_phy_nm: string
  too_long: boolean
  words: { dic_log_nm: string; ok: boolean }[]
  mdl_subj: { subj_nm: string; subj_abbr_nm: string }
  regr_nm?: string | null
  reg_dtm: string
}
interface Cand {
  segments: ({ word: { dic_log_nm: string } } | { unknown: string })[]
  complete: boolean
  ent_log_nm?: string
  tbl_phy_nm?: string
  too_long?: boolean
  dic_ids?: string[]
  dup?: boolean
  rule_error?: string | null
}
const TP_NM: Record<string, string> = { BASE: '실체·기준', ACT: '행위', AGG: '집계' }
const RULE_MSG: Record<string, string> = { ENT_FORBIDDEN_WORD: '금칙어 포함', ENT_LAST_ATTR: '속성 분류어(도메인 단어)로 끝남 : 테이블명은 속성 불필요', ENT_AGG_SUFFIX: "집계 엔터티는 '집계'로 끝나야 함" }
const SUBJ0 = { subj_nm: '', subj_abbr_nm: '', up_subj_id: '', subj_desc: '', sort_seq: '1' }

export default function ModelPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const api = `/api/areas/${areaId}`
  const [role, setRole] = useState<MbrRole | null>(null)
  const [subjs, setSubjs] = useState<Subj[]>([])
  const [sel, setSel] = useState<Subj | null>(null)
  const [prjs, setPrjs] = useState<Prj[]>([])
  const [prj, setPrj] = useState<Prj | null>(null)
  const [pf, setPf] = useState({ prj_nm: '', prj_desc: '' })
  const [pEdit, setPEdit] = useState<Prj | null>(null)
  const [chk, setChk] = useState<Set<string>>(new Set())
  const [sf, setSf] = useState(SUBJ0)
  const [sEdit, setSEdit] = useState<Subj | null>(null)
  const [ents, setEnts] = useState<Ent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [ef, setEf] = useState({ name: '', tp: 'BASE', desc: '' })
  const [cands, setCands] = useState<Cand[]>([])
  const [pick, setPick] = useState(0)
  const [msg, setMsg] = useState('')
  // 자동 채움 : 출처·약어 대안·직전 채운 값(입력자가 고친 칸은 덮어쓰지 않음), 선택 주제영역 엔터티 추천
  const [sug, setSug] = useState<{ busy: boolean; src: string[]; alts: string[]; isWord: boolean | null }>({ busy: false, src: [], alts: [], isWord: null })
  const lastFill = useRef<{ subj_abbr_nm: string; subj_desc: string }>({ subj_abbr_nm: '', subj_desc: '' })
  const [entSug, setEntSug] = useState<{ ent_log_nm: string; tbl_phy_nm: string; dic_ids: string[] }[]>([])
  // 프로젝트 목록 — 처음에는 첫 프로젝트 선택
  const loadPrj = useCallback(async () => {
    const j = await (await fetch(`${api}/projects`)).json()
    if (!j.ok) return
    setPrjs(j.items)
    setPrj((p) => j.items.find((x: Prj) => x.prj_id === p?.prj_id) ?? j.items[0] ?? null)
  }, [api])
  useEffect(() => {
    loadPrj()
  }, [loadPrj])
  useEffect(() => {
    fetch(api)
      .then((r) => r.json())
      .then((j) => j.ok && setRole(j.role))
  }, [api])
  const editor = !!role && can(role, 'REQUEST')

  const loadSubj = useCallback(async () => {
    const j = await (await fetch(`${api}/subjects`)).json()
    if (j.ok) setSubjs(j.items)
  }, [api])
  useEffect(() => {
    loadSubj()
  }, [loadSubj])
  const loadEnt = useCallback(async () => {
    if (!prj) return (setEnts([]), setTotal(0))
    const sp = new URLSearchParams({ page: String(page), size: '20', prj: prj.prj_id, ...(sel ? { subj: sel.subj_id } : {}) })
    const j = await (await fetch(`${api}/entities?${sp}`)).json()
    if (j.ok) {
      setEnts(j.items)
      setTotal(j.total)
    }
  }, [api, sel, page, prj])
  useEffect(() => {
    loadEnt()
  }, [loadEnt])
  // 엔터티명 입력 시 분해 후보(0.4초 지연)
  useEffect(() => {
    const nm = ef.name.trim()
    if (!nm) return setCands([])
    const t = setTimeout(async () => {
      const j = await (await fetch(`${api}/entities/analyze?${new URLSearchParams({ name: nm, tp: ef.tp, ...(sel ? { subj: sel.subj_id } : {}) })}`)).json()
      if (j.ok) {
        setCands(j.candidates)
        setPick(0)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [ef.name, ef.tp, sel, api])

  // 주제영역명 입력 시 자동 채움(0.6초 지연, 등록 모드만)
  useEffect(() => {
    const nm = sf.subj_nm.trim()
    if (sEdit || !nm) return setSug({ busy: false, src: [], alts: [], isWord: null })
    let live = true
    const t = setTimeout(async () => {
      setSug((s) => ({ ...s, busy: true }))
      const j = await (await fetch(`${api}/subjects/suggest?${new URLSearchParams({ nm, ...(prj ? { prj: prj.prj_id } : {}) })}`)).json().catch(() => null)
      if (!live || !j?.ok) return setSug({ busy: false, src: [], alts: [], isWord: null })
      const prev = lastFill.current
      const fill = { subj_abbr_nm: j.fill.subj_abbr_nm ?? '', subj_desc: j.fill.subj_desc ?? '' }
      lastFill.current = fill
      setSf((f) => ({
        ...f,
        subj_abbr_nm: f.subj_abbr_nm === '' || f.subj_abbr_nm === prev.subj_abbr_nm ? fill.subj_abbr_nm : f.subj_abbr_nm,
        subj_desc: f.subj_desc === '' || f.subj_desc === prev.subj_desc ? fill.subj_desc : f.subj_desc,
      }))
      setSug({ busy: false, src: j.src, alts: j.abbr_alts, isWord: j.is_word })
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [sf.subj_nm, sEdit, api, prj])
  // 선택 주제영역의 핵심 엔터티 추천(주제영역 단어 + 상세·이력·상태이력, 주제영역명으로 시작하는 복합어)
  useEffect(() => {
    if (!sel) return setEntSug([])
    fetch(`${api}/subjects/suggest?${new URLSearchParams({ nm: sel.subj_nm, prj: sel.prj_id, abbr: sel.subj_abbr_nm })}`)
      .then((r) => r.json())
      .then((j) => j.ok && (setEntSug(j.ents), setChk(new Set())))
  }, [sel, api, ents])

  const roots = subjs.filter((s) => s.prj_id === prj?.prj_id && !s.up_subj_id)
  const kids = (id: string) => subjs.filter((s) => s.up_subj_id === id)
  // 추천 엔터티 선택 추가 — 확인 1회 후 차례로 등록(결과 건수 표시)
  const addSug = async () => {
    const list = entSug.filter((e) => chk.has(e.ent_log_nm))
    if (!sel || !list.length || !confirm(`추천 엔터티 ${list.length}건(${list.map((e) => e.ent_log_nm).join(', ')})을 '${sel.subj_nm}'에 추가하시겠습니까?`)) return
    let n = 0
    const fail: string[] = []
    for (const e of list) {
      const j = await (await fetch(`${api}/entities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subj_id: sel.subj_id, dic_ids: e.dic_ids, ent_tp_cd: 'BASE' }) })).json()
      if (j.ok) n++
      else fail.push(`${e.ent_log_nm}(${j.message ?? ''})`)
    }
    setMsg(`추천 엔터티 ${n}건 추가${fail.length ? ` · 실패 ${fail.join(', ')}` : ''}`)
    loadEnt()
  }
  const savePrj = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = { prj_nm: pf.prj_nm.trim(), prj_desc: pf.prj_desc.trim() || null }
    if (!body.prj_nm || !confirm(pEdit ? `프로젝트 '${pEdit.prj_nm}' 수정 내용을 저장하시겠습니까?` : `프로젝트 '${body.prj_nm}'을(를) 등록하시겠습니까?`)) return
    const j = await (await fetch(pEdit ? `${api}/projects/${pEdit.prj_id}` : `${api}/projects`, { method: pEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pEdit ? { ...body, ver_no: pEdit.ver_no } : body) })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`프로젝트 ${body.prj_nm} ${pEdit ? '수정' : '등록'} 완료`)
    setPf({ prj_nm: '', prj_desc: '' })
    setPEdit(null)
    if (!pEdit) setPrj(j.item)
    loadPrj()
  }
  const delPrj = async () => {
    if (!prj || !confirm(`프로젝트 '${prj.prj_nm}'을(를) 삭제하시겠습니까?`)) return
    const j = await (await fetch(`${api}/projects/${prj.prj_id}?ver_no=${prj.ver_no}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setPrj(null)
    setSel(null)
    loadPrj()
  }
  const cur = cands[pick]
  const okCand = !!sel && !!cur?.complete && !cur.rule_error && !cur.dup

  const saveSubj = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prj) return
    const body = { prj_id: prj.prj_id, subj_nm: sf.subj_nm.trim(), subj_abbr_nm: sf.subj_abbr_nm.trim(), up_subj_id: sf.up_subj_id || null, subj_desc: sf.subj_desc.trim() || null, sort_seq: Number(sf.sort_seq) || 1 }
    if (!confirm(sEdit ? `주제영역 '${sEdit.subj_nm}' 수정 내용을 저장하시겠습니까?` : `주제영역 '${body.subj_nm}(${body.subj_abbr_nm.toUpperCase()})'을(를) 등록하시겠습니까?`)) return
    const j = await (await fetch(sEdit ? `${api}/subjects/${sEdit.subj_id}` : `${api}/subjects`, { method: sEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sEdit ? { ...body, ver_no: sEdit.ver_no } : body) })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`주제영역 ${body.subj_nm} ${sEdit ? '수정' : '등록'} 완료`)
    setSf(SUBJ0)
    setSEdit(null)
    lastFill.current = { subj_abbr_nm: '', subj_desc: '' }
    loadSubj()
  }
  const delSubj = async (s: Subj) => {
    if (!confirm(`주제영역 '${s.subj_nm}'을(를) 삭제하시겠습니까?`)) return
    const j = await (await fetch(`${api}/subjects/${s.subj_id}?ver_no=${s.ver_no}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    if (sel?.subj_id === s.subj_id) setSel(null)
    loadSubj()
  }
  const saveEnt = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!okCand || !sel || !cur?.dic_ids) return
    if (!confirm(`엔터티 '${cur.ent_log_nm}'(${cur.tbl_phy_nm})을(를) 주제영역 '${sel.subj_nm}'에 등록하시겠습니까?`)) return
    const j = await (await fetch(`${api}/entities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subj_id: sel.subj_id, dic_ids: cur.dic_ids, ent_tp_cd: ef.tp, ent_desc: ef.desc.trim() || null }) })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`엔터티 ${cur.ent_log_nm} 등록 완료`)
    setEf({ name: '', tp: ef.tp, desc: '' })
    loadEnt()
  }
  const delEnt = async (x: Ent) => {
    if (!confirm(`엔터티 '${x.ent_log_nm}'을(를) 삭제하시겠습니까?`)) return
    const j = await (await fetch(`${api}/entities/${x.ent_id}?ver_no=${x.ver_no}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    loadEnt()
  }
  const subjRow = (s: Subj, lvl: number) => (
    <li key={s.subj_id} className={`flex items-center gap-1 rounded px-2 py-1 ${sel?.subj_id === s.subj_id ? 'bg-[#1f3a68] text-white' : 'hover:bg-[#e9eff9]'}`} style={{ paddingLeft: 8 + lvl * 16 }}>
      <button onClick={() => (setSel(s), setPage(1))} className="flex-1 text-left">
        {s.subj_nm} <span className="font-mono text-xs opacity-70">{s.subj_abbr_nm}</span>
      </button>
      {editor && (
        <>
          <button onClick={() => (setSEdit(s), setSf({ subj_nm: s.subj_nm, subj_abbr_nm: s.subj_abbr_nm, up_subj_id: s.up_subj_id ?? '', subj_desc: s.subj_desc ?? '', sort_seq: String(s.sort_seq) }))} className="text-xs underline opacity-80">
            수정
          </button>
          <button onClick={() => delSubj(s)} className="text-xs underline opacity-80">
            삭제
          </button>
        </>
      )}
    </li>
  )

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">개념 모델</h1>
      <p className="mt-1 text-sm text-gray-600">주제영역을 먼저 정의하고, 주제영역별 핵심 엔터티를 표준단어로 만듭니다(정의서 §8.4 : 주제영역 2레벨·약어 3자, 엔터티명 = 엔터티 정의 + 데이터 성격).</p>
      <form onSubmit={savePrj} onKeyDown={noEnterSubmit} className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-3 text-sm text-white shadow-md">
        <span className="font-semibold">프로젝트</span>
        <select value={prj?.prj_id ?? ''} onChange={(e) => (setPrj(prjs.find((p) => p.prj_id === e.target.value) ?? null), setSel(null), setPage(1))} className="rounded px-2 py-1 text-gray-900" aria-label="프로젝트 선택">
          {prjs.length === 0 && <option value="">프로젝트를 먼저 등록하십시오</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        {prj?.prj_desc && <span className="text-xs opacity-80">{prj.prj_desc}</span>}
        {editor && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <input value={pf.prj_nm} onChange={(e) => setPf({ ...pf, prj_nm: e.target.value })} placeholder={pEdit ? '프로젝트명' : '새 프로젝트명'} maxLength={100} className="w-40 rounded px-2 py-1 text-gray-900" aria-label="프로젝트명" />
            <input value={pf.prj_desc} onChange={(e) => setPf({ ...pf, prj_desc: e.target.value })} placeholder="설명" maxLength={4000} className="w-48 rounded px-2 py-1 text-gray-900" aria-label="프로젝트 설명" />
            <button disabled={!pf.prj_nm.trim()} className="btn-3d px-4 disabled:opacity-40">
              {pEdit ? '수정 저장' : '프로젝트 등록'}
            </button>
            {pEdit ? (
              <button type="button" onClick={() => (setPEdit(null), setPf({ prj_nm: '', prj_desc: '' }))} className="underline">
                취소
              </button>
            ) : (
              prj && (
                <>
                  <button type="button" onClick={() => (setPEdit(prj), setPf({ prj_nm: prj.prj_nm, prj_desc: prj.prj_desc ?? '' }))} className="underline">
                    수정
                  </button>
                  <button type="button" onClick={delPrj} className="underline">
                    삭제
                  </button>
                </>
              )
            )}
          </span>
        )}
      </form>
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}
      <div className="mt-4 grid gap-6 md:grid-cols-[18rem_1fr]">
        <aside className="space-y-3">
          <div className="rounded-xl border border-[#c7d2e6] bg-white p-3 text-sm shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-[#1f3a68]">주제영역</h2>
              <button onClick={() => (setSel(null), setPage(1))} className="text-xs text-blue-700 underline">
                전체 엔터티
              </button>
            </div>
            {roots.length === 0 ? (
              <p className="text-gray-500">등록된 주제영역이 없습니다</p>
            ) : (
              <ul className="space-y-0.5">{roots.flatMap((r) => [subjRow(r, 0), ...kids(r.subj_id).map((k) => subjRow(k, 1))])}</ul>
            )}
          </div>
          <form onSubmit={saveSubj} onKeyDown={noEnterSubmit} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
            <h2 className={`px-4 py-2 font-semibold text-white ${sEdit ? 'bg-gradient-to-r from-[#b45309] to-[#d97706]' : 'bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e]'}`}>{sEdit ? `주제영역 수정 : ${sEdit.subj_nm}` : '주제영역 등록'}</h2>
            <fieldset disabled={!editor || !prj} className="space-y-2 p-3 disabled:opacity-60 [&_input]:w-full [&_input]:rounded [&_input]:border [&_input]:border-[#b8c6e0] [&_input]:bg-white [&_input]:px-2 [&_input]:py-1">
              <select value={sf.up_subj_id} onChange={(e) => setSf({ ...sf, up_subj_id: e.target.value })} className="w-full rounded border border-[#b8c6e0] bg-white px-2 py-1" aria-label="상위 주제영역">
                <option value="">1레벨(상위 없음)</option>
                {roots
                  .filter((r) => r.subj_id !== sEdit?.subj_id)
                  .map((r) => (
                    <option key={r.subj_id} value={r.subj_id}>
                      {r.subj_nm} 아래(2레벨)
                    </option>
                  ))}
              </select>
              <input value={sf.subj_nm} onChange={(e) => setSf({ ...sf, subj_nm: e.target.value })} placeholder="주제영역명(단수형 명사)" maxLength={100} required />
              {!sEdit && sf.subj_nm.trim() && (
                <p className="text-xs text-[#1f3a68]">
                  {sug.busy ? '자동 채움 조회 중…' : sug.src.length ? `자동 채움(확인 후 등록) : ${sug.src.join(' / ')}` : '자동 채움 근거 없음 : 직접 입력하십시오'}
                  {sug.isWord === false && (
                    <span className="block font-medium text-red-700">
                      표준단어에 없는 이름이라 등록할 수 없습니다 :{' '}
                      <Link href={`/areas/${areaId}/words?new=${encodeURIComponent(sf.subj_nm.trim())}`} className="underline">
                        표준단어 등록
                      </Link>{' '}
                      후 승인되면 등록할 수 있습니다
                    </span>
                  )}
                </p>
              )}
              <input value={sf.subj_abbr_nm} onChange={(e) => setSf({ ...sf, subj_abbr_nm: e.target.value })} placeholder="약어 영문 3자(예 : CCS)" maxLength={3} pattern="[A-Za-z]{3}" required className="font-mono uppercase" />
              {!sEdit && sug.alts.length > 0 && (
                <p className="flex flex-wrap items-center gap-1 text-xs text-gray-600">
                  다른 약어 :
                  {sug.alts.map((a) => (
                    <button key={a} type="button" onClick={() => setSf((f) => ({ ...f, subj_abbr_nm: a }))} className="rounded border border-[#b8c6e0] bg-white px-1.5 font-mono hover:bg-[#e9eff9]">
                      {a}
                    </button>
                  ))}
                </p>
              )}
              <input value={sf.subj_desc} onChange={(e) => setSf({ ...sf, subj_desc: e.target.value })} placeholder="설명" maxLength={4000} />
              <input value={sf.sort_seq} onChange={(e) => setSf({ ...sf, sort_seq: e.target.value })} type="number" min={1} max={9999} aria-label="정렬순서" />
              <div className="flex justify-end gap-2">
                {sEdit && (
                  <button type="button" onClick={() => (setSEdit(null), setSf(SUBJ0))} className="rounded border bg-white px-3 py-1">
                    취소
                  </button>
                )}
                <button disabled={!sEdit && (sug.busy || sug.isWord === false)} className="btn-3d px-5 disabled:opacity-40">
                  {sEdit ? '수정 저장' : '등록'}
                </button>
              </div>
            </fieldset>
          </form>
        </aside>

        <section className="space-y-4">
          <form onSubmit={saveEnt} onKeyDown={noEnterSubmit} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
            <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">핵심 엔터티 등록 {sel ? `: ${sel.subj_nm}(${sel.subj_abbr_nm})` : ''}</h2>
            <fieldset disabled={!editor || !sel} className="p-5 disabled:opacity-60">
              {!sel && <p className="mb-2 text-gray-600">왼쪽에서 주제영역을 먼저 선택하십시오(엔터티는 주제영역에 속해야 합니다)</p>}
              {sel && entSug.length > 0 && (
                <div className="mb-3 rounded border border-[#d5ddec] bg-white p-2 text-xs text-gray-700">
                  <p className="mb-1 font-semibold text-[#1f3a68]">추천 핵심 엔터티(표준단어 기준) : 체크 후 추가, 이름을 누르면 아래 입력칸에 채움</p>
                  <div className="flex flex-wrap gap-2">
                    {entSug.map((e) => (
                      <label key={e.ent_log_nm} className="flex items-center gap-1 rounded border border-[#b8c6e0] px-1.5 py-0.5">
                        <input type="checkbox" checked={chk.has(e.ent_log_nm)} onChange={() => setChk((c) => (c.has(e.ent_log_nm) ? new Set([...c].filter((x) => x !== e.ent_log_nm)) : new Set([...c, e.ent_log_nm])))} />
                        <button type="button" onClick={() => setEf((f) => ({ ...f, name: e.ent_log_nm }))} className="hover:underline">
                          {e.ent_log_nm}
                        </button>
                        <span className="font-mono text-gray-500">{e.tbl_phy_nm}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setChk(new Set(entSug.map((e) => e.ent_log_nm)))} className="underline">
                      전체 선택
                    </button>
                    <button type="button" onClick={addSug} disabled={!chk.size} className="btn-3d px-4 py-0.5 disabled:opacity-40">
                      선택 추가({chk.size})
                    </button>
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-4">
                <input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} placeholder="엔터티명(예 : 고객등급이력)" maxLength={200} className="rounded border border-[#b8c6e0] bg-white px-3 py-2 md:col-span-2" aria-label="엔터티명" />
                <select value={ef.tp} onChange={(e) => setEf({ ...ef, tp: e.target.value })} className="rounded border border-[#b8c6e0] bg-white px-3 py-2" aria-label="엔터티 유형">
                  {Object.entries(TP_NM).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <input value={ef.desc} onChange={(e) => setEf({ ...ef, desc: e.target.value })} placeholder="설명(관리하는 데이터)" maxLength={4000} className="rounded border border-[#b8c6e0] bg-white px-3 py-2" aria-label="설명" />
              </div>
              {cands.length > 0 && (
                <div className="mt-3 space-y-1">
                  {cands.map((c, i) => (
                    <label key={i} className={`flex cursor-pointer flex-wrap items-center gap-2 rounded border px-3 py-1.5 ${i === pick ? 'border-[#1f3a68] bg-white' : 'border-transparent'}`}>
                      <input type="radio" checked={i === pick} onChange={() => setPick(i)} />
                      {c.segments.map((s, k) =>
                        'word' in s ? (
                          <span key={k} className="rounded bg-[#e9eff9] px-1.5">
                            {s.word.dic_log_nm}
                          </span>
                        ) : (
                          <span key={k} className="rounded bg-red-100 px-1.5 text-red-700">
                            {s.unknown}(미등록)
                          </span>
                        ),
                      )}
                      {c.complete && (
                        <span className="font-mono text-[#1f3a68]">
                          → {c.tbl_phy_nm}
                          {c.too_long && <span className="ml-1 text-amber-700">(25자 초과)</span>}
                        </span>
                      )}
                      {c.rule_error && <span className="text-red-700">{RULE_MSG[c.rule_error] ?? c.rule_error}</span>}
                      {c.dup && <span className="text-red-700">같은 이름의 엔터티 있음</span>}
                    </label>
                  ))}
                  {cur && !cur.complete && (
                    <p className="text-red-700">
                      미등록 단어가 있습니다 :{' '}
                      <Link href={`/areas/${areaId}/words`} className="underline">
                        표준단어 신청
                      </Link>
                    </p>
                  )}
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <button disabled={!okCand} className="btn-3d px-8 disabled:opacity-40">
                  등록
                </button>
              </div>
            </fieldset>
          </form>

          <table className="w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap [&_.text-xs]:text-[0.6rem]">
            <thead>
              <tr className="thead-3d text-center">
                {['#', '엔터티명', '물리 테이블명', '유형', '주제영역', '설명', '등록자', '등록일시', '처리'].map((h) => (
                  <th key={h} className="border px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border px-2 py-4 text-center text-gray-500">
                    등록된 엔터티가 없습니다
                  </td>
                </tr>
              ) : (
                ents.map((x, i) => (
                  <tr key={x.ent_id} className="hover:bg-gray-50">
                    <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{(page - 1) * 20 + i + 1}</td>
                    <td className="border px-2 py-1 font-medium" title={x.words.map((w) => w.dic_log_nm).join('+')}>
                      {x.ent_log_nm}
                      {x.words.some((w) => !w.ok) && <span className="ml-1 text-red-700">(구성 단어 미확정)</span>}
                    </td>
                    <td className="border px-2 py-1 font-mono text-[#1f3a68]">
                      {x.tbl_phy_nm}
                      {x.too_long && <span className="ml-1 text-amber-700">25자 초과</span>}
                    </td>
                    <td className="border px-2 py-1 text-center">{TP_NM[x.ent_tp_cd]}</td>
                    <td className="border px-2 py-1">
                      {x.mdl_subj.subj_nm} <span className="font-mono text-gray-500">{x.mdl_subj.subj_abbr_nm}</span>
                    </td>
                    <td className="w-[30%] border px-2 py-1 !whitespace-normal">{x.ent_desc}</td>
                    <ActorCells nm={x.regr_nm} d={x.reg_dtm} />
                    <td className="border px-2 py-1 text-center">
                      {editor && (
                        <button onClick={() => delEnt(x)} className="text-red-700 underline">
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="text-gray-600">총 {total.toLocaleString()}건</span>
            <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
              ‹
            </button>
            <span className="tabular-nums">{page}</span>
            <button onClick={() => setPage(page + 1)} disabled={page * 20 >= total} className="rounded border px-2 py-1 disabled:opacity-30">
              ›
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

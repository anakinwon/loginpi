'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 관계 화면(PRD §2.5 MD1 잔여) — 선택 프로젝트의 관계 목록·등록·수정·삭제. 부모·자식 = 프로젝트 엔터티 선택, 카디널리티·식별·선택성, IE 표기 미리보기
// 규칙 위반(N:M·자기참조 식별, 식별+부모 선택)은 입력 중 표시·등록 버튼 비활성(서버가 같은 규칙으로 재검증)
import { useCallback, useEffect, useState } from 'react'
import { CRDN, relError, relNotation } from '@/lib/model-rel'
import { ActorCells, confirmSave, noEnterSubmit } from '../words/word-board'

interface EntOpt {
  ent_id: string
  ent_log_nm: string
  mdl_subj: { subj_nm: string }
}
interface Rel {
  rel_id: string
  prnt_ent_id: string
  chld_ent_id: string
  rel_nm: string | null
  crdn_cd: string
  idnt_yn: string
  prnt_opt_yn: string
  chld_opt_yn: string
  rel_desc: string | null
  ver_no: number
  notation: string
  prnt: { ent_log_nm: string }
  chld: { ent_log_nm: string }
  regr_nm?: string | null
  reg_dtm: string
}
const F0 = { prnt_ent_id: '', chld_ent_id: '', rel_nm: '', crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'N', chld_opt_yn: 'Y', rel_desc: '' }
const RULE_MSG: Record<string, string> = { REL_NM_IDNT: 'N:M 관계는 식별 불가', REL_SELF_IDNT: '자기참조는 식별 불가', REL_IDNT_OPT: '식별 관계는 부모 필수' }
const SIZE = 20

export default function Relations({ api, prjId, editor, entsKey }: { api: string; prjId: string; editor: boolean; entsKey: unknown }) {
  const [opts, setOpts] = useState<EntOpt[]>([])
  const [rels, setRels] = useState<Rel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [f, setF] = useState(F0)
  const [edit, setEdit] = useState<Rel | null>(null)
  const [msg, setMsg] = useState('')

  // 프로젝트 엔터티 선택지(엔터티 등록·삭제 시 다시 조회)
  useEffect(() => {
    piFetch(`${api}/entities?${new URLSearchParams({ prj: prjId, size: '1000' })}`)
      .then((r) => r.json())
      .then((j) => j.ok && setOpts(j.items))
  }, [api, prjId, entsKey])
  const load = useCallback(async () => {
    const j = await (await piFetch(`${api}/relations?${new URLSearchParams({ prj: prjId, page: String(page), size: String(SIZE) })}`)).json()
    if (j.ok) {
      setRels(j.items)
      setTotal(j.total)
    }
  }, [api, prjId, page])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    setPage(1)
    setEdit(null)
    setF(F0)
  }, [prjId])

  const rule = f.prnt_ent_id && f.chld_ent_id ? relError(f) : null
  const ready = !!f.prnt_ent_id && !!f.chld_ent_id && !rule
  const nm = (id: string) => opts.find((o) => o.ent_id === id)?.ent_log_nm ?? '?'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || !confirmSave(!!edit, '관계를 ')) return
    const body = { ...f, rel_nm: f.rel_nm || null, rel_desc: f.rel_desc || null }
    const r = edit
      ? await piFetch(`${api}/relations/${edit.rel_id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ver_no: edit.ver_no }) })
      : await piFetch(`${api}/relations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json()
    setMsg(j.ok ? (edit ? '관계를 수정했습니다' : '관계를 등록했습니다') : j.message)
    if (j.ok) {
      setF(F0)
      setEdit(null)
      load()
    }
  }
  const startEdit = (x: Rel) => {
    setEdit(x)
    setF({ prnt_ent_id: x.prnt_ent_id, chld_ent_id: x.chld_ent_id, rel_nm: x.rel_nm ?? '', crdn_cd: x.crdn_cd, idnt_yn: x.idnt_yn, prnt_opt_yn: x.prnt_opt_yn, chld_opt_yn: x.chld_opt_yn, rel_desc: x.rel_desc ?? '' })
    setMsg('')
  }
  const del = async (x: Rel) => {
    if (!confirm(`관계 ${x.prnt.ent_log_nm} → ${x.chld.ent_log_nm} 을(를) 삭제하시겠습니까?`)) return
    const j = await (await piFetch(`${api}/relations/${x.rel_id}?ver_no=${x.ver_no}`, { method: 'DELETE' })).json()
    setMsg(j.ok ? '관계를 삭제했습니다' : j.message)
    if (j.ok) load()
  }
  const sel = (k: 'prnt_ent_id' | 'chld_ent_id', label: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-600">{label}</span>
      <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rounded border px-2 py-1">
        <option value="">선택</option>
        {opts.map((o) => (
          <option key={o.ent_id} value={o.ent_id}>
            {o.ent_log_nm} ({o.mdl_subj.subj_nm})
          </option>
        ))}
      </select>
    </label>
  )
  const yn = (k: 'idnt_yn' | 'prnt_opt_yn' | 'chld_opt_yn', label: string) => (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={f[k] === 'Y'} onChange={(e) => setF({ ...f, [k]: e.target.checked ? 'Y' : 'N' })} />
      {label}
    </label>
  )

  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-bold">엔터티 관계</h2>
      <p className="text-sm text-gray-600">부모(1쪽) → 자식(N쪽). 식별 관계 = 부모 식별자가 자식 식별자의 일부(실선), 비식별 = 점선. N:M·자기참조는 비식별만, 식별이면 부모 필수.</p>
      {editor && (
        <form onSubmit={save} onKeyDown={noEnterSubmit} className="rounded-xl border border-[#c7d2e6] bg-white p-4 text-sm shadow-md">
          <div className={`-m-4 mb-4 rounded-t-xl px-4 py-2 font-semibold text-white ${edit ? 'bg-[#c2410c]' : 'bg-[#1f3a68]'}`}>{edit ? '관계 수정' : '관계 등록'}</div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
            {sel('prnt_ent_id', '부모 엔터티')}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-600">카디널리티</span>
              <select value={f.crdn_cd} onChange={(e) => setF({ ...f, crdn_cd: e.target.value })} className="rounded border px-2 py-1">
                {Object.entries(CRDN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {sel('chld_ent_id', '자식 엔터티')}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {yn('idnt_yn', '식별 관계')}
            {yn('prnt_opt_yn', '부모 선택(자식에 부모 없을 수 있음)')}
            {yn('chld_opt_yn', '자식 선택(부모에 자식 0건 가능)')}
            <input value={f.rel_nm} onChange={(e) => setF({ ...f, rel_nm: e.target.value })} placeholder="관계명(동사구, 선택)" maxLength={100} className="rounded border px-2 py-1" />
          </div>
          <textarea value={f.rel_desc} onChange={(e) => setF({ ...f, rel_desc: e.target.value })} placeholder="관계 설명" rows={2} className="mt-3 w-full rounded border px-2 py-1" />
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[#1f3a68]">
              {f.prnt_ent_id && f.chld_ent_id ? `${nm(f.prnt_ent_id)} ${relNotation(f)} ${nm(f.chld_ent_id)}` : ''}
              {rule && <span className="ml-2 font-sans text-red-700">{RULE_MSG[rule] ?? rule}</span>}
            </span>
            <span className="flex gap-2">
              {edit && (
                <button type="button" onClick={() => (setEdit(null), setF(F0))} className="rounded border px-4 py-1">
                  취소
                </button>
              )}
              <button disabled={!ready} className="btn-3d px-8 disabled:opacity-40">
                {edit ? '저장' : '등록'}
              </button>
            </span>
          </div>
        </form>
      )}
      {msg && <p className="text-sm text-blue-800">{msg}</p>}
      <table className="w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap">
        <thead>
          <tr className="thead-3d text-center">
            {['#', '부모 엔터티', '관계', '자식 엔터티', '관계명', '식별', '설명', '등록자', '등록일시', '처리'].map((h) => (
              <th key={h} className="border px-2 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rels.length === 0 ? (
            <tr>
              <td colSpan={10} className="border px-2 py-4 text-center text-gray-500">
                등록된 관계가 없습니다
              </td>
            </tr>
          ) : (
            rels.map((x, i) => (
              <tr key={x.rel_id} className="hover:bg-gray-50">
                <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{(page - 1) * SIZE + i + 1}</td>
                <td className="border px-2 py-1 font-medium">{x.prnt.ent_log_nm}</td>
                <td className="border px-2 py-1 text-center font-mono text-[#1f3a68]" title={`${CRDN[x.crdn_cd as keyof typeof CRDN]} · 부모 ${x.prnt_opt_yn === 'Y' ? '선택' : '필수'} · 자식 ${x.chld_opt_yn === 'Y' ? '선택' : '필수'}`}>
                  {x.notation}
                </td>
                <td className="border px-2 py-1 font-medium">{x.chld.ent_log_nm}</td>
                <td className="border px-2 py-1">{x.rel_nm}</td>
                <td className="border px-2 py-1 text-center">{x.idnt_yn === 'Y' ? '식별' : '비식별'}</td>
                <td className="w-[25%] border px-2 py-1 !whitespace-normal">{x.rel_desc}</td>
                <ActorCells nm={x.regr_nm} d={x.reg_dtm} />
                <td className="border px-2 py-1 text-center">
                  {editor && (
                    <>
                      <button onClick={() => startEdit(x)} className="mr-2 text-blue-700 underline">
                        수정
                      </button>
                      <button onClick={() => del(x)} className="text-red-700 underline">
                        삭제
                      </button>
                    </>
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
        <button onClick={() => setPage(page + 1)} disabled={page * SIZE >= total} className="rounded border px-2 py-1 disabled:opacity-30">
          ›
        </button>
      </div>
    </section>
  )
}

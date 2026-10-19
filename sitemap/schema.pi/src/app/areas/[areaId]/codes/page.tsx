'use client'
// 표준코드 화면(P04, sql/057) — 하단 메뉴 표준용어 › 표준코드. 코드 = 코드형(CD) 도메인의 확정 표준용어 1개, 고른 코드의 코드값을 아래 표에서 관리
// 조회 = 표준 메뉴 권한, 등록·수정·삭제 = 표준 신청 권한(API 확인, 승인 절차 없이 바로 반영·변경 이력)
import { piFetch } from '@pi/auth/client'
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import ItemTable, { type ItemCfg } from '../settings/item-table'

type Code = { cd_id: string; term_id: string; cd_cls_nm: string | null; cd_desc: string | null; use_yn: 'Y' | 'N'; ver_no: number; std_term: { term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null } | null }
type Term = { term_id: string; term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null }

const VAL_CFG: ItemCfg = {
  path: 'code-values',
  pk: 'cd_val_id',
  title: '코드값',
  fields: [
    { key: 'cd_val', label: '코드값', required: true, max: 100 },
    { key: 'cd_val_nm', label: '코드값명', required: true, max: 400 },
    { key: 'sort_seq', label: '정렬순서', max: 5, pattern: '\\d{1,5}' },
    { key: 'use_yn', label: '사용(Y/N)', required: true, max: 1, pattern: '[YN]' },
    { key: 'cd_val_desc', label: '설명', max: 4000 },
  ],
}

export default function CodesPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const base = `/api/areas/${areaId}/codes`
  const [codes, setCodes] = useState<Code[]>([])
  const [sel, setSel] = useState<Code | null>(null)
  const [edit, setEdit] = useState<Code | null>(null)
  const [q, setQ] = useState('')
  const [terms, setTerms] = useState<Term[]>([])
  const [term, setTerm] = useState<Term | null>(null)
  const [cls, setCls] = useState('')
  const [desc, setDesc] = useState('')
  const [useYn, setUseYn] = useState<'Y' | 'N'>('Y')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const j = await (await piFetch(base)).json()
    if (j.ok) setCodes(j.items)
    else setMsg(j.message)
  }, [base])
  useEffect(() => {
    void load()
  }, [load])

  // 용어 검색(확정 용어 20건) — 코드형 도메인 여부는 서버가 등록 때 확인
  const search = async () => {
    if (q.trim().length < 2) return setMsg('용어 검색은 2글자 이상')
    const j = await (await piFetch(`/api/areas/${areaId}/terms?q=${encodeURIComponent(q.trim())}&sts=CNFM&size=20`)).json()
    if (j.ok) setTerms(j.terms)
    else setMsg(j.message)
  }
  const reset = () => {
    setEdit(null)
    setTerm(null)
    setTerms([])
    setQ('')
    setCls('')
    setDesc('')
    setUseYn('Y')
  }
  const done = async (j: { ok: boolean; message?: string }, ok: string) => {
    setMsg(j.ok ? ok : (j.message ?? ''))
    if (j.ok) {
      reset()
      await load()
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = { cd_cls_nm: cls.trim() || null, cd_desc: desc.trim() || null, use_yn: useYn }
    if (edit) {
      await done(await (await piFetch(`${base}/${edit.cd_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ver_no: edit.ver_no, ...body }) })).json(), '수정했습니다')
      return
    }
    if (!term) return setMsg('코드로 쓸 표준용어를 고르십시오')
    await done(await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ term_id: term.term_id, ...body }) })).json(), '등록했습니다')
  }
  const remove = async (c: Code) => {
    if (!confirm(`${c.std_term?.term_log_nm} 코드를 삭제합니다`)) return
    if (sel?.cd_id === c.cd_id) setSel(null)
    await done(await (await piFetch(`${base}/${c.cd_id}?ver_no=${c.ver_no}`, { method: 'DELETE' })).json(), '삭제했습니다')
  }

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">표준코드</h1>
      <p className="mt-1 text-sm text-gray-600">코드형(CD) 도메인을 쓰는 확정 표준용어 1개가 코드 1개입니다(코드명·물리명 = 용어). 코드값은 코드 안에서 겹칠 수 없고 용어 도메인 길이를 넘을 수 없습니다. 코드값이 있는 코드는 삭제할 수 없습니다.</p>

      <section className="mt-4 overflow-x-auto text-sm">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              {['코드분류', '코드명', '물리명', '도메인', '사용', ''].map((h, i) => (
                <th key={i} className="border px-2 py-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td colSpan={6} className="border px-2 py-4 text-center text-gray-500">
                  등록된 코드가 없습니다
                </td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={c.cd_id} className={sel?.cd_id === c.cd_id ? 'bg-amber-50' : ''}>
                  <td className="border px-2 py-1">{c.cd_cls_nm}</td>
                  <td className="border px-2 py-1">
                    <button onClick={() => setSel(c)} className="text-blue-700 underline">
                      {c.std_term?.term_log_nm}
                    </button>
                  </td>
                  <td className="border px-2 py-1 font-mono">{c.std_term?.term_phy_nm}</td>
                  <td className="border px-2 py-1">{c.std_term?.std_dom?.dom_nm}</td>
                  <td className="border px-2 py-1">{c.use_yn}</td>
                  <td className="whitespace-nowrap border px-2 py-1">
                    <button
                      onClick={() => {
                        setEdit(c)
                        setCls(c.cd_cls_nm ?? '')
                        setDesc(c.cd_desc ?? '')
                        setUseYn(c.use_yn)
                      }}
                      className="mr-1 text-blue-700 underline"
                    >
                      수정
                    </button>
                    <button onClick={() => void remove(c)} className="text-red-700 underline">
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded border p-3">
          <span className="w-full font-semibold">{edit ? `코드 수정 — ${edit.std_term?.term_log_nm}` : '코드 등록'}</span>
          {!edit && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void search())} placeholder="표준용어 검색(2글자 이상)" className="min-w-48 flex-1 rounded border px-3 py-2" />
              <button type="button" onClick={() => void search()} className="rounded border px-3 py-2">
                검색
              </button>
              {term && <span className="rounded bg-amber-100 px-2 py-1">선택 : {term.term_log_nm}</span>}
              {terms.length > 0 && (
                <ul className="flex w-full flex-wrap gap-1">
                  {terms.map((t) => (
                    <li key={t.term_id}>
                      <button type="button" onClick={() => setTerm(t)} className={`rounded border px-2 py-1 ${term?.term_id === t.term_id ? 'border-amber-500 bg-amber-50' : ''}`}>
                        {t.term_log_nm} <span className="text-xs text-gray-500">{t.std_dom?.dom_nm}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="코드분류(예 : 공통)" maxLength={200} className="min-w-40 flex-1 rounded border px-3 py-2" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" maxLength={4000} className="min-w-40 flex-1 rounded border px-3 py-2" />
          <select value={useYn} onChange={(e) => setUseYn(e.target.value as 'Y' | 'N')} className="rounded border px-3 py-2">
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <button className="rounded bg-gray-800 px-4 py-2 text-white">{edit ? '수정 저장' : '등록'}</button>
          {edit && (
            <button type="button" onClick={reset} className="rounded border px-4 py-2">
              취소
            </button>
          )}
        </form>
        {msg && (
          <p role="status" className="mt-2 text-gray-700">
            {msg}
          </p>
        )}
      </section>

      {sel && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">
            코드값 — {sel.std_term?.term_log_nm} <span className="font-mono text-sm text-gray-500">{sel.std_term?.term_phy_nm}</span>
          </h2>
          <div className="mt-2">
            <ItemTable key={sel.cd_id} areaId={areaId} cfg={VAL_CFG} parent={{ cd_id: sel.cd_id }} />
          </div>
        </section>
      )}
    </main>
  )
}

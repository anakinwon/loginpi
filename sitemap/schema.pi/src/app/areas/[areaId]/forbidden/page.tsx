'use client'
import { piFetch } from '@pi/auth/client'
// 금칙어 관리 화면(P05) — 표준단어별 대체 표기(금칙어·이음동의어) 등록·삭제·조회. 원칙 : 동의어는 표준단어로 쓰지 않고 이 목록으로만 관리(sql/016)
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { can, type MbrRole } from '@/lib/roles'
import { ActorCells, noEnterSubmit } from '../words/word-board'

interface Item {
  rel_id: string
  rel_tp_cd: string
  rel_txt: string
  std_dic: { dic_id: string; dic_log_nm: string; dic_phy_nm: string; std_sts_cd: string }
  regr_nm: string | null
  reg_dtm: string
}
interface Word {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
}
const TP_NM: Record<string, string> = { BAN: '금칙어', SYN: '이음동의어' }

export default function ForbiddenPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const base = `/api/areas/${areaId}/forbidden`
  const [role, setRole] = useState<MbrRole | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [words, setWords] = useState<Word[]>([])
  const [form, setForm] = useState({ word: '', tp: 'BAN', txt: '' })
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [cond, setCond] = useState({ kw: '', tp: '', page: 1, size: 20 })
  const [total, setTotal] = useState(0)
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setRole(j.role))
    piFetch(`/api/areas/${areaId}/words?size=100&sts=CNFM`)
      .then((r) => r.json())
      .then((j) => j.ok && setWords(j.words))
  }, [areaId])
  const editor = !!role && can(role, 'APPROVE')

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.tp ? { tp: cond.tp } : {}) })
    const j = await (await piFetch(`${base}?${sp}`)).json()
    if (j.ok) {
      setItems(j.items)
      setTotal(j.total)
    } else setMsg(j.message)
  }, [base, cond])
  useEffect(() => {
    load()
  }, [load])
  // 표준단어 검색(입력 시 서버 조회, 승인완료만)
  useEffect(() => {
    const nm = form.word.trim()
    if (!nm) return
    const t = setTimeout(async () => {
      const j = await (await piFetch(`/api/areas/${areaId}/words?${new URLSearchParams({ q: nm, sts: 'CNFM', size: '20' })}`)).json()
      if (j.ok) setWords(j.words)
    }, 300)
    return () => clearTimeout(t)
  }, [form.word, areaId])
  const target = words.find((w) => w.dic_log_nm === form.word.trim())
  const pages = Math.max(1, Math.ceil(total / cond.size))

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target || !form.txt.trim()) return
    if (!confirm(`표준단어 '${target.dic_log_nm}'의 ${TP_NM[form.tp]} '${form.txt.trim()}'을(를) 등록하시겠습니까?`)) return
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dic_id: target.dic_id, rel_tp_cd: form.tp, rel_txt: form.txt.trim() }) })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`${TP_NM[form.tp]} '${form.txt.trim()}' 등록 완료 : 이 표기는 표준단어로 등록할 수 없습니다`)
    setForm({ ...form, txt: '' })
    load()
  }
  const remove = async (it: Item) => {
    if (!confirm(`${TP_NM[it.rel_tp_cd]} '${it.rel_txt}'을(를) 삭제하시겠습니까?`)) return
    const j = await (await piFetch(`${base}?rel_id=${it.rel_id}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(`'${it.rel_txt}' 삭제 완료`)
    load()
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 flex items-baseline gap-3 text-2xl font-bold">
        금칙어 관리
        {editor && (
          <Link href={`/areas/${areaId}/bulk?tab=forbidden`} className="text-sm font-normal text-blue-700 underline">
            CSV 일괄등록
          </Link>
        )}
      </h1>
      <div className="mt-3 rounded-lg border border-[#c7d2e6] bg-[#f4f7fc] p-4 text-sm leading-relaxed">
        <p className="font-semibold text-[#1f3a68]">동의어 불허 원칙</p>
        <ul className="mt-1 list-disc pl-5 text-gray-700">
          <li>뜻이 같은 표기는 표준단어 하나만 등록합니다. 다른 표기는 금칙어(쓰지 않는 표기) 또는 이음동의어로 이 목록에만 둡니다.</li>
          <li>이 목록의 표기는 표준단어로 등록·수정할 수 없고, 표준단어 이름은 이 목록에 넣을 수 없습니다. 같은 표기를 두 표준단어에 둘 수 없습니다.</li>
          <li>같은 논리명(동음이의어)·같은 물리명(이음동의어)의 표준단어도 등록할 수 없습니다. 모두 DB에서 강제합니다.</li>
        </ul>
      </div>

      <form onSubmit={add} onKeyDown={noEnterSubmit} className="mt-6 overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
        <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">금칙어 등록</h2>
        <fieldset disabled={!editor} className="p-5 disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <input list="std-words" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} placeholder="사용할 표준단어(검색)" className="w-full rounded border border-[#b8c6e0] bg-white px-3 py-2" aria-label="표준단어" />
              <datalist id="std-words">
                {words.map((w) => (
                  <option key={w.dic_id} value={w.dic_log_nm}>
                    {w.dic_phy_nm}
                  </option>
                ))}
              </datalist>
              {form.word.trim() && !target && <p className="mt-1 text-red-700">승인완료된 표준단어를 고르십시오</p>}
            </div>
            <select value={form.tp} onChange={(e) => setForm({ ...form, tp: e.target.value })} className="rounded border border-[#b8c6e0] bg-white px-3 py-2" aria-label="구분">
              <option value="BAN">금칙어(쓰지 않는 표기)</option>
              <option value="SYN">이음동의어</option>
            </select>
            <input value={form.txt} onChange={(e) => setForm({ ...form, txt: e.target.value })} placeholder="대체 표기(예 : 패스)" maxLength={200} className="rounded border border-[#b8c6e0] bg-white px-3 py-2" aria-label="대체 표기" />
            <button disabled={!target || !form.txt.trim()} className="btn-3d px-8 disabled:opacity-40">
              등록
            </button>
          </div>
          {role && !editor && <p className="mt-2 font-medium text-gray-600">조회 권한 : 금칙어 등록·삭제는 데이터아키텍트·표준담당자만 가능합니다</p>}
          {msg && (
            <p role="status" className="mt-2 font-medium text-[#1f3a68]">
              {msg}
            </p>
          )}
        </fieldset>
      </form>

      <section className="mt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setCond({ ...cond, kw: q.trim(), page: 1 })
          }}
          className="flex gap-2"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="대체 표기 검색" className="flex-1 rounded border px-3 py-2 text-sm" />
          <select value={cond.tp} onChange={(e) => setCond({ ...cond, tp: e.target.value, page: 1 })} className="rounded border px-2 py-2 text-sm" aria-label="구분">
            <option value="">전체 구분</option>
            <option value="BAN">금칙어</option>
            <option value="SYN">이음동의어</option>
          </select>
          <button className="btn-3d">검색</button>
        </form>
        <table className="mt-3 w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap">
          <thead>
            <tr className="thead-3d text-center">
              {['#', '대체 표기', '구분', '사용할 표준단어', '물리명', '등록자', '등록일시', '처리'].map((h) => (
                <th key={h} className="border px-2 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="border px-2 py-4 text-center text-gray-500">
                  등록된 금칙어가 없습니다
                </td>
              </tr>
            ) : (
              items.map((it, i) => (
                <tr key={it.rel_id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                  <td className="border px-2 py-1 font-medium text-red-700">{it.rel_txt}</td>
                  <td className="border px-2 py-1 text-center">{TP_NM[it.rel_tp_cd]}</td>
                  <td className="w-full border px-2 py-1 font-medium">{it.std_dic.dic_log_nm}</td>
                  <td className="border px-2 py-1 font-mono">{it.std_dic.dic_phy_nm}</td>
                  <ActorCells nm={it.regr_nm} d={it.reg_dtm} />
                  <td className="border px-2 py-1 text-center">
                    {editor && (
                      <button onClick={() => remove(it)} className="text-red-700 underline">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <span className="text-gray-600">총 {total.toLocaleString()}건</span>
          <button onClick={() => setCond({ ...cond, page: cond.page - 1 })} disabled={cond.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
            ‹
          </button>
          <span className="tabular-nums">
            {cond.page} / {pages}
          </span>
          <button onClick={() => setCond({ ...cond, page: cond.page + 1 })} disabled={cond.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
            ›
          </button>
        </div>
      </section>
    </main>
  )
}

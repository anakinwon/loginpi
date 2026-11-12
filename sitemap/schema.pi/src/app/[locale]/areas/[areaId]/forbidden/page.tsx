'use client'
import { piFetch } from '@pi/auth/client'
// 금칙어 관리 화면(P05) — 표준단어별 대체 표기(금칙어·이음동의어) 등록·삭제·조회. 원칙 : 동의어는 표준단어로 쓰지 않고 이 목록으로만 관리(sql/016)
import { Link } from '@/i18n/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { type MbrRole, type Perm } from '@/lib/roles'
import { FileUp, Trash2 } from 'lucide-react'
import { PageHead } from '@/components/page-head'
import { ActorCells, noEnterSubmit, Pager, TD } from '../words/word-board'

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
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
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
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
    piFetch(`/api/areas/${areaId}/words?size=100&sts=CNFM`)
      .then((r) => r.json())
      .then((j) => j.ok && setWords(j.words))
  }, [areaId])
  const editor = perms.includes('BAN_EDIT')

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
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead
        title="금칙어 관리"
        info="뜻이 같은 표기는 표준단어 하나만 등록하고, 다른 표기는 금칙어(쓰지 않는 표기)·이음동의어로 이 목록에만 둡니다. 이 목록의 표기는 표준단어로 쓸 수 없고, 같은 표기를 두 표준단어에 둘 수 없습니다. 같은 논리명·같은 물리명의 표준단어도 등록할 수 없으며 모두 DB에서 강제합니다."
        actions={
          editor && (
            <Link href={`/areas/${areaId}/bulk?tab=forbidden`} className="btn-key">
              <FileUp aria-hidden />
              CSV 일괄등록
            </Link>
          )
        }
      />
      <div className="space-y-6">
        <form onSubmit={add} onKeyDown={noEnterSubmit} className="panel text-sm">
          <div className="panel-head">
            <h2 className="truncate">금칙어 등록</h2>
            {role && !editor && (
              <span className="badge ms-auto" title="금칙어 등록·삭제는 일괄등록 권한 역할(시스템담당자·데이터아키텍트·표준담당자·모델러) + 표준담당자 요금제 이상이어야 합니다">
                조회 전용
              </span>
            )}
          </div>
          <fieldset disabled={!editor} className="panel-body disabled:opacity-60">
            <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="field-label req">표준단어</span>
                <input list="std-words" value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} placeholder="표준단어" className="input" aria-required="true" />
                <datalist id="std-words">
                  {words.map((w) => (
                    <option key={w.dic_id} value={w.dic_log_nm}>
                      {w.dic_phy_nm}
                    </option>
                  ))}
                </datalist>
                {form.word.trim() && !target && <p className="mt-1 text-xs text-danger">승인완료된 표준단어를 고르십시오</p>}
              </label>
              <label className="block">
                <span className="field-label req">구분</span>
                <select value={form.tp} onChange={(e) => setForm({ ...form, tp: e.target.value })} className="input">
                  <option value="BAN">금칙어(쓰지 않는 표기)</option>
                  <option value="SYN">이음동의어</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label req">대체 표기</span>
                <input value={form.txt} onChange={(e) => setForm({ ...form, txt: e.target.value })} placeholder="대체 표기" maxLength={200} className="input" aria-required="true" />
              </label>
              <div className="flex justify-end lg:pt-5">
                <button disabled={!target || !form.txt.trim()} className="btn-3d">
                  등록
                </button>
              </div>
            </div>
            {msg && (
              <p role="status" className="mt-3 text-dense font-medium text-ink">
                {msg}
              </p>
            )}
          </fieldset>
        </form>

        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setCond({ ...cond, kw: q.trim(), page: 1 })
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="대체 표기" aria-label="검색어(대체 표기)" className="input min-w-48 flex-1" />
            <select value={cond.tp} onChange={(e) => setCond({ ...cond, tp: e.target.value, page: 1 })} className="input w-auto" aria-label="구분">
              <option value="">전체 구분</option>
              <option value="BAN">금칙어</option>
              <option value="SYN">이음동의어</option>
            </select>
            <button className="btn-key">검색</button>
          </form>
          <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
              <thead>
                <tr className="thead-3d text-start">
                  {['#', '대체 표기', '구분', '사용할 표준단어', '물리명', '등록자', '등록일시', '처리'].map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-ink-3">
                      등록된 금칙어가 없습니다
                    </td>
                  </tr>
                ) : (
                  items.map((it, i) => (
                    <tr key={it.rel_id}>
                      <td className={`${TD} text-right font-mono text-xs text-ink-3 tabular-nums`}>{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                      <td className={`${TD} font-medium text-danger`}>{it.rel_txt}</td>
                      <td className={TD}>
                        <span className="badge">{TP_NM[it.rel_tp_cd]}</span>
                      </td>
                      <td className={`${TD} w-full font-medium`}>{it.std_dic.dic_log_nm}</td>
                      <td className={TD}>
                        <span className="chip-phy">{it.std_dic.dic_phy_nm}</span>
                      </td>
                      <ActorCells nm={it.regr_nm} d={it.reg_dtm} />
                      <td className={TD}>
                        {editor && (
                          <button type="button" onClick={() => remove(it)} aria-label="삭제" title="삭제" className="btn-ghost btn-icon btn-sm hover:text-danger">
                            <Trash2 aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager total={total} page={cond.page} size={cond.size} go={(p) => setCond({ ...cond, page: Math.min(Math.max(1, p), pages) })} setSize={(size) => setCond({ ...cond, size, page: 1 })} />
        </section>
      </div>
    </main>
  )
}

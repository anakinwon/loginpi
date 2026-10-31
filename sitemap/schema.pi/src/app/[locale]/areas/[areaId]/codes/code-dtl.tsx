'use client'
// 코드상세(코드 인스턴스) 등록·조회 — 코드기본 1 : N 코드상세, 주식별자 = 코드ID + 코드값(코드값은 변경 불가, 마스터 지시 2026-10-20)
//  코드기본 콤보로 고른 뒤 코드값·코드값명·정렬순서·사용·설명 등록, 아래 표에서 수정·삭제. 코드값·코드값명 상호 배타·도메인 길이는 서버 검사(std-code.ts upsertDtl)
import { piFetch } from '@pi/auth/client'
//  코드기본 승인 상태 : 반려 = 코드상세 등록 불가(서버 CD_BAS_RJCT, 폼 비활성), 승인대기 = 등록 가능(코드기본 승인 후 사용)
import { useCallback, useEffect, useState } from 'react'
import { STS_NM } from '@/lib/roles'

export type BasOpt = { cd_id: string; std_sts_cd?: string; std_term: { term_log_nm: string } | null }
type Dtl = { cd_id: string; cd_val: string; cd_val_nm: string; cd_val_desc: string | null; sort_seq: number | null; use_yn: 'Y' | 'N'; ver_no: number }
const EMPTY = { cd_val: '', cd_val_nm: '', sort_seq: '', use_yn: 'Y', cd_val_desc: '' }

export default function CodeDtl({ areaId, opts, cdId, onPick }: { areaId: string; opts: BasOpt[]; cdId: string; onPick: (cdId: string) => void }) {
  const [rows, setRows] = useState<Dtl[]>([])
  const [form, setForm] = useState(EMPTY)
  const [edit, setEdit] = useState<Dtl | null>(null)
  const [msg, setMsg] = useState('')
  const base = `/api/areas/${areaId}/codes/${encodeURIComponent(cdId)}/values`
  const bas = opts.find((o) => o.cd_id === cdId)
  const nm = bas?.std_term?.term_log_nm ?? cdId
  const rjct = bas?.std_sts_cd === 'RJCT'

  const load = useCallback(async () => {
    if (!cdId) return setRows([])
    const j = await (await piFetch(base)).json()
    if (j.ok) setRows(j.items)
    else setMsg(j.message)
  }, [base, cdId])
  useEffect(() => {
    void load()
  }, [load])
  const reset = () => {
    setEdit(null)
    setForm(EMPTY)
  }
  useEffect(reset, [cdId])

  const after = async (j: { ok: boolean; message?: string }, ok: string) => {
    setMsg(j.ok ? ok : (j.message ?? ''))
    if (j.ok) {
      reset()
      await load()
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cdId) return setMsg('코드기본을 먼저 고르십시오')
    const body = { cd_val_nm: form.cd_val_nm.trim(), use_yn: form.use_yn, sort_seq: form.sort_seq === '' ? undefined : Number(form.sort_seq), cd_val_desc: form.cd_val_desc.trim() || undefined }
    const json = { 'Content-Type': 'application/json' }
    if (edit) return after(await (await piFetch(`${base}/${encodeURIComponent(edit.cd_val)}`, { method: 'PATCH', headers: json, body: JSON.stringify({ ver_no: edit.ver_no, ...body, cd_val_desc: form.cd_val_desc.trim() || null }) })).json(), '수정했습니다')
    await after(await (await piFetch(base, { method: 'POST', headers: json, body: JSON.stringify({ cd_val: form.cd_val.trim(), ...body }) })).json(), '등록했습니다')
  }
  const remove = async (d: Dtl) => {
    if (!confirm(`코드값 ${d.cd_val}(${d.cd_val_nm})을 삭제합니다`)) return
    await after(await (await piFetch(`${base}/${encodeURIComponent(d.cd_val)}?ver_no=${d.ver_no}`, { method: 'DELETE' })).json(), '삭제했습니다')
  }
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <section className="space-y-3">
      <form onSubmit={submit} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
        <h2 className={`px-5 py-2.5 text-base font-semibold text-white ${edit ? 'bg-gradient-to-r from-[#b45309] to-[#d97706]' : 'bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e]'}`}>{edit ? `코드상세 수정 : ${nm} · ${edit.cd_val}` : '코드상세(코드 인스턴스) 등록'}</h2>
        <div className="flex flex-wrap items-end gap-2 p-5 [&_input]:border-[#b8c6e0] [&_input]:bg-white [&_select]:border-[#b8c6e0] [&_select]:bg-white">
          <select value={cdId} onChange={(e) => onPick(e.target.value)} disabled={!!edit} className="min-w-56 rounded border px-3 py-2" aria-label="코드기본">
            <option value="">코드기본 선택</option>
            {opts.map((o) => (
              <option key={o.cd_id} value={o.cd_id}>
                {o.std_term?.term_log_nm} ({o.cd_id}){o.std_sts_cd && o.std_sts_cd !== 'CNFM' ? ` · ${STS_NM[o.std_sts_cd] ?? o.std_sts_cd}` : ''}
              </option>
            ))}
          </select>
          {/* 반려 코드기본 = 입력칸 전부 비활성(콤보는 다른 코드기본 선택용으로 유지) */}
          <fieldset disabled={rjct} className="contents">
          <input value={form.cd_val} onChange={set('cd_val')} disabled={!!edit} required placeholder="코드값(예 : M)" maxLength={100} className="w-32 rounded border px-3 py-2 font-mono disabled:bg-gray-100" aria-label="코드값" />
          <input value={form.cd_val_nm} onChange={set('cd_val_nm')} required placeholder="코드값명(예 : 남자)" maxLength={400} className="min-w-40 flex-1 rounded border px-3 py-2" aria-label="코드값명" />
          <input value={form.sort_seq} onChange={set('sort_seq')} type="number" min={0} max={99999} placeholder="정렬순서" className="w-28 rounded border px-3 py-2" aria-label="정렬순서" />
          <select value={form.use_yn} onChange={set('use_yn')} className="rounded border px-3 py-2" aria-label="사용여부">
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input value={form.cd_val_desc} onChange={set('cd_val_desc')} placeholder="설명" maxLength={4000} className="min-w-40 flex-1 rounded border px-3 py-2" aria-label="설명" />
          <button className="btn-3d px-8" disabled={!cdId}>
            {edit ? '수정 저장' : '등록'}
          </button>
          {edit && (
            <button type="button" onClick={reset} className="btn-3d">
              취소
            </button>
          )}
          </fieldset>
          {rjct && <p className="w-full font-medium text-red-700">반려된 코드기본 — 재신청 후 코드상세를 등록하십시오</p>}
          {bas?.std_sts_cd === 'REQ' && <p className="w-full font-medium text-amber-700">코드기본 승인대기 중(코드상세는 등록 가능, 코드기본 승인 후 사용)</p>}
          <p className="w-full text-xs text-gray-500">코드값 = 주식별자(등록 후 변경 불가, % / \ ? # 사용 불가). 같은 코드기본 안에서 코드값·코드값명은 겹칠 수 없습니다(상호 배타).</p>
          {msg && (
            <p role="status" className="w-full font-medium text-[#1f3a68]">
              {msg}
            </p>
          )}
        </div>
      </form>

      {cdId && (
        <div className="overflow-x-auto">
          <p className="mb-1 text-sm font-semibold">
            코드상세 — {nm} <span className="font-mono text-xs text-gray-500">{cdId}</span> · {rows.length}건
          </p>
          <table className="w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap">
            <thead>
              <tr className="thead-3d text-center">
                {['#', '코드값', '코드값명', '정렬순서', '사용', '설명', '처리'].map((h) => (
                  <th key={h} className="border px-2 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border px-2 py-4 text-center text-gray-500">
                    등록된 코드상세가 없습니다
                  </td>
                </tr>
              ) : (
                rows.map((d, i) => (
                  <tr key={d.cd_val} className={edit?.cd_val === d.cd_val ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{i + 1}</td>
                    <td className="border px-2 py-1 font-mono font-semibold">{d.cd_val}</td>
                    <td className="border px-2 py-1">{d.cd_val_nm}</td>
                    <td className="border px-2 py-1 text-center tabular-nums">{d.sort_seq}</td>
                    <td className="border px-2 py-1 text-center">{d.use_yn}</td>
                    <td className="border px-2 py-1">{d.cd_val_desc}</td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        onClick={() => {
                          setEdit(d)
                          setForm({ cd_val: d.cd_val, cd_val_nm: d.cd_val_nm, sort_seq: d.sort_seq == null ? '' : String(d.sort_seq), use_yn: d.use_yn, cd_val_desc: d.cd_val_desc ?? '' })
                        }}
                        className="mr-2 text-blue-700 underline"
                      >
                        수정
                      </button>
                      <button onClick={() => void remove(d)} className="text-red-700 underline">
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

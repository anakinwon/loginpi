'use client'
// 코드상세(코드 인스턴스) 등록·조회 — 코드기본 1 : N 코드상세, 주식별자 = 코드ID + 코드값(코드값은 변경 불가, 마스터 지시 2026-10-20)
//  코드기본 콤보로 고른 뒤 코드값·코드값명·정렬순서·사용·설명 등록, 아래 표에서 수정·삭제. 코드값·코드값명 상호 배타·도메인 길이는 서버 검사(std-code.ts upsertDtl)
import { piFetch } from '@pi/auth/client'
//  코드기본 승인 상태 : 반려 = 코드상세 등록 불가(서버 CD_BAS_RJCT, 폼 비활성), 승인대기 = 등록 가능(코드기본 승인 후 사용)
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { InfoTip } from '@/components/page-head'
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
      <form onSubmit={submit} className="panel">
        <div className="panel-head" data-mode={edit ? 'edit' : undefined}>
          <h2>{edit ? `코드상세 수정 : ${nm} · ${edit.cd_val}` : '코드상세 등록'}</h2>
          <InfoTip>코드값 = 주식별자(등록 후 변경 불가, % / \ ? # 사용 불가). 같은 코드기본 안에서 코드값·코드값명은 겹칠 수 없습니다(상호 배타).</InfoTip>
          {rjct && (
            <span className="badge ms-auto" data-tone="danger" title="반려된 코드기본 — 재신청 후 코드상세를 등록하십시오">
              코드기본 반려
            </span>
          )}
          {bas?.std_sts_cd === 'REQ' && (
            <span className="badge ms-auto" data-tone="warn" title="코드상세는 등록 가능, 코드기본 승인 후 사용">
              코드기본 승인대기
            </span>
          )}
        </div>
        <div className="panel-body flex flex-wrap items-center gap-2">
          <select value={cdId} onChange={(e) => onPick(e.target.value)} disabled={!!edit} className="input w-auto min-w-56" aria-label="코드기본">
            <option value="">코드기본 선택</option>
            {opts.map((o) => (
              <option key={o.cd_id} value={o.cd_id}>
                {o.std_term?.term_log_nm} ({o.cd_id}){o.std_sts_cd && o.std_sts_cd !== 'CNFM' ? ` · ${STS_NM[o.std_sts_cd] ?? o.std_sts_cd}` : ''}
              </option>
            ))}
          </select>
          {/* 반려 코드기본 = 입력칸 전부 비활성(콤보는 다른 코드기본 선택용으로 유지) */}
          <fieldset disabled={rjct} className="contents">
          <input value={form.cd_val} onChange={set('cd_val')} disabled={!!edit} required placeholder="코드값" title="예 : M" maxLength={100} className="input w-32 font-mono disabled:text-ink-3" aria-label="코드값" />
          <input value={form.cd_val_nm} onChange={set('cd_val_nm')} required placeholder="코드값명" title="예 : 남자" maxLength={400} className="input min-w-40 flex-1" aria-label="코드값명" />
          <input value={form.sort_seq} onChange={set('sort_seq')} type="number" min={0} max={99999} placeholder="정렬순서" className="input w-28" aria-label="정렬순서" />
          <select value={form.use_yn} onChange={set('use_yn')} className="input w-auto" aria-label="사용여부">
            <option value="Y">사용</option>
            <option value="N">미사용</option>
          </select>
          <input value={form.cd_val_desc} onChange={set('cd_val_desc')} placeholder="설명" maxLength={4000} className="input min-w-40 flex-1" aria-label="설명" />
          <div className="ms-auto flex gap-2">
            {edit && (
              <button type="button" onClick={reset} className="btn-key">
                취소
              </button>
            )}
            <button className="btn-key" disabled={!cdId}>
              {edit ? '수정 저장' : '등록'}
            </button>
          </div>
          </fieldset>
          {msg && (
            <p role="status" className="w-full text-dense text-ink-2">
              {msg}
            </p>
          )}
        </div>
      </form>

      {cdId && (
        <div>
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {nm} <span className="chip-phy font-normal">{cdId}</span> <span className="font-mono text-xs font-normal text-ink-3 tabular-nums">{rows.length.toLocaleString()}건</span>
          </p>
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
              <thead>
                <tr className="thead-3d text-center">
                  {['#', '코드값', '코드값명', '정렬순서', '사용', '설명', '처리'].map((h) => (
                    <th key={h} className="border-b px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-ink-3">
                      등록된 코드상세 없음
                    </td>
                  </tr>
                ) : (
                  rows.map((d, i) => (
                    <tr key={d.cd_val} data-mode={edit?.cd_val === d.cd_val ? 'edit' : undefined}>
                      <td className="border px-3 py-1 text-end font-mono text-xs text-ink-3 tabular-nums">{i + 1}</td>
                      <td className="border px-3 py-1">
                        <span className="chip-phy">{d.cd_val}</span>
                      </td>
                      <td className="border px-3 py-1 font-medium">{d.cd_val_nm}</td>
                      <td className="border px-3 py-1 text-end tabular-nums">{d.sort_seq}</td>
                      <td className="border px-3 py-1 text-center font-mono text-xs text-ink-3">{d.use_yn}</td>
                      <td className="border px-3 py-1 text-ink-2">{d.cd_val_desc}</td>
                      <td className="border px-3 py-1 text-center">
                        <span className="inline-flex gap-1">
                          <button
                            onClick={() => {
                              setEdit(d)
                              setForm({ cd_val: d.cd_val, cd_val_nm: d.cd_val_nm, sort_seq: d.sort_seq == null ? '' : String(d.sort_seq), use_yn: d.use_yn, cd_val_desc: d.cd_val_desc ?? '' })
                            }}
                            aria-label="수정"
                            title="수정"
                            className="btn-ghost btn-icon btn-sm"
                          >
                            <Pencil aria-hidden />
                          </button>
                          <button onClick={() => void remove(d)} aria-label="삭제" title="삭제" className="btn-ghost btn-icon btn-sm hover:text-danger">
                            <Trash2 aria-hidden />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

'use client'
import { piFetch } from '@pi/auth/client'
// 승인 요청 목록·처리(클라이언트) — /api/areas/[areaId]/approvals(목록·필터·페이징), /approvals/[reqId](건별 승인·반려·취소), /approvals/batch(선택 승인·반려)
import { Fragment, useCallback, useEffect, useState } from 'react'
import { ACT_NM, APV_STS_NM } from '@/lib/roles'

// 동작 표시 — 단어 수정 중 바뀐 칸이 대표도메인여부뿐이면 대표도메인 지정·해제(sql/013)
const actNm = (r: { tgt_tp_cd: string; act_cd: string; aftr_val: Record<string, unknown> | null }) => {
  const keys = Object.keys(r.aftr_val ?? {})
  if (r.tgt_tp_cd === 'DIC' && r.act_cd === 'UPD' && keys.length === 1 && keys[0] === 'key_dom_yn') return r.aftr_val?.key_dom_yn === 'Y' ? '대표도메인 지정' : '대표도메인 해제'
  // 엔터티 분류어·테이블 접미어만 바뀐 단어 수정(sql/017)
  if (r.tgt_tp_cd === 'DIC' && r.act_cd === 'UPD' && keys.length && keys.every((k) => k === 'ent_clss_yn' || k === 'tbl_sfx_txt'))
    return r.aftr_val?.ent_clss_yn === 'Y' ? '엔터티 분류어 지정' : r.aftr_val?.ent_clss_yn === 'N' ? '엔터티 분류어 해제' : '테이블 접미어 변경'
  return ACT_NM[r.act_cd] ?? r.act_cd
}

interface Req {
  apv_req_id: string
  tgt_tp_cd: string
  tgt_key_txt?: string | null // 표준코드 = 코드ID
  act_cd: string
  aftr_val: Record<string, unknown> | null
  tgt?: Record<string, unknown>
  apv_sts_cd: string
  req_rsn_txt: string | null
  apv_opn_txt: string | null
  rjct_rsn_txt: string | null
  apv_dtm: string | null
  reg_dtm: string
  req_usr_id: string
  apv_usr_id: string | null
  req: { pi_usr_nm: string | null } | null
  apv: { pi_usr_nm: string | null } | null
}
interface BatchRes {
  done: number
  failed: number
  results: { id: string; ok: boolean; code?: string; message?: string }[]
}

const TGT_NM: Record<string, string> = { DIC: '단어', DOM: '도메인', TERM: '용어', CD: '표준코드' }
const STS = ['REQ', 'APV', 'RJCT', 'CNCL'] as const
// 요청 내용 표의 칸 이름(없는 칸은 원래 키로 표시)
const FIELD_NM: Record<string, string> = {
  std_se_cd: '표준구분', // STD 표준 / NSTD 비표준(sql/033)
  dic_log_nm: '논리명',
  dic_phy_nm: '물리명',
  dic_eng_nm: '영문풀네임',
  dic_desc: '설명',
  dom_nm: '도메인명',
  key_dom_nm: '대표도메인명',
  term_log_nm: '용어 논리명',
  term_phy_nm: '용어 물리명',
  ver_no: '기준 버전',
  // 표준코드(코드기본)
  cd_id: '코드ID',
  cd_cls_nm: '코드분류',
  cd_desc: '설명',
  use_yn: '사용여부',
  term_id: '용어',
}
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('ko-KR') : '')

// 대상 이름 : 유형별 논리명(물리명), 대상 현재 값 위에 요청 값(바뀐 칸)을 덮어 표시
const tgtName = (r: Req) => {
  const v = { ...(r.tgt ?? {}), ...(r.aftr_val ?? {}) }
  if (r.tgt_tp_cd === 'DIC') return [v.dic_log_nm, v.dic_phy_nm]
  if (r.tgt_tp_cd === 'DOM') return [v.dom_nm ?? v.key_dom_nm, v.key_dom_nm && v.dom_nm ? v.key_dom_nm : null]
  if (r.tgt_tp_cd === 'CD') return [v.term_log_nm, v.cd_id ?? r.tgt_key_txt] // 코드명(코드ID)
  return [v.term_log_nm, v.term_phy_nm]
}

export default function ApprovalBoard({ areaId, sts, tp }: { areaId: string; sts: string; tp: string }) {
  const base = `/api/areas/${areaId}/approvals`
  const [cond, setCond] = useState({ sts, tp, act: '', mine: false, page: 1, size: 10 })
  const [items, setItems] = useState<Req[]>([])
  const [total, setTotal] = useState(0)
  const [approver, setApprover] = useState(false)
  const [me, setMe] = useState('')
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('') // 선택 처리 의견(승인)·사유(반려)
  const [reason, setReason] = useState<Record<string, string>>({}) // 행별 의견·반려사유
  const [busy, setBusy] = useState(false)
  const [batch, setBatch] = useState<BatchRes | null>(null)

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ sts: cond.sts, page: String(cond.page), size: String(cond.size), ...(cond.tp && { tp: cond.tp }), ...(cond.act && { act: cond.act }), ...(cond.mine && { mine: '1' }) })
    const j = await (await piFetch(`${base}?${sp}`)).json()
    if (!j.ok) {
      setMsg(j.message)
      return
    }
    setItems(j.items)
    setTotal(j.total)
    setApprover(j.approver)
    setMe(j.me)
    setSel(new Set())
  }, [base, cond])
  useEffect(() => {
    load()
  }, [load])

  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (p: number) => setCond({ ...cond, page: Math.min(Math.max(1, p), pages) })
  const pick = (k: 'sts' | 'tp' | 'act', v: string) => {
    setCond({ ...cond, [k]: v, page: 1 })
    setBatch(null)
    setOpen(null)
  }

  const post = async (url: string, body: object) => (await piFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()

  // 건별 처리 : 승인(의견 선택)·반려(사유 필수)·취소(신청자 본인)
  const act = async (id: string, action: 'APV' | 'RJCT' | 'CNCL') => {
    const t = reason[id]?.trim() ?? ''
    const body = action === 'APV' ? { action, ...(t && { opinion: t }) } : action === 'RJCT' ? { action, reason: t } : { action }
    if (action === 'CNCL' && !confirm('신청을 취소하시겠습니까?')) return
    setBusy(true)
    const j = await post(`${base}/${id}`, body)
    setBusy(false)
    setBatch(null)
    setMsg(j.ok ? `${APV_STS_NM[action] ?? action} 처리했습니다` : j.message)
    load()
  }

  // 선택 처리 : batch API, 결과 성공·실패 건수와 실패 사유 표시
  const actSel = async (action: 'APV' | 'RJCT') => {
    const t = note.trim()
    const body = action === 'APV' ? { action, ids: [...sel], ...(t && { opinion: t }) } : { action, ids: [...sel], reason: t }
    if (!confirm(`선택 ${sel.size}건을 ${action === 'APV' ? '승인' : '반려'}하시겠습니까?`)) return
    setBusy(true)
    const j = await post(`${base}/batch`, body)
    setBusy(false)
    if (!j.ok) {
      setMsg(j.message)
      return
    }
    setMsg('')
    setBatch(j)
    setNote('')
    load()
  }

  const canSel = approver && cond.sts === 'REQ'
  const done = cond.sts !== 'REQ'
  const allSel = items.length > 0 && items.every((r) => sel.has(r.apv_req_id))
  const toggle = (id: string) => {
    const s = new Set(sel)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSel(s)
  }
  const heads = [...(canSel ? [''] : []), '#', '대상', '동작', '대상 이름', '신청자', '신청일시', '신청사유', ...(done ? ['처리자', '처리일시', cond.sts === 'RJCT' ? '반려사유' : '의견'] : ['처리'])]
  const nameOf = (id: string) => {
    const r = items.find((x) => x.apv_req_id === id)
    return r ? `${TGT_NM[r.tgt_tp_cd]} ${tgtName(r).filter(Boolean).join(' / ')}` : id
  }

  return (
    <div className="mt-6 space-y-4 text-sm">
      {/* 필터 : 처리상태 탭·대상유형·요청동작·내 신청만 */}
      <section className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] shadow-md">
        <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">승인 요청 조회</h2>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex gap-1" role="tablist">
            {STS.map((v) => (
              <button key={v} role="tab" aria-selected={cond.sts === v} onClick={() => pick('sts', v)} className={`rounded border px-4 py-1.5 ${cond.sts === v ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : 'bg-white'}`}>
                {v === 'REQ' ? '대기' : v === 'APV' ? '승인' : v === 'RJCT' ? '반려' : '취소'}
              </button>
            ))}
          </div>
          <select value={cond.tp} onChange={(e) => pick('tp', e.target.value)} className="rounded border bg-white px-2 py-1.5" aria-label="대상유형">
            <option value="">대상 전체</option>
            {Object.entries(TGT_NM).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          <select value={cond.act} onChange={(e) => pick('act', e.target.value)} className="rounded border bg-white px-2 py-1.5" aria-label="요청동작">
            <option value="">동작 전체</option>
            {Object.entries(ACT_NM).map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          {approver ? (
            <label>
              <input type="checkbox" checked={cond.mine} onChange={(e) => setCond({ ...cond, mine: e.target.checked, page: 1 })} /> 내 신청만
            </label>
          ) : (
            <span className="text-gray-500">본인 신청만 표시됩니다</span>
          )}
          <span className="ml-auto text-gray-600">총 {total.toLocaleString()}건</span>
        </div>
        {canSel && <p className="px-4 pb-3 text-xs text-gray-600">단어 → 도메인 → 용어 순서로 승인하십시오(용어는 승인완료 단어·도메인만 사용)</p>}
      </section>

      {/* 선택 처리 바(대기 탭·승인권자) */}
      {canSel && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#c7d2e6] bg-[#f4f7fc] px-4 py-2">
          <span className="font-medium">선택 {sel.size.toLocaleString()}건</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="승인 의견(선택) · 반려 사유(반려 시 필수)" className="min-w-64 flex-1 rounded border bg-white px-3 py-1.5" aria-label="선택 처리 의견·사유" />
          <button onClick={() => actSel('APV')} disabled={busy || sel.size === 0} className="btn-3d">
            선택 승인
          </button>
          <button onClick={() => actSel('RJCT')} disabled={busy || sel.size === 0 || !note.trim()} className="rounded border border-red-300 bg-white px-4 py-1.5 text-red-700 disabled:opacity-40">
            선택 반려
          </button>
        </div>
      )}
      {batch && (
        <div role="status" className="rounded border bg-white px-4 py-2">
          <p className="font-medium">
            성공 {batch.done.toLocaleString()} · 실패 <span className={batch.failed ? 'text-red-700' : ''}>{batch.failed.toLocaleString()}</span>
          </p>
          {batch.failed > 0 && (
            <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-red-700">
              {batch.results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.id}>
                    {nameOf(r.id)} : {r.message ?? r.code}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="text-gray-700">
          {msg}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr className="thead-3d text-center">
              {heads.map((h, i) => (
                <th key={i} className="whitespace-nowrap border px-2 py-2">
                  {i === 0 && canSel ? <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(items.map((r) => r.apv_req_id)))} aria-label="현재 페이지 전체 선택" title="현재 페이지 전체 선택" /> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={heads.length} className="border px-2 py-4 text-center text-gray-500">
                  요청이 없습니다
                </td>
              </tr>
            ) : (
              items.map((r, i) => {
                const [nm, phy] = tgtName(r)
                const self = !!r.apv_usr_id && r.apv_usr_id === r.req_usr_id
                const v = r.aftr_val ?? {}
                return (
                  <Fragment key={r.apv_req_id}>
                    <tr onClick={() => setOpen(open === r.apv_req_id ? null : r.apv_req_id)} className={`cursor-pointer ${open === r.apv_req_id ? 'bg-[#eef3fb]' : sel.has(r.apv_req_id) ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                      {canSel && (
                        <td className="border px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={sel.has(r.apv_req_id)} onChange={() => toggle(r.apv_req_id)} aria-label="선택" />
                        </td>
                      )}
                      <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                      <td className="whitespace-nowrap border px-2 py-1 text-center">{TGT_NM[r.tgt_tp_cd] ?? r.tgt_tp_cd}</td>
                      <td className="whitespace-nowrap border px-2 py-1 text-center">{actNm(r)}</td>
                      <td className="border px-2 py-1">
                        <span className="font-medium">{String(nm ?? '')}</span>
                        {phy ? <span className="ml-1 font-mono text-gray-600">({String(phy)})</span> : null}
                      </td>
                      <td className="whitespace-nowrap border px-2 py-1">{r.req?.pi_usr_nm}</td>
                      <td className="whitespace-nowrap border px-2 py-1 tabular-nums">{fmt(r.reg_dtm)}</td>
                      <td className="border px-2 py-1">{r.req_rsn_txt}</td>
                      {done ? (
                        <>
                          <td className="whitespace-nowrap border px-2 py-1">
                            {r.apv?.pi_usr_nm}
                            {self && <span className="ml-1 rounded bg-amber-100 px-1.5 text-xs text-amber-800">자기 승인</span>}
                          </td>
                          <td className="whitespace-nowrap border px-2 py-1 tabular-nums">{fmt(r.apv_dtm)}</td>
                          <td className="border px-2 py-1">{cond.sts === 'RJCT' ? r.rjct_rsn_txt : r.apv_opn_txt}</td>
                        </>
                      ) : (
                        <td className="whitespace-nowrap border px-2 py-1" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {approver && (
                              <>
                                <input
                                  value={reason[r.apv_req_id] ?? ''}
                                  onChange={(e) => setReason({ ...reason, [r.apv_req_id]: e.target.value })}
                                  maxLength={2000}
                                  placeholder="의견·반려사유"
                                  className="w-32 rounded border px-1 py-0.5"
                                  aria-label="의견·반려사유"
                                />
                                <button onClick={() => act(r.apv_req_id, 'APV')} disabled={busy} className="btn-3d !px-2 !py-0.5">
                                  승인
                                </button>
                                <button onClick={() => act(r.apv_req_id, 'RJCT')} disabled={busy || !reason[r.apv_req_id]?.trim()} className="rounded border border-red-300 px-2 py-0.5 text-red-700 disabled:opacity-40">
                                  반려
                                </button>
                              </>
                            )}
                            {r.req_usr_id === me && (
                              <button onClick={() => act(r.apv_req_id, 'CNCL')} disabled={busy} className="rounded border px-2 py-0.5 text-gray-700 disabled:opacity-40">
                                취소
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {open === r.apv_req_id && (
                      <tr>
                        <td colSpan={heads.length} className="border bg-[#f8fafd] px-4 py-3">
                          <p className="mb-1 font-medium">요청 내용</p>
                          {Object.keys(v).length === 0 ? (
                            <p className="text-gray-500">내용 없음(삭제 요청)</p>
                          ) : (
                            <table className="border-collapse text-xs">
                              <tbody>
                                {Object.entries(v).map(([k, x]) => (
                                  <tr key={k}>
                                    <th className="border bg-gray-100 px-2 py-1 text-left font-medium">{FIELD_NM[k] ?? k}</th>
                                    <td className="border px-2 py-1 font-mono">{x == null || x === '' ? '(비움)' : typeof x === 'object' ? JSON.stringify(x) : String(x)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이징 : « ‹ 1~5 › » + 페이지당 건수 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-gray-600">
          {total.toLocaleString()}건 · {cond.page}/{pages}쪽
        </span>
        <div className="mx-auto flex items-center gap-1">
          {[
            ['«', 1],
            ['‹', cond.page - 1],
          ].map(([l, p]) => (
            <button key={l} onClick={() => go(p as number)} disabled={cond.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
              {l}
            </button>
          ))}
          {Array.from({ length: Math.min(5, pages) }, (_, i) => Math.min(Math.max(1, cond.page - 2), Math.max(1, pages - 4)) + i).map((p) => (
            <button key={p} onClick={() => go(p)} aria-current={p === cond.page ? 'page' : undefined} className={`min-w-8 rounded border px-2 py-1 ${p === cond.page ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : ''}`}>
              {p}
            </button>
          ))}
          {[
            ['›', cond.page + 1],
            ['»', pages],
          ].map(([l, p]) => (
            <button key={l} onClick={() => go(p as number)} disabled={cond.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
              {l}
            </button>
          ))}
        </div>
        <select value={cond.size} onChange={(e) => setCond({ ...cond, size: Number(e.target.value), page: 1 })} className="rounded border px-2 py-1" aria-label="페이지당 건수">
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}건씩
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

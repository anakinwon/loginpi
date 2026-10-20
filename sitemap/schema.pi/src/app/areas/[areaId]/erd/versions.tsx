'use client'
// 모델 버전 패널(PRD_PiErd S5 ERD-4) — ERD 툴바 '버전' : 현재 논리 모델 스냅샷 저장·목록(페이지)·삭제, 두 버전 또는 버전 ↔ 현재 비교(추가·삭제·변경)
// 비교 결과 = 목록 + 'ERD 에 표시'(캔버스 색 강조, onShow — 기준 → 현재 모델 비교일 때만 캔버스와 맞음) — 저장·삭제는 MODEL_EDIT, 조회·비교는 MODEL_VIEW
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import type { Diff, DiffItem } from '@/lib/modelpi/ver'

interface Ver {
  ver_id: string
  ver_seq: number
  ver_nm: string
  ver_desc: string | null
  ent_cnt: number
  attr_cnt: number
  rel_cnt: number
  reg_dtm: string
}
interface DiffRes {
  from: { ver_seq: number; ver_nm: string }
  to: { ver_seq: number; ver_nm: string } | null
  diff: Diff
  cnt: { ins: number; del: number; upd: number }
}
const SIZE = 10
const OP = { INS: ['추가', 'text-emerald-700 bg-emerald-50'], DEL: ['삭제', 'text-red-700 bg-red-50'], UPD: ['변경', 'text-amber-800 bg-amber-50'] } as const
const FLD: Record<string, string> = {
  ent_log_nm: '논리명', tbl_phy_nm: '물리명', ent_tp_cd: '유형', subj_nm: '주제영역', ent_desc: '설명',
  term_log_nm: '용어', term_phy_nm: '물리명', dom_nm: '도메인', pk_yn: 'PK', pk_seq: 'PK 순서', esntl_yn: '필수', fk_rel_id: '상속 관계', attr_desc: '설명',
  prnt_ent_id: '부모', chld_ent_id: '자식', rel_nm: '관계명', crdn_cd: '카디널리티', idnt_yn: '식별', prnt_opt_yn: '부모 선택', chld_opt_yn: '자식 선택', rel_desc: '설명',
}
const v = (x: unknown) => (x === null ? '(없음)' : String(x))
const vNm = (x: { ver_seq: number; ver_nm: string } | null) => (x ? `v${x.ver_seq} ${x.ver_nm}` : '현재 모델')

function Items({ title, xs }: { title: string; xs: DiffItem[] }) {
  if (!xs.length) return null
  return (
    <div>
      <div className="mt-2 font-semibold">
        {title} {xs.length}
      </div>
      <ul className="divide-y rounded border">
        {xs.map((x) => (
          <li key={`${x.op}${x.id}`} className="px-2 py-1">
            <span className={`mr-2 rounded px-1.5 text-xs ${OP[x.op][1]}`}>{OP[x.op][0]}</span>
            {title === '속성' && <span className="text-gray-500">{x.ent_nm} · </span>}
            {x.nm}
            {x.chg && (
              <div className="mt-0.5 pl-12 text-xs text-gray-600">
                {x.chg.map((c) => (
                  <div key={c.fld}>
                    {FLD[c.fld] ?? c.fld} : <del className="text-red-600">{v(c.bfr)}</del> → <span className="text-emerald-700">{v(c.aftr)}</span>
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface VerShow {
  title: string
  diff: Diff
  cnt: DiffRes['cnt']
}
export function VersionPanel({ api, prjId, editor, onClose, onShow }: { api: string; prjId: string; editor: boolean; onClose: () => void; onShow: (v: VerShow) => void }) {
  const base = `${api}/projects/${prjId}/versions`
  const [rows, setRows] = useState<Ver[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [nm, setNm] = useState('')
  const [desc, setDesc] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('') // '' = 현재 모델
  const [res, setRes] = useState<DiffRes | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const j = await (await piFetch(`${base}?page=${page}&size=${SIZE}`)).json()
    if (!j.ok) return setMsg(j.message ?? '버전 목록을 불러오지 못했습니다')
    setRows(j.rows)
    setTotal(j.total)
  }, [base, page])
  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setBusy(true)
    setMsg('')
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ver_nm: nm, ver_desc: desc || null }) })).json()
    setBusy(false)
    if (!j.ok) return setMsg(j.message ?? '저장하지 못했습니다')
    setNm('')
    setDesc('')
    setMsg(`v${j.item.ver_seq} 저장됨`)
    if (page === 1) void load()
    else setPage(1)
  }
  async function del(x: Ver) {
    if (!confirm(`v${x.ver_seq} ${x.ver_nm} 버전을 삭제할까요? (번호는 다시 쓰지 않습니다)`)) return
    const j = await (await piFetch(`${base}?ver=${x.ver_id}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message ?? '삭제하지 못했습니다')
    if (from === x.ver_id) setFrom('')
    if (to === x.ver_id) setTo('')
    void load()
  }
  async function compare() {
    setBusy(true)
    setMsg('')
    setRes(null)
    const j = await (await piFetch(`${base}?from=${from}${to ? `&to=${to}` : ''}`)).json()
    setBusy(false)
    if (!j.ok) return setMsg(j.message ?? '비교하지 못했습니다')
    setRes(j)
  }

  const pages = Math.max(1, Math.ceil(total / SIZE))
  const sel = 'rounded border px-2 py-1'
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded bg-white p-4 text-sm text-gray-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">모델 버전 — 스냅샷·비교</h2>
          <button type="button" className="rounded px-2 py-1 hover:bg-gray-100" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">프로젝트 논리 모델(엔터티·속성·관계) 전체를 지금 상태 그대로 저장합니다. 저장한 버전은 바뀌지 않습니다.</p>

        {editor && (
          <div className="mb-3 flex flex-wrap gap-2">
            <input className={`${sel} min-w-0 flex-1`} maxLength={100} placeholder="버전명(예 : 1차 검토본)" value={nm} onChange={(e) => setNm(e.target.value)} />
            <input className={`${sel} min-w-0 flex-[2]`} maxLength={2000} placeholder="설명(선택)" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <button type="button" className="rounded bg-[#1f3a68] px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={busy || !nm.trim()} onClick={() => void save()}>
              현재 모델 저장
            </button>
          </div>
        )}

        <ul className="divide-y rounded border">
          {rows.map((x) => (
            <li key={x.ver_id} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <span className="font-mono font-semibold">v{x.ver_seq}</span>
              <span className="min-w-0 flex-1">
                {x.ver_nm}
                {x.ver_desc && <span className="ml-1 text-xs text-gray-500">— {x.ver_desc}</span>}
              </span>
              <span className="text-xs text-gray-500">
                엔터티 {x.ent_cnt} · 속성 {x.attr_cnt} · 관계 {x.rel_cnt} · {new Date(x.reg_dtm).toLocaleString()}
              </span>
              {editor && (
                <button type="button" className="rounded px-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => void del(x)}>
                  삭제
                </button>
              )}
            </li>
          ))}
          {!rows.length && <li className="px-2 py-3 text-center text-gray-500">저장한 버전이 없습니다</li>}
        </ul>
        <div className="mt-1 flex items-center justify-end gap-2 text-xs">
          총 {total}건 · {page} / {pages}
          <button type="button" className="rounded border px-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </button>
          <button type="button" className="rounded border px-2 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="font-semibold">비교</span>
          <select className={sel} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="기준 버전">
            <option value="">기준 버전 선택</option>
            {rows.map((x) => (
              <option key={x.ver_id} value={x.ver_id}>
                v{x.ver_seq} {x.ver_nm}
              </option>
            ))}
          </select>
          →
          <select className={sel} value={to} onChange={(e) => setTo(e.target.value)} aria-label="대상 버전">
            <option value="">현재 모델</option>
            {rows.map((x) => (
              <option key={x.ver_id} value={x.ver_id}>
                v{x.ver_seq} {x.ver_nm}
              </option>
            ))}
          </select>
          <button type="button" className="rounded bg-[#1f3a68] px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={busy || !from || from === to} onClick={() => void compare()}>
            비교
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-[#1f3a68]">{msg}</p>}

        {res && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              {vNm(res.from)} → {vNm(res.to)} : 추가 {res.cnt.ins} · 삭제 {res.cnt.del} · 변경 {res.cnt.upd}
              {/* 캔버스 = 현재 모델 — 대상이 현재일 때만 색 위치가 정확(두 과거 버전 비교는 목록으로) */}
              {!res.to && res.cnt.ins + res.cnt.del + res.cnt.upd > 0 && (
                <button type="button" className="rounded bg-emerald-600 px-2 py-0.5 text-sm text-white hover:bg-emerald-700" onClick={() => (onShow({ title: `${vNm(res.from)} → 현재 모델`, diff: res.diff, cnt: res.cnt }), onClose())}>
                  ERD 에 표시
                </button>
              )}
            </div>
            {res.cnt.ins + res.cnt.del + res.cnt.upd === 0 && <p className="mt-1 text-gray-500">차이가 없습니다</p>}
            <Items title="엔터티" xs={res.diff.ents} />
            <Items title="속성" xs={res.diff.attrs} />
            <Items title="관계" xs={res.diff.rels} />
          </div>
        )}
      </div>
    </div>
  )
}

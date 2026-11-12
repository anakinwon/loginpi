'use client'
// 모델 버전 패널(PRD_PiErd S5 ERD-4) — ERD 툴바 '버전' : 현재 논리 모델 스냅샷 저장·목록(페이지)·삭제, 두 버전 또는 버전 ↔ 현재 비교(추가·삭제·변경)
// 비교 결과 = 목록 + 'ERD 에 표시'(캔버스 색 강조, onShow — 기준 → 현재 모델 비교일 때만 캔버스와 맞음) — 저장·삭제는 MODEL_EDIT, 조회·비교는 MODEL_VIEW
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react'
import { InfoTip } from '@/components/page-head'
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
const OP = { INS: ['추가', 'ok'], DEL: ['삭제', 'danger'], UPD: ['변경', 'warn'] } as const // [표시명, 배지 톤]
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
      <div className="mt-3 mb-1 text-sm font-semibold text-ink">
        {title} <span className="font-mono text-xs font-normal text-ink-3 tabular-nums">{xs.length}</span>
      </div>
      <ul className="divide-y divide-line rounded-card border border-line">
        {xs.map((x) => (
          <li key={`${x.op}${x.id}`} className="px-3 py-1.5">
            <span className="badge me-2" data-tone={OP[x.op][1]}>{OP[x.op][0]}</span>
            {title === '속성' && <span className="text-ink-3">{x.ent_nm} · </span>}
            {x.nm}
            {x.chg && (
              <div className="mt-0.5 ps-12 text-xs text-ink-2">
                {x.chg.map((c) => (
                  <div key={c.fld}>
                    {FLD[c.fld] ?? c.fld} : <del className="text-danger">{v(c.bfr)}</del> → <span className="text-ok">{v(c.aftr)}</span>
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
  const sel = 'input'
  return (
    <div className="fixed inset-0 z-[900] flex items-start justify-center overflow-auto bg-[rgb(16_24_40/0.4)] p-4 pt-16" onClick={onClose}>
      <div role="dialog" aria-label="모델 버전" className="w-full max-w-3xl rounded-sheet border border-line bg-surface text-sm text-ink shadow-2" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head justify-between">
          <span className="flex items-center gap-1">
            모델 버전
            <InfoTip label="모델 버전">프로젝트 논리 모델(엔터티·속성·관계) 전체를 지금 상태 그대로 저장합니다. 저장한 버전은 바뀌지 않습니다.</InfoTip>
          </span>
          <button type="button" className="btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="닫기" title="닫기">
            <X aria-hidden />
          </button>
        </div>
        <div className="p-4">
          {editor && (
            <div className="mb-3 flex flex-wrap gap-2">
              <input className={`${sel} min-w-0 flex-1`} maxLength={100} placeholder="버전명" aria-label="버전명" value={nm} onChange={(e) => setNm(e.target.value)} />
              <input className={`${sel} min-w-0 flex-[2]`} maxLength={2000} placeholder="설명" aria-label="설명" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <button type="button" className="btn-3d" disabled={busy || !nm.trim()} onClick={() => void save()}>
                현재 모델 저장
              </button>
            </div>
          )}

          <ul className="divide-y divide-line rounded-card border border-line">
            {rows.map((x) => (
              <li key={x.ver_id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <span className="font-mono text-xs text-ink-3 tabular-nums">v{x.ver_seq}</span>
                <span className="min-w-0 flex-1 font-medium">
                  {x.ver_nm}
                  {x.ver_desc && <span className="ms-1 text-xs font-normal text-ink-3">— {x.ver_desc}</span>}
                </span>
                <span className="text-xs text-ink-3 tabular-nums">
                  엔터티 {x.ent_cnt} · 속성 {x.attr_cnt} · 관계 {x.rel_cnt} · {new Date(x.reg_dtm).toLocaleString()}
                </span>
                {editor && (
                  <button type="button" className="btn-ghost btn-icon btn-sm hover:text-danger" onClick={() => void del(x)} aria-label="삭제" title="삭제">
                    <Trash2 aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {!rows.length && <li className="px-3 py-6 text-center text-dense text-ink-3">저장한 버전 없음</li>}
          </ul>
          <div className="mt-2 flex items-center justify-end gap-1">
            <span className="me-auto font-mono text-xs text-ink-3 tabular-nums">
              총 {total.toLocaleString()}건 · {page} / {pages}
            </span>
            <button type="button" className="btn-ghost btn-icon btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="이전" title="이전">
              <ChevronLeft className="rtl:rotate-180" aria-hidden />
            </button>
            <button type="button" className="btn-ghost btn-icon btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="다음" title="다음">
              <ChevronRight className="rtl:rotate-180" aria-hidden />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-sm font-semibold">비교</span>
            <select className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="기준 버전">
              <option value="">기준 버전</option>
              {rows.map((x) => (
                <option key={x.ver_id} value={x.ver_id}>
                  v{x.ver_seq} {x.ver_nm}
                </option>
              ))}
            </select>
            <span className="text-ink-3">→</span>
            <select className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="대상 버전">
              <option value="">현재 모델</option>
              {rows.map((x) => (
                <option key={x.ver_id} value={x.ver_id}>
                  v{x.ver_seq} {x.ver_nm}
                </option>
              ))}
            </select>
            <button type="button" className="btn-key" disabled={busy || !from || from === to} onClick={() => void compare()}>
              비교
            </button>
          </div>
          {msg && <p role="status" className="mt-2 text-dense text-ink-2">{msg}</p>}

          {res && (
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {vNm(res.from)} → {vNm(res.to)}
                <span className="font-normal text-ink-2 tabular-nums">
                  추가 {res.cnt.ins} · 삭제 {res.cnt.del} · 변경 {res.cnt.upd}
                </span>
                {/* 캔버스 = 현재 모델 — 대상이 현재일 때만 색 위치가 정확(두 과거 버전 비교는 목록으로) */}
                {!res.to && res.cnt.ins + res.cnt.del + res.cnt.upd > 0 && (
                  <button type="button" className="btn-key btn-sm ms-auto" onClick={() => (onShow({ title: `${vNm(res.from)} → 현재 모델`, diff: res.diff, cnt: res.cnt }), onClose())}>
                    ERD 에 표시
                  </button>
                )}
              </div>
              {res.cnt.ins + res.cnt.del + res.cnt.upd === 0 && <p className="mt-1 text-dense text-ink-3">차이 없음</p>}
              <Items title="엔터티" xs={res.diff.ents} />
              <Items title="속성" xs={res.diff.attrs} />
              <Items title="관계" xs={res.diff.rels} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 등록·수정 폼(논리 모델 화면용, sql/026 모델 단계) — 주제영역·엔터티명 → 승인 표준단어 분해 후보·물리명 미리보기(GET …/entities/analyze) → 유형·설명·단계
// 등록 = 논리 엔터티(LGCL), 수정 = 이름(분해 후보 다시 선택)·유형·설명·주제영역(같은 프로젝트)·단계(논리 ↔ 핵심 승격). 이름은 서버가 표준단어로 다시 만든다(클라이언트 값 불신)
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ENT_TP } from '@/lib/model-name'
import { confirmSave } from '../words/word-board'

export interface EntInit {
  ent_id: string
  ver_no: number
  subj_id: string
  ent_log_nm: string
  ent_tp_cd: string
  ent_desc: string | null
  dic_ids: string[]
  mdl_lvl_cd: string
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
const RULE_MSG: Record<string, string> = {
  ENT_FORBIDDEN_WORD: '금칙어 포함',
  ENT_LAST_ATTR: '속성 분류어(도메인 단어)로 끝남 : 테이블명은 속성 불필요',
  ENT_AGG_SUFFIX: "집계 엔터티는 '집계'로 끝나야 함",
}
const LVL_NM: Record<string, string> = { LGCL: '논리', CNCP: '핵심' }
const DELAY = 400

export default function EntForm({ api, areaId, subjs, init, onDone, onCancel }: { api: string; areaId: string; subjs: { subj_id: string; subj_nm: string }[]; init?: EntInit; onDone: (entId: string, msg: string) => void; onCancel: () => void }) {
  const [subj, setSubj] = useState(init?.subj_id ?? subjs[0]?.subj_id ?? '')
  const [name, setName] = useState(init?.ent_log_nm ?? '')
  const [tp, setTp] = useState(init?.ent_tp_cd ?? 'BASE')
  const [desc, setDesc] = useState(init?.ent_desc ?? '')
  const [lvl, setLvl] = useState(init?.mdl_lvl_cd ?? 'LGCL')
  const [cands, setCands] = useState<Cand[]>([])
  const [pick, setPick] = useState(0)
  const [msg, setMsg] = useState('')

  // 주제영역 목록이 폼보다 늦게 도착하면 첫 주제영역으로
  useEffect(() => {
    if (!subj && subjs[0]) setSubj(subjs[0].subj_id)
  }, [subj, subjs])
  useEffect(() => {
    const nm = name.trim()
    if (!nm) return setCands([])
    const t = setTimeout(async () => {
      const j = await (await piFetch(`${api}/entities/analyze?${new URLSearchParams({ name: nm, tp, ...(subj ? { subj } : {}) })}`)).json()
      if (j.ok) {
        setCands(j.candidates)
        setPick(0)
      }
    }, DELAY)
    return () => clearTimeout(t)
  }, [api, name, tp, subj])

  const cur = cands[pick]
  // 수정 중 자기 이름은 중복이 아님
  const dup = !!cur?.dup && cur.ent_log_nm !== init?.ent_log_nm
  const ok = !!subj && !!cur?.complete && !cur.rule_error && !dup

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || !confirmSave(!!init, `엔터티 ${cur.ent_log_nm}(${LVL_NM[lvl]})을(를) `)) return
    const body = { subj_id: subj, dic_ids: cur.dic_ids, ent_tp_cd: tp, ent_desc: desc.trim() || null, mdl_lvl_cd: lvl }
    const j = await (
      await piFetch(init ? `${api}/entities/${init.ent_id}` : `${api}/entities`, {
        method: init ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(init ? { ...body, ver_no: init.ver_no } : body),
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    onDone(j.item.ent_id, `엔터티 ${j.item.ent_log_nm} ${init ? '수정' : '등록'} 완료`)
  }

  return (
    <form onSubmit={save} className="space-y-2 rounded-xl border border-[#1f3a68] bg-[#f8fafd] p-4 text-sm shadow-sm" aria-label={init ? '엔터티 수정' : '엔터티 추가'}>
      <h3 className="font-semibold text-[#1f3a68]">{init ? `엔터티 수정 — ${init.ent_log_nm}` : '＋ 논리 엔터티 추가'}</h3>
      <div className="grid gap-2 md:grid-cols-4">
        <select value={subj} onChange={(e) => setSubj(e.target.value)} className="rounded border border-[#b8c6e0] bg-white px-2 py-1.5" aria-label="주제영역">
          {subjs.length === 0 && <option value="">주제영역이 없습니다(개념 모델에서 등록)</option>}
          {subjs.map((s) => (
            <option key={s.subj_id} value={s.subj_id}>
              {s.subj_nm}
            </option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="엔터티명(예 : 주문배송이력)" maxLength={200} className="rounded border border-[#b8c6e0] bg-white px-2 py-1.5 md:col-span-2" aria-label="엔터티명" />
        <select value={tp} onChange={(e) => setTp(e.target.value)} className="rounded border border-[#b8c6e0] bg-white px-2 py-1.5" aria-label="엔터티 유형">
          {Object.entries(ENT_TP).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명(관리하는 데이터)" maxLength={4000} className="rounded border border-[#b8c6e0] bg-white px-2 py-1.5 md:col-span-3" aria-label="설명" />
        {init && (
          <select value={lvl} onChange={(e) => setLvl(e.target.value)} className="rounded border border-[#b8c6e0] bg-white px-2 py-1.5" aria-label="모델 단계">
            <option value="LGCL">논리 엔터티</option>
            <option value="CNCP">핵심 엔터티(개념 모델에 표시)</option>
          </select>
        )}
      </div>
      {cands.length > 0 && (
        <div className="space-y-1">
          {cands.map((c, i) => (
            <label key={i} className={`flex cursor-pointer flex-wrap items-center gap-2 rounded border px-3 py-1 ${i === pick ? 'border-[#1f3a68] bg-white' : 'border-transparent'}`}>
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
              {c.dup && c.ent_log_nm !== init?.ent_log_nm && <span className="text-red-700">같은 이름의 엔터티 있음</span>}
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
      {msg && <p className="text-red-700">{msg}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="underline">
          취소
        </button>
        <button disabled={!ok} className="btn-3d px-6 disabled:opacity-40">
          {init ? '저장' : '등록'}
        </button>
      </div>
    </form>
  )
}

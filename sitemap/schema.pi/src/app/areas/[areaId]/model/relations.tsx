'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 관계 화면(PRD §2.5 MD1 잔여) — 선택 프로젝트의 관계 목록·등록·수정·삭제. 부모·자식 = 프로젝트 엔터티 선택, 카디널리티·식별·선택성, IE 표기 미리보기
// 규칙 위반(N:M·자기참조 식별, 식별+부모 선택)은 입력 중 표시·등록 버튼 비활성(서버가 같은 규칙으로 재검증)
// FK 상속(PRD_PiErd S1 L1) : 관계 저장 뒤 부모 주식별자 → 자식 상속 속성 계획(GET …/fk-plan) 미리보기 → 1회 확인 적용(POST)
// 엔터티 선택지 = 핵심·논리 단계 전체(sql/026, 논리 엔터티도 관계 대상), onSaved = 등록·수정·삭제 뒤 호출(논리 화면 점검 새로 고침)
// 업종 추천 관계(반자동) : 프로젝트 업종 템플릿 관계 중 양쪽 엔터티가 등록된 것 → 칩을 누르면 폼만 채움(저장은 등록 버튼)
import { useCallback, useEffect, useState } from 'react'
import { CRDN, relError, relNotation } from '@/lib/model-rel'
import { ActorCells, confirmSave, noEnterSubmit } from '../words/word-board'
import { TermPick, type Term } from './attrs'

interface EntOpt {
  ent_id: string
  ent_log_nm: string
  mdl_subj: { subj_nm: string; lgc_sts_cd?: string }
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
interface RelRec {
  prnt_ent_id: string
  chld_ent_id: string
  prnt_nm: string
  chld_nm: string
  crdn_cd: string
  idnt_yn: string
  rel_nm: string
}
const F0 = { prnt_ent_id: '', chld_ent_id: '', rel_nm: '', crdn_cd: '1N', idnt_yn: 'N', prnt_opt_yn: 'N', chld_opt_yn: 'Y', rel_desc: '' }
const RULE_MSG: Record<string, string> = { REL_NM_IDNT: 'N:M 관계는 식별 불가', REL_SELF_IDNT: '자기참조는 식별 불가', REL_IDNT_OPT: '식별 관계는 부모 필수' }
const SIZE = 20

type Need = { src_attr_id: string; term_id: string; term_log_nm: string; reason: 'SELF' | 'OTHER_REL' | 'OWN_PK' }
const NEED_NM = { SELF: '자기참조 — 자기 식별자와 같은 용어 불가, "상위~" 역할 용어로 상속', OTHER_REL: '같은 용어가 이미 다른 관계로 상속됨 — 역할 용어(예 발신·수신)로 상속', OWN_PK: '자식이 같은 용어를 자기 주식별자로 씀 — 식별 관계로 바꾸거나(권장) 필요하면 역할 용어로 상속(선택)' } as const

// locked = 선택 주제영역 작성완료(sql/031 MLK01 편집 잠금) → 등록·저장 비활성, 완료 취소 후 편집 안내
export default function Relations({ api, prjId, editor, entsKey, onSaved, locked = false }: { api: string; prjId: string; editor: boolean; entsKey: unknown; onSaved?: () => void; locked?: boolean }) {
  const areaId = api.slice(api.lastIndexOf('/') + 1) // api = /api/areas/{areaId}
  // 역할명 상속 패널(S1 L2) : FK 계획에서 같은 용어로 상속할 수 없는 식별자 → 역할 용어 선택 후 적용
  const [roleNeed, setRoleNeed] = useState<{ relId: string; title: string; items: Need[] } | null>(null)
  const [rolePick, setRolePick] = useState<Record<string, Term | null>>({})
  // N:M 해소 패널(S1 L3) : 교차 엔터티 이름 후보(GET …/resolve-nm) → 선택 → 생성·식별 관계 2개·N:M 삭제·FK 상속(POST)
  type NmCand = { nm: string; dic_ids: string[]; tbl_phy_nm: string; ok: boolean; missing_words: string[]; rule_error: string | null; dup: boolean }
  const [nmP, setNmP] = useState<{ relId: string; prnt: string; chld: string; rel_nm: string | null; cands: NmCand[]; pick: number } | null>(null)
  const [nmBusy, setNmBusy] = useState(false)
  const openNm = async (x: Rel) => {
    const j = await (await piFetch(`${api}/relations/${x.rel_id}/resolve-nm`)).json().catch(() => null)
    if (!j?.ok) return setMsg(j?.message ?? 'N:M 해소 후보를 불러오지 못했습니다')
    setRoleNeed(null)
    setNmP({ relId: x.rel_id, prnt: j.prnt, chld: j.chld, rel_nm: j.rel_nm, cands: j.cands, pick: Math.max(0, j.cands.findIndex((c: NmCand) => c.ok)) })
  }
  const applyNm = async () => {
    const c = nmP?.cands[nmP.pick]
    if (!nmP || !c?.ok || !confirm(`N:M 관계(${nmP.prnt} ↔ ${nmP.chld})를 교차 엔터티 '${c.nm}'로 해소합니다.\n\n· 교차 엔터티(논리) 생성\n· ${nmP.prnt}·${nmP.chld} → ${c.nm} 식별 관계 2개\n· 원래 N:M 관계 삭제\n· 두 부모 주식별자를 교차 엔터티 주식별자로 상속\n\n진행하시겠습니까?`)) return
    setNmBusy(true)
    const j = await (await piFetch(`${api}/relations/${nmP.relId}/resolve-nm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dic_ids: c.dic_ids }) })).json()
    setNmBusy(false)
    const warn = j.ok && !j.partial ? [j.no_pk ? '부모에 주식별자가 없어 교차 엔터티 식별자를 직접 지정하십시오' : '', j.needs?.length ? '두 부모 식별자 용어가 같아 역할명 상속이 필요합니다(아래 패널)' : ''].filter(Boolean).join(' · ') : ''
    setMsg(!j.ok ? j.message : j.partial ? j.message : `N:M 해소 완료 : 교차 엔터티 ${j.ent_log_nm}·식별 관계 ${j.rel_ids.length}개·FK ${j.fk_applied}건${j.fail?.length ? ` · 실패 ${j.fail.map((f: { term_log_nm: string; reason: string }) => `${f.term_log_nm}(${f.reason})`).join(', ')}` : ''}${warn ? ` · ⚠ ${warn}` : ''}`)
    if (j.ok && j.needs?.length) {
      setRolePick({})
      setRoleNeed({ relId: j.needs[0].rel_id, title: 'N:M 해소', items: j.needs[0].items })
    }
    if (j.ok) {
      setNmP(null)
      load()
      onSaved?.()
    }
  }
  const [opts, setOpts] = useState<EntOpt[]>([])
  const [rels, setRels] = useState<Rel[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [f, setF] = useState(F0)
  const [edit, setEdit] = useState<Rel | null>(null)
  const [msg, setMsg] = useState('')
  const [recs, setRecs] = useState<RelRec[]>([])

  // 프로젝트 엔터티 선택지(엔터티 등록·삭제 시 다시 조회)
  useEffect(() => {
    piFetch(`${api}/entities?${new URLSearchParams({ prj: prjId, lvl: 'ALL', size: '1000' })}`)
      .then((r) => r.json())
      .then((j) => j.ok && setOpts(j.items))
  }, [api, prjId, entsKey])
  const load = useCallback(async () => {
    const j = await (await piFetch(`${api}/relations?${new URLSearchParams({ prj: prjId, page: String(page), size: String(SIZE) })}`)).json()
    if (j.ok) {
      setRels(j.items)
      setTotal(j.total)
    }
    const r = await (await piFetch(`${api}/relations/suggest?${new URLSearchParams({ prj: prjId })}`)).json()
    if (r.ok) setRecs(r.rels)
  }, [api, prjId, page, entsKey])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    setPage(1)
    setEdit(null)
    setF(F0)
  }, [prjId])

  const rule = f.prnt_ent_id && f.chld_ent_id ? relError(f) : null
  // 중복 사전 확인(REL_DUP) : 로드된 목록에 같은 부모·자식·관계명 조합이 있으면 등록 막음(수정 중인 자기 자신 제외)
  const dup = !!f.prnt_ent_id && !!f.chld_ent_id && rels.some((x) => x.rel_id !== edit?.rel_id && x.prnt_ent_id === f.prnt_ent_id && x.chld_ent_id === f.chld_ent_id && (x.rel_nm ?? '') === f.rel_nm)
  // 잠금 = 화면이 넘긴 값 또는 고른 부모·자식 엔터티의 주제영역이 작성완료(sql/031 MLK01 과 같은 기준) — #31 가드가 호출처 미전달로 꺼져 있던 문제(R-P5, 2026-10-24 전수 점검)
  const subjDone = (id: string) => opts.find((o) => o.ent_id === id)?.mdl_subj.lgc_sts_cd === 'CMPTN'
  const lockedNow = locked || subjDone(f.prnt_ent_id) || subjDone(f.chld_ent_id)
  const ready = !!f.prnt_ent_id && !!f.chld_ent_id && !rule && !dup && !lockedNow
  const nm = (id: string) => opts.find((o) => o.ent_id === id)?.ent_log_nm ?? '?'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || !confirmSave(!!edit, '관계를 ')) return
    const body = { ...f, rel_nm: f.rel_nm || null, rel_desc: f.rel_desc || null }
    const r = edit
      ? await piFetch(`${api}/relations/${edit.rel_id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ver_no: edit.ver_no }) })
      : await piFetch(`${api}/relations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json()
    setMsg(j.ok ? (edit ? '관계를 수정했습니다' : '관계를 등록했습니다') : j.code === 'SUBJ_LOCKED' ? '작성완료 주제영역은 편집할 수 없습니다 — 완료 취소 후 편집하십시오' : j.message ?? (r.status === 409 ? '같은 부모·자식·관계명의 관계가 이미 있습니다' : '저장하지 못했습니다'))
    if (j.ok) {
      const relId = edit?.rel_id ?? j.item?.rel_id
      setF(F0)
      setEdit(null)
      load()
      if (relId) await fkFlow(relId, edit ? '관계를 수정했습니다' : '관계를 등록했습니다')
      onSaved?.()
    }
  }
  // FK 상속 계획 미리보기 → 확인 시 적용(반자동 : 사용자 1회 확인)
  const fkFlow = async (relId: string, head: string) => {
    const pj = await (await piFetch(`${api}/relations/${relId}/fk-plan`)).json().catch(() => null)
    if (!pj?.ok) return
    if (pj.no_pk && !pj.self) return setMsg(`${head} · 부모에 주식별자가 없어 FK 를 상속할 수 없습니다(부모 속성에서 주식별자 지정)`)
    const steps: { kind: 'add' | 'link' | 'fix'; term_log_nm: string; pk: boolean; esntl: boolean }[] = pj.steps
    const needs: Need[] = pj.needs ?? []
    setRolePick({})
    setRoleNeed(needs.length ? { relId, title: head, items: needs } : null)
    if (!steps.length) return setMsg(needs.length ? `${head} · 같은 용어로 상속할 수 없는 식별자 ${needs.length}건 — 아래에서 역할 용어를 고르십시오` : `${head} · FK 상속 변경 없음`)
    const KIND = { add: '추가', link: '연결', fix: 'PK·필수 수정' }
    const list = steps.map((s) => `· ${KIND[s.kind]} ${s.term_log_nm}${s.pk ? ' (PK)' : ''}${s.esntl ? ' 필수' : ' 선택'}`).join('\n')
    if (!confirm(`${head}. 부모 주식별자를 자식에 상속합니다(FK ${steps.length}건) :\n${list}\n\n확인 = 적용 / 취소 = 나중에(논리 모델 FK 점검에 남음)`)) return
    const aj = await (await piFetch(`${api}/relations/${relId}/fk-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })).json()
    setMsg(aj.ok ? `${head} · FK ${aj.applied}건 반영${aj.fail?.length ? ` · 실패 ${aj.fail.map((x: { term_log_nm: string; reason: string }) => `${x.term_log_nm}(${x.reason})`).join(', ')}` : ''}` : aj.message)
  }
  const startEdit = (x: Rel) => {
    setEdit(x)
    setF({ prnt_ent_id: x.prnt_ent_id, chld_ent_id: x.chld_ent_id, rel_nm: x.rel_nm ?? '', crdn_cd: x.crdn_cd, idnt_yn: x.idnt_yn, prnt_opt_yn: x.prnt_opt_yn, chld_opt_yn: x.chld_opt_yn, rel_desc: x.rel_desc ?? '' })
    setMsg('')
  }
  const applyRoles = async () => {
    if (!roleNeed) return
    const roles = roleNeed.items.filter((n) => rolePick[n.src_attr_id]).map((n) => ({ src_attr_id: n.src_attr_id, term_id: rolePick[n.src_attr_id]!.term_id }))
    if (!roles.length) return
    const aj = await (await piFetch(`${api}/relations/${roleNeed.relId}/fk-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roles }) })).json()
    setMsg(aj.ok ? `역할명 상속 ${aj.roled}건 반영${aj.fail?.length ? ` · 실패 ${aj.fail.map((x: { term_log_nm: string; reason: string }) => `${x.term_log_nm}(${x.reason})`).join(', ')}` : ''}` : aj.message)
    if (aj.ok && !aj.fail?.length) setRoleNeed(null)
    onSaved?.()
  }
  // 삭제 : 이 관계로 상속한 자식 속성이 있으면 "함께 삭제 / 일반 속성으로 전환" 선택(미리보기 후)
  const del = async (x: Rel) => {
    if (!confirm(`관계 ${x.prnt.ent_log_nm} → ${x.chld.ent_log_nm} 을(를) 삭제하시겠습니까?`)) return
    const pv = await (await piFetch(`${api}/relations/${x.rel_id}`)).json().catch(() => null)
    if (!pv?.ok) return setMsg('상속 속성 미리보기를 불러오지 못해 삭제를 멈췄습니다 — 다시 시도하십시오')
    const fa: { ent_log_nm: string; term_log_nm: string }[] = pv.fk_attrs
    const fk =
      fa.length && confirm(`관계는 삭제됩니다. 이 관계로 상속한 속성 ${fa.length}건(${fa.map((a) => `${a.ent_log_nm}.${a.term_log_nm}`).join(', ')})은 어떻게 할까요?\n\n확인 = 속성도 함께 삭제\n취소 = 속성은 일반 속성으로 남김(관계는 그래도 삭제)`) ? 'del' : 'keep'
    const j = await (await piFetch(`${api}/relations/${x.rel_id}?ver_no=${x.ver_no}&fk=${fk}`, { method: 'DELETE' })).json()
    setMsg(!j.ok ? j.message : j.partial ? j.message : `관계를 삭제했습니다${j.fk_attrs ? ` · 상속 속성 ${j.fk_attrs}건 ${j.fk_mode === 'del' ? '삭제' : '일반 속성으로 전환'}` : ''}`)
    if (j.ok) {
      load()
      onSaved?.()
    }
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
          {!edit && recs.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
              <span className="font-semibold text-[#1f3a68]">업종 추천 :</span>
              {recs.map((r) => (
                <button key={`${r.prnt_ent_id}|${r.chld_ent_id}|${r.rel_nm}`} type="button" onClick={() => setF({ ...F0, prnt_ent_id: r.prnt_ent_id, chld_ent_id: r.chld_ent_id, crdn_cd: r.crdn_cd, idnt_yn: r.idnt_yn, chld_opt_yn: r.idnt_yn === 'Y' ? 'N' : 'Y', rel_nm: r.rel_nm })} className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 hover:bg-amber-200">
                  {r.prnt_nm} → {r.chld_nm} <span className="text-gray-600">({r.rel_nm} · {CRDN[r.crdn_cd as keyof typeof CRDN]}{r.idnt_yn === 'Y' ? ' · 식별' : ''})</span>
                </button>
              ))}
            </div>
          )}
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
              {dup && <span className="ml-2 font-sans text-red-700">같은 부모·자식·관계명의 관계가 이미 있습니다</span>}
              {lockedNow && <span className="ml-2 font-sans text-red-700">작성완료 주제영역입니다 — 완료 취소 후 편집하십시오</span>}
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
      {nmP && editor && (
        <div className="space-y-2 rounded border border-purple-300 bg-purple-50 p-3 text-xs" aria-label="N:M 해소">
          <p className="font-semibold text-purple-900">
            N:M 해소 — {nmP.prnt} ↔ {nmP.chld}
            {nmP.rel_nm ? ` (${nmP.rel_nm})` : ''} : 교차 엔터티 이름을 고르십시오(표준단어 조합, 빨강 = 등록 불가)
          </p>
          {nmP.cands.map((c, i) => (
            <label key={c.nm} className={`flex flex-wrap items-center gap-2 ${c.ok ? '' : 'text-red-700'}`}>
              <input type="radio" disabled={!c.ok} checked={nmP.pick === i} onChange={() => setNmP({ ...nmP, pick: i })} />
              <b>{c.nm}</b>
              {c.ok && <span className="font-mono text-[#1f3a68]">{c.tbl_phy_nm}</span>}
              {c.missing_words.length > 0 && <span>미등록 단어 : {c.missing_words.join(', ')}</span>}
              {c.dup && <span>같은 이름의 엔터티 있음</span>}
              {c.rule_error && <span>{c.rule_error}</span>}
            </label>
          ))}
          {!nmP.cands.some((c) => c.ok) && <p className="text-red-700">등록 가능한 후보가 없습니다 — 표준단어를 신청하거나 논리 모델에서 엔터티를 직접 추가한 뒤 관계를 바꾸십시오</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void applyNm()} disabled={nmBusy || !nmP.cands[nmP.pick]?.ok} className="btn-3d px-4 py-0.5 disabled:opacity-40">
              {nmBusy ? '해소 중…' : '교차 엔터티로 해소'}
            </button>
            <button type="button" onClick={() => setNmP(null)} className="underline">
              닫기
            </button>
          </div>
        </div>
      )}
      {roleNeed && editor && (
        <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs" aria-label="역할명 상속">
          <p className="font-semibold text-amber-900">역할명 상속 — 같은 용어로 상속할 수 없는 부모 식별자 : 역할 용어(승인 표준용어)를 고르십시오</p>
          {roleNeed.items.map((n) => (
            <div key={n.src_attr_id} className="flex flex-wrap items-center gap-2">
              <b>{n.term_log_nm}</b>
              <span className="text-gray-600">{NEED_NM[n.reason]}</span>
              <TermPick
                api={api}
                areaId={areaId}
                picked={rolePick[n.src_attr_id] ?? null}
                onPick={(t) => setRolePick((r) => ({ ...r, [n.src_attr_id]: t }))}
                label={`${n.term_log_nm} 역할 용어 검색`}
                initialQ={n.term_log_nm}
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => void applyRoles()} disabled={!roleNeed.items.some((n) => rolePick[n.src_attr_id])} className="btn-3d px-4 py-0.5 disabled:opacity-40">
              역할명 상속 적용
            </button>
            <button type="button" onClick={() => setRoleNeed(null)} className="underline">
              {roleNeed.items.every((n) => n.reason === 'OWN_PK') ? '닫기(선택 사항 — 그대로 두어도 됨)' : '닫기(FK 점검에 "역할명 필요"로 남음)'}
            </button>
          </div>
        </div>
      )}
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
                      {x.crdn_cd === 'NM' ? (
                        <button onClick={() => void openNm(x)} className="mr-2 text-purple-700 underline" title="교차 엔터티 + 식별 관계 2개로 해소">
                          N:M 해소
                        </button>
                      ) : (
                        <button onClick={() => void fkFlow(x.rel_id, `관계 ${x.prnt.ent_log_nm} → ${x.chld.ent_log_nm}`)} className="mr-2 text-blue-700 underline" title="부모 식별자 상속(FK) 다시 점검">
                          FK
                        </button>
                      )}
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

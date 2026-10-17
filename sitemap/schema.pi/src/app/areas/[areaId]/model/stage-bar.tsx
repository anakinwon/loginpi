'use client'
import { piFetch } from '@pi/auth/client'
// 단계 상태 패널(마스터 지시 2026-10-17) — 엔터티별 논리 작성중/작성완료, 테이블별 물리 작성중/작성완료(주제영역으로 묶어 표시, subjId 를 주면 그 주제영역만)
//  논리 화면(mode LGC) : 엔터티 작성완료·완료 취소(막는 사유 표시), 주제영역 전체 완료·취소
//  물리 화면(mode PHY) : 전환 선택(작성완료·미전환 엔터티만) + 테이블 작성완료·완료 취소, 주제영역 전체 선택·전체 완료. 완료 = 편집 잠금(DB 트리거)
import { useCallback, useEffect, useMemo, useState } from 'react'

interface EntStage {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  subj_id: string
  subj_nm: string
  lgc_sts_cd: 'WRT' | 'CMPTN'
  why: string[]
}
interface PhyStage {
  phy_mdl_id: string
  dbms_cd: string
  tables: { phy_tbl_id: string; ent_id: string; tbl_nm: string; phy_sts_cd: 'WRT' | 'CMPTN' }[]
}
export interface StageData {
  ents: EntStage[]
  phy: PhyStage[]
}

const chip = (done: boolean) => `rounded px-1.5 py-0.5 text-xs ${done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`
const btn = 'rounded border px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-40'

export default function StageBar({
  api,
  prjId,
  editor,
  mode,
  dbms,
  picked,
  onPick,
  subjId,
  rev,
  onChanged,
  onLoad,
}: {
  api: string
  prjId: string
  editor: boolean
  mode: 'LGC' | 'PHY'
  dbms?: string // PHY : 선택 DBMS(그 DBMS 물리 모델 기준)
  picked?: Set<string> // PHY : 전환할 엔터티
  onPick?: (s: Set<string>) => void
  subjId?: string // 주어지면 이 주제영역 엔터티만 표시
  rev?: unknown // 바뀌면 다시 불러오기(편집 결과 반영)
  onChanged?: () => void // 상태가 바뀐 뒤(화면 갱신용)
  onLoad?: (d: StageData) => void // 불러온 뒤(화면이 엔터티 → 주제영역 매핑에 사용)
}) {
  const [d, setD] = useState<StageData | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!prjId) return setD(null)
    const j = await (await piFetch(`${api}/projects/${prjId}/stage`)).json()
    if (!j.ok) return setMsg(j.message)
    setD(j)
    onLoad?.(j)
  }, [api, prjId, onLoad])
  useEffect(() => {
    void load()
  }, [load, rev])

  const phy = d?.phy.find((p) => p.dbms_cd === dbms)
  const tblOf = useMemo(() => new Map((phy?.tables ?? []).map((t) => [t.ent_id, t])), [phy])
  const groups = useMemo(() => {
    const g = new Map<string, EntStage[]>()
    for (const e of d?.ents ?? []) if (!subjId || e.subj_id === subjId) g.set(e.subj_nm, [...(g.get(e.subj_nm) ?? []), e])
    return [...g.entries()]
  }, [d, subjId])

  const post = async (layer: 'LGC' | 'PHY', ids: string[], sts: 'WRT' | 'CMPTN', label: string) => {
    if (!ids.length) return
    if (sts === 'CMPTN' && !window.confirm(`${label} — 작성완료하면 편집이 잠깁니다(완료 취소 후 편집). 계속할까요?`)) return
    setBusy(true)
    const j = await (await piFetch(`${api}/projects/${prjId}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer, ids, sts, ...(layer === 'PHY' ? { phy_mdl_id: phy?.phy_mdl_id } : {}) }) })).json()
    setBusy(false)
    const fail = (j.fail ?? []) as { nm: string; why: string[] }[]
    if (!j.done && j.message) {
      setMsg(j.message)
      return
    }
    setMsg(`${label} : ${j.done?.length ?? 0}건 처리${fail.length ? ` · 실패 ${fail.length}(${fail.slice(0, 3).map((f) => `${f.nm} — ${f.why.join(', ')}`).join(' / ')})` : ''}`)
    await load()
    onChanged?.()
  }
  if (!d) return null
  const toggle = (ids: string[], on: boolean) => {
    if (!picked || !onPick) return
    const n = new Set(picked)
    for (const id of ids) on ? n.add(id) : n.delete(id)
    onPick(n)
  }
  const canPick = (e: EntStage) => e.lgc_sts_cd === 'CMPTN' && !tblOf.has(e.ent_id)

  return (
    <section className="mt-3 rounded-xl border border-[#c7d2e6] bg-white p-3 text-sm" aria-label="단계 상태">
      <h2 className="font-semibold text-[#1f3a68]">
        {mode === 'LGC' ? '엔터티 작성 상태' : '물리 전환·테이블 작성 상태'}{' '}
        <span className="text-xs font-normal text-gray-500">— 순서 : 엔터티 작성완료 → (엔터티 선택) 물리 전환 → 테이블 작성완료 → ERD · 작성완료하면 편집 잠금</span>
      </h2>
      {groups.map(([subj, es]) => {
        const lgDone = es.filter((e) => e.lgc_sts_cd === 'CMPTN')
        const tbls = es.map((e) => tblOf.get(e.ent_id)).filter((t): t is NonNullable<typeof t> => !!t)
        return (
          <details key={subj} className="mt-2 rounded border" open>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 bg-[#e9eff9] px-2 py-1">
              <b>{subj}</b>
              <span className="text-xs text-gray-600">
                엔터티 {es.length} · 작성완료 {lgDone.length}
                {mode === 'PHY' && ` · 전환 ${tbls.length} · 테이블 완료 ${tbls.filter((t) => t.phy_sts_cd === 'CMPTN').length}`}
              </span>
              {editor && mode === 'LGC' && (
                <span className="ml-auto flex gap-1">
                  <button type="button" className={btn} disabled={busy} onClick={(ev) => (ev.preventDefault(), void post('LGC', es.filter((e) => e.lgc_sts_cd === 'WRT').map((e) => e.ent_id), 'CMPTN', `${subj} 전체 작성완료`))}>
                    전체 작성완료
                  </button>
                  <button type="button" className={btn} disabled={busy || !lgDone.length} onClick={(ev) => (ev.preventDefault(), void post('LGC', lgDone.map((e) => e.ent_id), 'WRT', `${subj} 전체 완료 취소`))}>
                    전체 취소
                  </button>
                </span>
              )}
              {editor && mode === 'PHY' && (
                <span className="ml-auto flex gap-1">
                  <button type="button" className={btn} disabled={!es.some(canPick)} onClick={(ev) => (ev.preventDefault(), toggle(es.filter(canPick).map((e) => e.ent_id), true))}>
                    전환 대상 전체 선택
                  </button>
                  <button type="button" className={btn} disabled={busy || !tbls.some((t) => t.phy_sts_cd === 'WRT')} onClick={(ev) => (ev.preventDefault(), void post('PHY', tbls.filter((t) => t.phy_sts_cd === 'WRT').map((t) => t.phy_tbl_id), 'CMPTN', `${subj} 테이블 전체 작성완료`))}>
                    테이블 전체 작성완료
                  </button>
                </span>
              )}
            </summary>
            <ul className="divide-y">
              {es.map((e) => {
                const lg = e.lgc_sts_cd === 'CMPTN'
                const t = tblOf.get(e.ent_id)
                return (
                  <li key={e.ent_id} className="flex flex-wrap items-center gap-2 px-2 py-1">
                    {mode === 'PHY' && <input type="checkbox" disabled={!editor || !canPick(e)} checked={!!picked?.has(e.ent_id)} onChange={(ev) => toggle([e.ent_id], ev.target.checked)} aria-label={`${e.ent_log_nm} 물리 전환 선택`} title={!lg ? '엔터티 작성완료 후 전환할 수 있습니다' : t ? '이미 전환됨' : '전환할 엔터티'} />}
                    <span>{e.ent_log_nm}</span>
                    <span className="font-mono text-xs text-gray-500">{t?.tbl_nm ?? e.tbl_phy_nm}</span>
                    <span className={chip(lg)}>논리 {lg ? '작성완료' : '작성중'}</span>
                    {mode === 'PHY' && <span className={chip(t?.phy_sts_cd === 'CMPTN')}>{t ? `테이블 ${t.phy_sts_cd === 'CMPTN' ? '작성완료' : '작성중'}` : '미전환'}</span>}
                    {editor && mode === 'LGC' && (
                      <span className="ml-auto">
                        {lg ? (
                          <button type="button" className={btn} disabled={busy} onClick={() => void post('LGC', [e.ent_id], 'WRT', `${e.ent_log_nm} 완료 취소`)}>
                            완료 취소
                          </button>
                        ) : (
                          <button type="button" className={`${btn} border-[#1f3a68] text-[#1f3a68]`} disabled={busy || e.why.length > 0} title={e.why.join(' / ') || '작성완료'} onClick={() => void post('LGC', [e.ent_id], 'CMPTN', `${e.ent_log_nm} 작성완료`)}>
                            작성완료
                          </button>
                        )}
                      </span>
                    )}
                    {editor && mode === 'PHY' && t && (
                      <span className="ml-auto">
                        {t.phy_sts_cd === 'CMPTN' ? (
                          <button type="button" className={btn} disabled={busy} onClick={() => void post('PHY', [t.phy_tbl_id], 'WRT', `${t.tbl_nm} 완료 취소`)}>
                            완료 취소
                          </button>
                        ) : (
                          <button type="button" className={`${btn} border-[#1f3a68] text-[#1f3a68]`} disabled={busy || !lg} title={lg ? '테이블 작성완료' : '엔터티 작성완료가 필요합니다'} onClick={() => void post('PHY', [t.phy_tbl_id], 'CMPTN', `${t.tbl_nm} 작성완료`)}>
                            작성완료
                          </button>
                        )}
                      </span>
                    )}
                    {mode === 'LGC' && !lg && e.why.length > 0 && <span className="w-full pl-2 text-xs text-red-700">완료 조건 : {e.why.join(' · ')}</span>}
                  </li>
                )
              })}
            </ul>
          </details>
        )
      })}
      {!groups.length && <p className="mt-1 text-gray-500">엔터티가 없습니다</p>}
      {msg && (
        <p role="status" className="mt-1 text-xs font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}
    </section>
  )
}

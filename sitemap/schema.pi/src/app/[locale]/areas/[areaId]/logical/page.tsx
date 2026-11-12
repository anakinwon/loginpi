'use client'
import { piFetch } from '@pi/auth/client'
// 논리 모델 화면(MD3·MD4 1차, 2026-10-17 마스터 지시) — 개념 모델의 핵심 엔터티에서 출발하는 논리 모델링 작업대
//  상단 : 프로젝트 선택·검증 요약(준수율·PK·필수 4종·고아·FK 누락·정규화 의심)·논리 ERD(Mermaid) 복사·내려받기
//  왼쪽 : 주제영역 콤보(선택한 주제영역 1개, 물리 화면과 선택 공유) + 엔터티(주식별자 열쇠·4종 n/4·속성 수·이슈 배지) / 오른쪽 : 선택 엔터티 — 부모·자식 관계, FK 전파 누락(체크 → 적용), 정규화 의심(적용 = 이동·제거), 속성 패널(개념 모델과 공용)
//  반자동 : 점검은 저장 없음(GET …/projects/[prjId]/logical), 적용은 속성 API. 이름은 물리 전환 전까지 대문자
//  편집(sql/026) : 논리 엔터티 추가(LGCL)·엔터티 수정(이름·유형·설명·주제영역·핵심 승격)·삭제(속성·관계 연쇄), 관계 편집 패널(개념 모델 공용)
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Download, KeyRound, Pencil, Plus, Printer, TriangleAlert, Trash2 } from 'lucide-react'
import { type MbrRole, type Perm } from '@/lib/roles'
import { Icon3D } from '@/components/icon-3d'
import { InfoTip, PageHead } from '@/components/page-head'
import { MENU_ICON } from '@/lib/menu-icons'
import Attrs from '../model/attrs'
import EntForm from '../model/ent-form'
import Relations from '../model/relations'
import StageBar from '../model/stage-bar'
import { useSubj } from '../model/use-subj'

interface Attr {
  attr_id: string
  term_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_nm: string | null
  pk_yn: string
  pk_seq: number | null
  esntl_yn: string
  fk_rel_id: string | null
  ver_no: number
}
interface Ent {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  ent_tp_cd: string
  subj_nm: string
  attrs: Attr[]
  subj_id: string
  mdl_lvl_cd: string
  ent_desc: string | null
  dic_ids: string[]
  ver_no: number
}
interface Rel {
  rel_id: string
  prnt_ent_id: string
  chld_ent_id: string
  rel_nm: string | null
  crdn_cd: string
  idnt_yn: string
  prnt_opt_yn: string
}
interface Gap {
  rel_id: string
  chld_ent_id: string
  prnt_nm: string
  chld_nm: string
  term_id: string
  term_log_nm: string
  src_attr_id: string
  pk: boolean
  esntl: boolean
  role?: boolean // 역할명 상속 필요(관계 편집의 FK 버튼에서 역할 용어 선택)
}
interface Issue {
  kind: string
  ent_id: string
  attr_ids: string[]
  msg: string
  action: 'move' | 'remove' | 'split' | 'review' | 'fix'
  target_ent_id?: string
}
interface Check {
  ent_id: string
  pk: boolean
  must: number
  orphan: boolean
  fk_missing: number
  issues: number
  pass: boolean
}
interface Model {
  prj: { prj_nm: string; tbl_pfx_txt: string; trgt_dbms_cd: string }
  ents: Ent[]
  rels: Rel[]
  fkGaps: Gap[]
  issues: Issue[]
  checks: Check[]
  summary: { ents: number; passed: number; rate: number; no_pk: number; must_short: number; orphan: number; fk_missing: number; issues: number; reviews: number; std: number; rev: number }
  mermaid: string
  capped: boolean
}
const CRDN: Record<string, string> = { '11': '1:1', '1N': '1:N', NM: 'N:M' }
const KIND_NM: Record<string, string> = { '1NF': '1정규형', '2NF': '2정규형', '3NF': '3정규형', '4NF': '4정규형', KEY: '식별자', STD: '표준 정합', REV: '모델 검토' }
const ACT_NM: Record<string, string> = { move: '부모로 이동', remove: '제거', split: '분리 필요', review: '검토', fix: '수정 필요' }

export default function LogicalPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const api = `/api/areas/${areaId}`
  const [role, setRole] = useState<MbrRole | null>(null)
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [m, setM] = useState<Model | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [gapChk, setGapChk] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [rev, setRev] = useState(0) // 속성 패널 새로 그리기
  const [showMmd, setShowMmd] = useState(false)
  const [form, setForm] = useState<'new' | 'edit' | null>(null)
  const editor = perms.includes('MODEL_EDIT')

  useEffect(() => {
    piFetch(api)
      .then((r) => r.json())
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
    piFetch(`${api}/projects`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return
        setPrjs(j.items)
        const keep = typeof window !== 'undefined' ? window.localStorage.getItem(`logical-prj-${areaId}`) : null
        setPrjId(j.items.find((p: { prj_id: string }) => p.prj_id === keep)?.prj_id ?? j.items[0]?.prj_id ?? '')
      })
  }, [api, areaId])
  const load = useCallback(async () => {
    if (!prjId) return setM(null)
    const j = await (await piFetch(`${api}/projects/${prjId}/logical`)).json()
    if (!j.ok) return setMsg(j.message)
    setM(j)
    setGapChk(new Set(j.fkGaps.filter((g: Gap) => !g.role).map((g: Gap) => `${g.rel_id}|${g.term_id}`)))
  }, [api, prjId])
  useEffect(() => {
    void load()
    try {
      if (prjId) window.localStorage.setItem(`logical-prj-${areaId}`, prjId)
    } catch {}
  }, [load, prjId, areaId])

  // 주제영역 선택지 = 프로젝트 주제영역 전체(엔터티가 없는 주제영역 포함, 엔터티 추가 폼과 공용)
  const { subjs, subjId, setSubjId } = useSubj(api, prjId)

  const chkBy = useMemo(() => new Map((m?.checks ?? []).map((c) => [c.ent_id, c])), [m])
  const entBy = useMemo(() => new Map((m?.ents ?? []).map((e) => [e.ent_id, e])), [m])
  const subjEnts = useMemo(() => (m?.ents ?? []).filter((e) => e.subj_id === subjId), [m, subjId])
  const cur = sel ? entBy.get(sel) : undefined
  // 선택 엔터티가 다른 주제영역이면(수정으로 주제영역 이동·새 엔터티 등록) 콤보를 따라 바꿈
  useEffect(() => {
    if (cur && cur.subj_id !== subjId) setSubjId(cur.subj_id)
  }, [cur, subjId, setSubjId])
  const refresh = () => (setRev((v) => v + 1), void load())

  const applyGaps = async (gaps: Gap[]) => {
    if (!gaps.length || !confirm(`FK 속성 ${gaps.length}건(${gaps.map((g) => `${g.chld_nm}.${g.term_log_nm}`).join(', ')})을 전파하시겠습니까?`)) return
    setBusy(true)
    let n = 0
    const fail: string[] = []
    for (const g of gaps) {
      const j = await (
        await piFetch(`${api}/entities/${g.chld_ent_id}/attributes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term_id: g.term_id, pk_yn: g.pk ? 'Y' : 'N', esntl_yn: g.esntl ? 'Y' : 'N', fk_rel_id: g.rel_id, src_attr_id: g.src_attr_id }) })
      ).json()
      if (j.ok) n++
      else fail.push(`${g.term_log_nm}(${j.message ?? ''})`)
    }
    setBusy(false)
    setMsg(`FK ${n}건 전파${fail.length ? ` · 실패 ${fail.join(', ')}` : ''}`)
    refresh()
  }
  const applyIssue = async (i: Issue) => {
    const e = entBy.get(i.ent_id)
    const a = e?.attrs.find((x) => x.attr_id === i.attr_ids[0])
    if (!e || !a || (i.action !== 'move' && i.action !== 'remove')) return
    const tgt = i.target_ent_id ? entBy.get(i.target_ent_id) : undefined
    if (!confirm(i.action === 'move' ? `${e.ent_log_nm}.${a.term_log_nm} 을(를) ${tgt?.ent_log_nm} 로 이동하시겠습니까?` : `${e.ent_log_nm}.${a.term_log_nm} 을(를) 제거하시겠습니까?`)) return
    setBusy(true)
    if (i.action === 'move' && tgt && !tgt.attrs.some((x) => x.term_id === a.term_id)) {
      const j = await (await piFetch(`${api}/entities/${tgt.ent_id}/attributes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ term_id: a.term_id, esntl_yn: a.esntl_yn }) })).json()
      if (!j.ok) {
        setBusy(false)
        return setMsg(j.message)
      }
    }
    const d = await (await piFetch(`${api}/entities/${e.ent_id}/attributes/${a.attr_id}?ver_no=${a.ver_no}`, { method: 'DELETE' })).json()
    setBusy(false)
    setMsg(d.ok ? `${a.term_log_nm} ${ACT_NM[i.action]} 완료` : d.message)
    refresh()
  }
  const delEnt = async (e: Ent) => {
    const nr = (m?.rels ?? []).filter((r) => r.prnt_ent_id === e.ent_id || r.chld_ent_id === e.ent_id).length
    if (!confirm(`엔터티 ${e.ent_log_nm} 을(를) 삭제하시겠습니까? 속성 ${e.attrs.length}건·관계 ${nr}건도 함께 삭제됩니다(논리 삭제).`)) return
    const j = await (await piFetch(`${api}/entities/${e.ent_id}?ver_no=${e.ver_no}`, { method: 'DELETE' })).json()
    setMsg(j.ok ? (j.partial ? j.message : `엔터티 ${e.ent_log_nm} 삭제 완료`) : j.message)
    if (j.ok) {
      setSel(null)
      setForm(null)
      refresh()
    }
  }
  const formDone = (id: string, t: string) => {
    setMsg(t)
    setForm(null)
    setSel(id)
    refresh()
  }
  const copyMmd = async () => {
    try {
      await navigator.clipboard.writeText(m?.mermaid ?? '')
      setMsg('Mermaid 텍스트를 복사했습니다')
    } catch {
      setShowMmd(true)
    }
  }
  // 정의서(S1 L6) : piFetch 로 받아 내려받기·인쇄 창(Pi Browser 는 쿠키가 없어 직접 링크 불가)
  const downDoc = async (type: 'ent' | 'attr' | 'rel') => {
    const r = await piFetch(`${api}/projects/${prjId}/docs?format=csv&type=${type}`)
    if (!r.ok) return setMsg('정의서를 만들지 못했습니다')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await r.blob())
    a.download = `${m?.prj.prj_nm ?? 'model'}_${{ ent: '엔터티정의서', attr: '속성정의서', rel: '관계정의서' }[type]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    if (r.headers.get('X-Doc-Capped')) setMsg('조회 상한을 넘어 정의서가 일부만 출력되었습니다 — 주제영역 단위로 나누어 확인하십시오')
  }
  const printDoc = async () => {
    const w = window.open('', '_blank') // 팝업 차단 회피 : 클릭 시점에 창을 먼저 열고 내용을 채움
    if (!w) return setMsg('팝업이 차단되었습니다 — 팝업을 허용한 뒤 다시 누르십시오')
    const r = await piFetch(`${api}/projects/${prjId}/docs?format=html`)
    const html = r.ok ? await r.text() : '<p>정의서를 만들지 못했습니다</p>'
    w.document.open()
    w.document.write(html)
    w.document.close()
  }
  const downMmd = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([m?.mermaid ?? ''], { type: 'text/plain;charset=utf-8' }))
    a.download = `${m?.prj.prj_nm ?? 'logical'}_논리ERD.mmd`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const inSubj = new Set(subjEnts.map((e) => e.ent_id))
  const gaps = (m?.fkGaps ?? []).filter((g) => (sel ? g.chld_ent_id === sel : inSubj.has(g.chld_ent_id)))
  const iss = (m?.issues ?? []).filter((i) => (sel ? i.ent_id === sel : inSubj.has(i.ent_id)))
  const s = m?.summary

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="논리 모델" info="개념 모델의 핵심 엔터티에서 출발해 속성·식별자·관계(FK)를 완성하고 정규화를 점검합니다(점검은 저장하지 않고, 적용은 사용자가 선택)." />

      <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <select value={prjId} onChange={(e) => (setPrjId(e.target.value), setSel(null))} className="input-sm w-auto max-w-60" aria-label="프로젝트 선택">
          {prjs.length === 0 && <option value="">프로젝트 없음(개념 모델에서 등록)</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        {m && <span className="chip-phy">{m.prj.tbl_pfx_txt}_</span>}
        {m && (
          <span className="ms-auto flex flex-wrap items-center gap-1">
            <button type="button" onClick={() => void copyMmd()} className="btn-ghost btn-sm" title="논리 ERD 복사(Mermaid)">
              <Copy aria-hidden />
              Mermaid
            </button>
            <button type="button" onClick={downMmd} className="btn-ghost btn-sm" title=".mmd 내려받기">
              <Download aria-hidden />
              .mmd
            </button>
            <button type="button" onClick={() => setShowMmd((v) => !v)} aria-pressed={showMmd} className="btn-ghost btn-sm">
              텍스트
            </button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            {(['ent', 'attr', 'rel'] as const).map((t) => (
              <button key={t} type="button" onClick={() => void downDoc(t)} className="btn-ghost btn-sm" title="CSV(엑셀)">
                <Download aria-hidden />
                {{ ent: '엔터티', attr: '속성', rel: '관계' }[t]}정의서
              </button>
            ))}
            <button type="button" onClick={() => void printDoc()} className="btn-ghost btn-sm" title="3종 인쇄용(브라우저 인쇄 → PDF)">
              <Printer aria-hidden />
              인쇄
            </button>
          </span>
        )}
      </div>
      {prjId && <StageBar api={api} prjId={prjId} editor={editor} mode="LGC" subjId={subjId} rev={m} onChanged={() => void load()} />}
      {showMmd && m && <textarea readOnly value={m.mermaid} rows={10} className="input mt-3 font-mono text-xs" aria-label="Mermaid 텍스트" />}
      {msg && (
        <p role="status" className="mt-2 text-dense text-ink">
          {msg}
        </p>
      )}

      {s && (
        <section className="mt-6" aria-label="논리 모델 검증 요약">
          <div className="flex items-center gap-1">
            <h2 className="text-sm font-semibold text-ink">검증 요약</h2>
            <InfoTip>
              물리 전환(MD5) 진입 조건 : 모든 엔터티 통과(주식별자·필수 4종·관계·FK·정규화 의심 해소){m?.capped ? ' — 엔터티·속성 상한(500·5,000)에 도달해 일부만 점검' : ''}
            </InfoTip>
            {m?.capped && (
              <span className="badge" data-tone="warn">
                일부만 점검
              </span>
            )}
          </div>
          <div className="panel mt-2 grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-5 xl:grid-cols-10">
            {[
              ['준수율', `${s.rate}%`, s.rate === 100],
              ['통과 엔터티', `${s.passed}/${s.ents}`, s.passed === s.ents],
              ['PK 없음', s.no_pk, !s.no_pk],
              ['필수 4종 미달', s.must_short, !s.must_short],
              ['고아 엔터티', s.orphan, !s.orphan],
              ['FK 누락', s.fk_missing, !s.fk_missing],
              ['통과 막는 이슈', s.issues, !s.issues],
              ['표준 정합', s.std, !s.std],
              ['모델 검토', s.rev, !s.rev],
              ['검토(경고)', s.reviews, !s.reviews],
            ].map(([k, v, ok]) => (
              <div key={String(k)} className="min-h-[4.5rem] bg-surface px-3 py-2.5">
                <div className="truncate text-xs text-ink-3">{k}</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${ok ? 'text-ink' : 'text-warn'}`}>{v}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {m && (
        <div className="mt-6 grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="panel h-fit space-y-2 p-3 text-sm" aria-label="엔터티 목록">
            {editor && (
              <button type="button" onClick={() => setForm(form === 'new' ? null : 'new')} aria-pressed={form === 'new'} className="btn-3d w-full">
                <Plus aria-hidden />
                엔터티 추가
              </button>
            )}
            <select value={subjId} onChange={(e) => (setSubjId(e.target.value), setSel(null), setForm(null))} className="input" aria-label="주제영역 선택">
              {subjs.length === 0 && <option value="">주제영역 없음(개념 모델에서 등록)</option>}
              {subjs.map((x) => (
                <option key={x.subj_id} value={x.subj_id}>
                  {x.subj_nm}({(m.ents ?? []).filter((e) => e.subj_id === x.subj_id).length})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setSel(null)} aria-current={!sel || undefined} className={`flex w-full items-center rounded-control px-2 py-1.5 text-start transition-colors ${!sel ? 'bg-accent-soft font-medium text-accent-ink' : 'hover:bg-raised'}`}>
              <span className="flex-1">주제영역 엔터티 전체</span>
              <span className="font-mono text-xs tabular-nums">{subjEnts.length}</span>
            </button>
            <div className="space-y-0.5">
              {subjEnts.length === 0 && <p className="px-2 py-2 text-xs text-ink-3">엔터티 없음</p>}
              {subjEnts.map((e) => {
                const c = chkBy.get(e.ent_id)
                return (
                  <button key={e.ent_id} type="button" onClick={() => setSel(e.ent_id)} aria-current={sel === e.ent_id || undefined} className={`flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-start transition-colors ${sel === e.ent_id ? 'bg-accent-soft text-accent-ink' : 'hover:bg-raised'}`}>
                    <span className="min-w-0 flex-1 truncate">{e.ent_log_nm}</span>
                    {e.mdl_lvl_cd === 'LGCL' && (
                      <span className="badge" title="논리 모델에서 추가한 엔터티">
                        논리
                      </span>
                    )}
                    {c?.pk ? <KeyRound className="h-3.5 w-3.5 shrink-0 text-ink-3" strokeWidth={1.75} aria-label="주식별자 있음" /> : <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warn" strokeWidth={1.75} aria-label="주식별자 없음" />}
                    <span className="badge tabular-nums" data-tone={c?.must === 4 ? 'ok' : 'danger'} title="필수 4종">
                      {c?.must}/4
                    </span>
                    <span className="min-w-4 text-right font-mono text-xs text-ink-3 tabular-nums" title="속성 수">
                      {e.attrs.length}
                    </span>
                    {!!c && c.fk_missing + c.issues > 0 && (
                      <span className="badge tabular-nums" data-tone="warn" title="FK 누락 + 이슈">
                        {c.fk_missing + c.issues}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            {form === 'new' && <EntForm key="new" api={api} areaId={areaId} subjs={subjs} onDone={formDone} onCancel={() => setForm(null)} />}
            {form === 'edit' && cur && <EntForm key={`edit-${cur.ent_id}-${cur.ver_no}`} api={api} areaId={areaId} subjs={subjs} init={cur} onDone={formDone} onCancel={() => setForm(null)} />}
            {cur && (
              <div className="panel text-sm">
                <div className="panel-head flex-wrap py-2">
                  <h2 className="text-base">{cur.ent_log_nm}</h2>
                  <span className="chip-phy font-normal">{cur.tbl_phy_nm}</span>
                  <span className="badge">{cur.mdl_lvl_cd === 'LGCL' ? '논리 엔터티' : '핵심 엔터티'}</span>
                  {editor && (
                    <span className="ms-auto flex gap-2">
                      <button type="button" onClick={() => setForm(form === 'edit' ? null : 'edit')} aria-pressed={form === 'edit'} className="btn-key btn-sm">
                        <Pencil aria-hidden />
                        수정
                      </button>
                      <button type="button" onClick={() => void delEnt(cur)} className="btn-danger btn-sm">
                        <Trash2 aria-hidden />
                        삭제
                      </button>
                    </span>
                  )}
                </div>
                <div className="panel-body">
                  {cur.ent_desc && <p className="mb-2 text-dense text-ink-2">{cur.ent_desc}</p>}
                  <ul className="space-y-1 text-xs text-ink-2">
                    {m.rels
                      .filter((r) => r.chld_ent_id === cur.ent_id || r.prnt_ent_id === cur.ent_id)
                      .map((r) => {
                        const up = r.chld_ent_id === cur.ent_id
                        const o = entBy.get(up ? r.prnt_ent_id : r.chld_ent_id)
                        return (
                          <li key={r.rel_id} className="flex flex-wrap items-center gap-1.5">
                            <span className="badge">{up ? '부모' : '자식'}</span>
                            <button type="button" onClick={() => o && setSel(o.ent_id)} className="font-medium text-accent-ink hover:underline">
                              {o?.ent_log_nm}
                            </button>
                            <span className="text-ink-3">
                              {r.rel_nm ?? '관계'} · {CRDN[r.crdn_cd]} · {r.idnt_yn === 'Y' ? '식별' : '비식별'}
                              {up ? (r.prnt_opt_yn === 'Y' ? ' · 부모 선택' : ' · 부모 필수') : ''}
                            </span>
                          </li>
                        )
                      })}
                    {!m.rels.some((r) => r.chld_ent_id === cur.ent_id || r.prnt_ent_id === cur.ent_id) && (
                      <li className="flex items-center gap-1 text-warn">
                        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        고아 엔터티 · 아래 관계 편집에서 등록
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            <div className="panel text-sm">
              <div className="panel-head">
                <h3>FK 자동 전파</h3>
                {!sel && <span className="text-xs font-normal text-ink-3">전체</span>}
                <InfoTip>관계의 부모 식별자가 자식에 없음</InfoTip>
                {gaps.length > 0 && (
                  <span className="badge ms-auto tabular-nums" data-tone="warn">
                    {gaps.length}
                  </span>
                )}
              </div>
              <div className="px-4 py-3">
                {gaps.length === 0 ? (
                  <p className="text-ink-3">누락된 FK 없음</p>
                ) : (
                  <>
                    <ul className="divide-y divide-line">
                      {gaps.map((g) => {
                        const k = `${g.rel_id}|${g.term_id}`
                        return (
                          <li key={k} className="flex items-center gap-2 py-1.5">
                            <input type="checkbox" disabled={!editor || g.role} checked={!g.role && gapChk.has(k)} onChange={() => setGapChk((x) => (x.has(k) ? new Set([...x].filter((y) => y !== k)) : new Set([...x, k])))} aria-label={`${g.chld_nm} ${g.term_log_nm}`} />
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span>{g.chld_nm}</span>
                              <span className="text-ink-3">←</span>
                              <span className="font-medium">{g.term_log_nm}</span>
                              <span className="text-ink-3">({g.prnt_nm})</span>
                              <span className="inline-flex items-center gap-1 text-xs text-ink-2">
                                {g.pk && <KeyRound className="h-3 w-3" strokeWidth={1.75} aria-hidden />}
                                {g.pk ? '식별(자식 PK 포함)' : '비식별 FK'} · {g.esntl ? '필수' : '선택'}
                              </span>
                              {g.role && (
                                <span className="badge" data-tone="warn" title="아래 관계 편집의 FK 버튼에서 역할 용어 선택">
                                  역할명 필요
                                </span>
                              )}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                    {editor && (
                      <div className="mt-2 flex justify-end">
                        <button type="button" disabled={busy} onClick={() => void applyGaps(gaps.filter((g) => gapChk.has(`${g.rel_id}|${g.term_id}`)))} className="btn-key btn-sm tabular-nums">
                          선택 FK 전파 {gaps.filter((g) => gapChk.has(`${g.rel_id}|${g.term_id}`)).length}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="panel text-sm">
              <div className="panel-head">
                <h3>점검</h3>
                {!sel && <span className="text-xs font-normal text-ink-3">전체</span>}
                <InfoTip>정규화 의심·모델 검토·표준 정합. 판단은 DA, 수정 필요는 통과를 막음</InfoTip>
                {iss.length > 0 && (
                  <span className="badge ms-auto tabular-nums" data-tone="warn">
                    {iss.length}
                  </span>
                )}
              </div>
              <div className="px-4 py-3">
                {iss.length === 0 ? (
                  <p className="text-ink-3">의심 항목 없음</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {iss.map((i, k) => (
                      <li key={k} className="flex flex-wrap items-center gap-2 py-1.5">
                        <span className="badge">{KIND_NM[i.kind] ?? i.kind}</span>
                        {!sel && (
                          <button type="button" onClick={() => setSel(i.ent_id)} className="text-xs font-medium text-accent-ink hover:underline">
                            {entBy.get(i.ent_id)?.ent_log_nm}
                          </button>
                        )}
                        <span className="min-w-0 flex-1 text-ink-2">{i.msg}</span>
                        {editor && (i.action === 'move' || i.action === 'remove') && (
                          <button type="button" disabled={busy} onClick={() => void applyIssue(i)} className="btn-key btn-sm">
                            {ACT_NM[i.action]}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {cur ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">속성 : {cur.ent_log_nm}</h3>
                <Attrs key={`${cur.ent_id}-${rev}`} api={api} areaId={areaId} entId={cur.ent_id} entNm={cur.ent_log_nm} editor={editor} />
              </div>
            ) : (
              <div className="panel empty">
                <Icon3D icon={MENU_ICON.logical} />
                엔터티를 고르면 속성·관계 편집
              </div>
            )}
          </section>
        </div>
      )}
      {m && prjId && (
        <section aria-label="관계 편집">
          <Relations api={api} prjId={prjId} editor={editor} entsKey={m.ents.length} onSaved={refresh} />
        </section>
      )}
    </main>
  )
}

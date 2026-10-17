'use client'
import { piFetch } from '@pi/auth/client'
// ERD 화면(PRD_PiErd S3 E1·E3·E4·E5·E6 1차) — 모델의 뷰 : 엔터티·속성·관계는 논리 모델 정본, 여기서는 배치(좌표·고정)만 저장
//  캔버스 @xyflow/react : 엔터티 박스(내용 맞춤 크기, 유형별 색, 참조 엔터티 점선), IE 관계선(식별 실선·비식별 점선·까마귀발, 가까운 변 자동 연결)
//  자동 배치(modelpi/layout.ts) : 미리보기 → 저장·되돌리기, 새 엔터티만 배치, 고정 존중 / 표시 수준 개념·논리·물리, 논리명·물리명 전환
//  ERD 단위 = 주제영역 1개(마스터 지시 2026-10-17) — 전체 보기 없음, 다른 주제영역 엔터티(관계 상대)는 '참조 표시' 를 켤 때만
//  3단 : 왼쪽 모델 트리(주제영역 → 엔터티, 누르면 이동) · 캔버스 · 오른쪽 편집(E6 — 엔터티 추가·수정·속성, 논리 모델 화면과 같은 컴포넌트·같은 표준 검증 API), 아래 관계 편집·검토 결과
//  편집 뒤 다시 불러올 때 저장 안 한 드래그 위치는 유지
import '@xyflow/react/dist/style.css'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { autoLayout, boxSize } from '@/lib/modelpi/layout'
import { can, type MbrRole } from '@/lib/roles'
import Attrs from '../model/attrs'
import EntForm from '../model/ent-form'
import Relations from '../model/relations'

interface Attr {
  attr_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_nm: string | null
  pk_yn: string
  esntl_yn: string
  fk_rel_id: string | null
}
interface Ent {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  ent_tp_cd: string
  subj_id: string
  subj_nm: string
  ent_desc: string | null
  attrs: Attr[]
  ref: boolean
  ver_no: number
  dic_ids: string[]
  mdl_lvl_cd: string
}
interface Issue {
  kind: string
  ent_id: string
  msg: string
  action: string
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
}
type Lvl = 'CNCP' | 'LGCL' | 'PHY'
type EntData = { ent: Ent; lvl: Lvl; phy: boolean; fix: boolean }
type ENode = Node<EntData, 'ent'>

// 엔터티 유형별 색(E5) — BASE 실체·기준 / ACT 행위 / AGG 집계
const TP_COLOR: Record<string, { head: string; border: string; nm: string }> = {
  BASE: { head: '#1f3a68', border: '#3b5f9e', nm: '실체·기준' },
  ACT: { head: '#9a3412', border: '#ea580c', nm: '행위' },
  AGG: { head: '#166534', border: '#16a34a', nm: '집계' },
}
const LVL_NM: Record<Lvl, string> = { CNCP: '개념(이름)', LGCL: '논리(속성·키)', PHY: '물리(칼럼·도메인)' }

const lines = (e: Ent, lvl: Lvl, phy: boolean) =>
  lvl === 'CNCP' ? [] : e.attrs.map((a) => `${a.pk_yn === 'Y' ? '🔑' : a.fk_rel_id ? '↗' : '·'} ${phy || lvl === 'PHY' ? a.term_phy_nm : a.term_log_nm}${lvl === 'PHY' && a.dom_nm ? ` ${a.dom_nm}` : ''}${a.esntl_yn === 'Y' && a.pk_yn !== 'Y' ? ' *' : ''}`)
const title = (e: Ent, phy: boolean) => (phy ? e.tbl_phy_nm : e.ent_log_nm)
const sizeOf = (e: Ent, lvl: Lvl, phy: boolean) => boxSize(title(e, phy), lines(e, lvl, phy))

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const

function EntNode({ data, selected }: NodeProps<ENode>) {
  const { ent: e, lvl, phy, fix } = data
  const c = TP_COLOR[e.ent_tp_cd] ?? TP_COLOR.BASE
  const { w, h } = sizeOf(e, lvl, phy)
  return (
    <div style={{ width: w, minHeight: h, borderColor: c.border, borderStyle: e.ref ? 'dashed' : 'solid' }} className={`rounded border-2 bg-white text-xs shadow-sm ${selected ? 'ring-2 ring-amber-400' : ''}`}>
      {SIDES.map(([k, p]) => (
        <span key={k}>
          <Handle type="source" id={`s-${k}`} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
          <Handle type="target" id={`t-${k}`} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
        </span>
      ))}
      <div style={{ background: c.head }} className="flex items-center gap-1 px-2 py-1 font-semibold text-white">
        <span className="truncate">{title(e, phy)}</span>
        {fix && <span title="고정(자동 배치가 옮기지 않음)">📌</span>}
        {e.ref && <span className="ml-auto rounded bg-white/25 px-1 text-[10px]">참조 · {e.subj_nm}</span>}
      </div>
      {lvl !== 'CNCP' && (
        <ul className="px-2 py-1 font-mono leading-[18px]">
          {lines(e, lvl, phy).map((l, i) => (
            <li key={i} className={`truncate ${e.attrs[i]?.pk_yn === 'Y' ? 'font-semibold' : ''}`}>
              {l}
            </li>
          ))}
          {!e.attrs.length && <li className="text-gray-400">(속성 없음)</li>}
        </ul>
      )}
    </div>
  )
}
const nodeTypes = { ent: EntNode }

// 가까운 변 — 두 박스 중심의 상대 위치로 변 선택(드래그할 때마다 다시 계산)
function sides(a: ENode, b: ENode, lvl: Lvl, phy: boolean): [string, string] {
  const sa = sizeOf(a.data.ent, lvl, phy), sb = sizeOf(b.data.ent, lvl, phy)
  const dx = b.position.x + sb.w / 2 - (a.position.x + sa.w / 2)
  const dy = b.position.y + sb.h / 2 - (a.position.y + sa.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['r', 'l'] : ['l', 'r']
  return dy > 0 ? ['b', 't'] : ['t', 'b']
}

function Erd({ areaId }: { areaId: string }) {
  const api = `/api/areas/${areaId}`
  const flow = useReactFlow()
  const [role, setRole] = useState<MbrRole | null>(null)
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [subjs, setSubjs] = useState<{ subj_id: string; subj_nm: string; prj_id: string }[]>([])
  const [subj, setSubj] = useState('')
  const [showRef, setShowRef] = useState(false) // 다른 주제영역 참조 엔터티 표시(기본 숨김)
  const [lvl, setLvl] = useState<Lvl>('LGCL')
  const [phy, setPhy] = useState(false)
  const [ents, setEnts] = useState<Ent[]>([])
  const [rels, setRels] = useState<Rel[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<ENode>([])
  const [sel, setSel] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [undo, setUndo] = useState<Record<string, { x: number; y: number }> | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const editor = !!role && can(role, 'REQUEST')
  const loadSeq = useRef(0) // 늦게 도착한 응답이 최신 선택을 덮어쓰지 않도록
  const curRef = useRef<Map<string, { x: number; y: number }>>(new Map()) // 편집 뒤 재조회 시 저장 안 한 드래그 위치 유지
  const keepRef = useRef('') // 편집 뒤 재조회 대상 키(프로젝트|주제영역|단계) — 다른 대상 조회에는 적용 안 함
  const [form, setForm] = useState<'new' | 'edit' | null>(null)
  const [chk, setChk] = useState<{ summary: { no_pk: number; fk_missing: number; issues: number; reviews: number }; issues: Issue[] } | null>(null)

  useEffect(() => {
    piFetch(api)
      .then((r) => r.json())
      .then((j) => j.ok && setRole(j.role))
    piFetch(`${api}/projects`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return
        setPrjs(j.items)
        let keep: string | null = null
        try {
          keep = window.localStorage.getItem(`logical-prj-${areaId}`)
        } catch {}
        setPrjId(j.items.find((p: { prj_id: string }) => p.prj_id === keep)?.prj_id ?? j.items[0]?.prj_id ?? '')
      })
    piFetch(`${api}/subjects`)
      .then((r) => r.json())
      .then((j) => j.ok && setSubjs(j.items))
  }, [api, areaId])

  const load = useCallback(async () => {
    if (!prjId || !subj) return // 주제영역을 고른 뒤에만
    const seq = ++loadSeq.current
    const j = await (await piFetch(`${api}/projects/${prjId}/diagram?lvl=${lvl}${subj ? `&subj=${subj}` : ''}`)).json()
    if (seq !== loadSeq.current) return
    if (!j.ok) return setMsg(j.message)
    const es = (j.ents as Ent[]).filter((e) => showRef || !e.ref)
    const pos = new Map((j.pos as { ent_id: string; x: number; y: number; fix: boolean }[]).map((p) => [p.ent_id, p]))
    const keep = keepRef.current === `${prjId}|${subj}|${lvl}`
    keepRef.current = ''
    if (!keep) setChk(null)
    if (keep) for (const [id, c] of curRef.current) pos.set(id, { ent_id: id, ...c, fix: pos.get(id)?.fix ?? false })
    // 좌표 없는 엔터티만 자동 배치(좌표가 하나도 없으면 전체 배치)
    const laid = autoLayout(
      es.map((e) => ({ id: e.ent_id, ...sizeOf(e, lvl, phy), group: e.subj_id, x: pos.get(e.ent_id)?.x, y: pos.get(e.ent_id)?.y, fixed: pos.get(e.ent_id)?.fix })),
      (j.rels as Rel[]).map((r) => ({ from: r.prnt_ent_id, to: r.chld_ent_id })),
      { mode: 'new' },
    )
    setEnts(es)
    const shownIds = new Set(es.map((e) => e.ent_id))
    setRels((j.rels as Rel[]).filter((r) => shownIds.has(r.prnt_ent_id) && shownIds.has(r.chld_ent_id))) // 숨긴 참조 엔터티의 관계 제외
    setNodes(es.map((e) => ({ id: e.ent_id, type: 'ent', position: laid[e.ent_id], data: { ent: e, lvl, phy, fix: !!pos.get(e.ent_id)?.fix } })))
    setDirty((d) => (keep && d) || es.some((e) => !pos.has(e.ent_id)))
    setUndo(null)
    void piFetch(`${api}/projects/${prjId}/logical`)
      .then((r) => r.json())
      .then((c) => seq === loadSeq.current && c.ok && setChk({ summary: c.summary, issues: c.issues }))
      .catch(() => {})
    if (j.capped) setMsg('프로젝트 조회 상한(엔터티 500·속성 5,000)을 넘어 일부만 표시될 수 있습니다')
    else if (!keep) setMsg('') // 편집 뒤 재조회는 편집 결과 메시지 유지
    if (!keep) requestAnimationFrame(() => flow.fitView({ padding: 0.15, maxZoom: 1 }))
  }, [api, prjId, subj, lvl, phy, showRef, setNodes, flow])
  // 프로젝트를 바꾸면 그 프로젝트의 첫 주제영역을 자동 선택(ERD 는 주제영역 단위)
  useEffect(() => {
    const mine = subjs.filter((s) => s.prj_id === prjId)
    if (mine.length && !mine.some((s) => s.subj_id === subj)) setSubj(mine[0].subj_id)
    if (!mine.length) { setSubj(''); setNodes([]); setEnts([]); setRels([]) }
  }, [prjId, subjs, subj, setNodes])
  useEffect(() => {
    curRef.current = new Map(nodes.map((n) => [n.id, { ...n.position }]))
  }, [nodes])
  // 편집(엔터티·속성·관계) 뒤 다시 불러오기 — 현재 위치 유지
  const refresh = () => {
    keepRef.current = `${prjId}|${subj}|${lvl}`
    void load()
  }
  const formDone = (id: string, t: string) => {
    setMsg(t)
    setForm(null)
    setSel(id)
    refresh()
  }
  useEffect(() => {
    void load()
    try {
      if (prjId) window.localStorage.setItem(`logical-prj-${areaId}`, prjId) // 논리·물리 화면과 프로젝트 선택 공유
    } catch {}
  }, [load, prjId, areaId])

  // 표시 수준·이름 전환은 데이터만 갱신(좌표 유지)
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, lvl, phy } })))
  }, [lvl, phy, setNodes])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const edges: Edge[] = useMemo(
    () =>
      rels
        .filter((r) => byId.has(r.prnt_ent_id) && byId.has(r.chld_ent_id))
        .map((r) => {
          const self = r.prnt_ent_id === r.chld_ent_id
          const [s, t] = self ? ['r', 't'] : sides(byId.get(r.prnt_ent_id)!, byId.get(r.chld_ent_id)!, lvl, phy)
          const many = r.crdn_cd !== '11'
          return {
            id: r.rel_id,
            source: r.prnt_ent_id,
            target: r.chld_ent_id,
            sourceHandle: `s-${s}`,
            targetHandle: `t-${t}`,
            type: 'smoothstep',
            label: r.rel_nm ?? undefined,
            labelStyle: { fontSize: 10 },
            style: { stroke: '#475569', strokeWidth: 1.4, strokeDasharray: r.idnt_yn === 'Y' ? undefined : '6 4' },
            markerStart: r.prnt_opt_yn === 'Y' ? 'ie-zero-one' : 'ie-one',
            markerEnd: many ? (r.chld_opt_yn === 'Y' ? 'ie-zero-many' : 'ie-one-many') : r.chld_opt_yn === 'Y' ? 'ie-zero-one' : 'ie-one',
          }
        }),
    [rels, byId, lvl, phy],
  )

  const curPos = () => Object.fromEntries(nodes.map((n) => [n.id, { ...n.position }]))
  const arrange = (mode: 'all' | 'new') => {
    setUndo(curPos())
    const laid = autoLayout(
      nodes.map((n) => ({ id: n.id, ...sizeOf(n.data.ent, lvl, phy), group: n.data.ent.subj_id, x: n.position.x, y: n.position.y, fixed: n.data.fix })),
      rels.map((r) => ({ from: r.prnt_ent_id, to: r.chld_ent_id })),
      { mode },
    )
    setNodes((ns) => ns.map((n) => ({ ...n, position: laid[n.id] })))
    setDirty(true)
    setMsg(mode === 'all' ? '자동 배치 미리보기 — 저장하면 반영, 되돌리기로 취소(고정 엔터티는 그대로)' : '새 엔터티만 배치했습니다')
    requestAnimationFrame(() => flow.fitView({ padding: 0.15, maxZoom: 1 }))
  }
  const revert = () => {
    if (!undo) return
    setNodes((ns) => ns.map((n) => ({ ...n, position: undo[n.id] ?? n.position })))
    setUndo(null)
    setMsg('되돌렸습니다')
  }
  const save = async () => {
    setBusy(true)
    const j = await (
      await piFetch(`${api}/projects/${prjId}/diagram`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subj_id: subj || null, mdl_lvl_cd: lvl, pos: nodes.map((n) => ({ ent_id: n.id, x: n.position.x, y: n.position.y, fix: n.data.fix })) }),
      })
    ).json()
    setBusy(false)
    if (!j.ok) return setMsg(j.message)
    setDirty(false)
    setUndo(null)
    setMsg(`배치를 저장했습니다(${LVL_NM[lvl]} 다이어그램)`)
  }
  const toggleFix = (id: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, fix: !n.data.fix } } : n)))
    setDirty(true)
  }
  const focus = (id: string) => {
    const n = byId.get(id)
    if (!n) return
    setSel(id)
    const { w, h } = sizeOf(n.data.ent, lvl, phy)
    void flow.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1.1, duration: 300 })
  }
  const selEnt = ents.find((e) => e.ent_id === sel)
  const tree = useMemo(() => {
    const g = new Map<string, Ent[]>()
    for (const e of ents) g.set(e.subj_nm, [...(g.get(e.subj_nm) ?? []), e])
    return [...g.entries()]
  }, [ents])
  const prjSubjs = subjs.filter((s) => s.prj_id === prjId)
  const selIss = (chk?.issues ?? []).filter((i) => i.ent_id === sel)
  const sel2 = 'rounded border border-white/60 bg-white px-2 py-1 text-gray-900'
  const btn = 'rounded bg-white/20 px-3 py-1 hover:bg-white/30 disabled:opacity-40'

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-1 text-2xl font-bold">ERD</h1>
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          {/* IE 표기 — 끝점(엔터티 쪽)에 그림, 시작 표식은 auto-start-reverse 로 뒤집힘 */}
          <marker id="ie-one" viewBox="0 0 20 20" refX="20" refY="10" markerWidth="20" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M14 3 L14 17" stroke="#475569" strokeWidth="1.6" fill="none" />
          </marker>
          <marker id="ie-zero-one" viewBox="0 0 24 20" refX="24" refY="10" markerWidth="24" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <circle cx="7" cy="10" r="4" stroke="#475569" strokeWidth="1.4" fill="white" />
            <path d="M18 3 L18 17" stroke="#475569" strokeWidth="1.6" fill="none" />
          </marker>
          <marker id="ie-one-many" viewBox="0 0 24 20" refX="24" refY="10" markerWidth="24" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M8 3 L8 17 M12 10 L24 2 M12 10 L24 18 M12 10 L24 10" stroke="#475569" strokeWidth="1.4" fill="none" />
          </marker>
          <marker id="ie-zero-many" viewBox="0 0 26 20" refX="26" refY="10" markerWidth="26" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <circle cx="6" cy="10" r="4" stroke="#475569" strokeWidth="1.4" fill="white" />
            <path d="M14 10 L26 2 M14 10 L26 18 M14 10 L26 10" stroke="#475569" strokeWidth="1.4" fill="none" />
          </marker>
        </defs>
      </svg>

      <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-2 text-sm text-white shadow-md" aria-label="ERD 설정">
        <select value={prjId} onChange={(e) => (setPrjId(e.target.value), setSubj(''), setSel(null))} className={sel2} aria-label="프로젝트 선택">
          {prjs.length === 0 && <option value="">프로젝트가 없습니다</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        <select value={subj} onChange={(e) => (setSubj(e.target.value), setSel(null))} className={sel2} aria-label="주제영역 선택">
          {subjs
            .filter((s) => s.prj_id === prjId)
            .map((s) => (
              <option key={s.subj_id} value={s.subj_id}>
                {s.subj_nm}
              </option>
            ))}
        </select>
        <select value={lvl} onChange={(e) => setLvl(e.target.value as Lvl)} className={sel2} aria-label="표시 수준">
          {(Object.keys(LVL_NM) as Lvl[]).map((k) => (
            <option key={k} value={k}>
              {LVL_NM[k]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={phy} onChange={(e) => setPhy(e.target.checked)} /> 물리명
        </label>
        <label className="flex items-center gap-1" title="관계로 이어진 다른 주제영역 엔터티를 점선 박스로 함께 표시">
          <input type="checkbox" checked={showRef} onChange={(e) => (setShowRef(e.target.checked), setSel(null))} /> 다른 주제영역 참조 표시
        </label>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={!nodes.length} onClick={() => arrange('all')}>
            자동 배치
          </button>
          <button type="button" className={btn} disabled={!nodes.length} onClick={() => arrange('new')}>
            새 엔터티만 배치
          </button>
          <button type="button" className={btn} disabled={!undo} onClick={revert}>
            되돌리기
          </button>
          {editor && (
            <button type="button" className="rounded bg-white px-3 py-1 font-semibold text-[#1f3a68] disabled:opacity-40" disabled={!dirty || busy || !nodes.length} onClick={() => void save()}>
              배치 저장{dirty ? ' *' : ''}
            </button>
          )}
        </span>
      </section>
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}

      <div className="mt-3 grid h-[72vh] gap-3 md:grid-cols-[14rem_1fr_24rem]">
        <nav className="overflow-auto rounded border text-sm" aria-label="모델 트리">
          {tree.map(([nm, es]) => (
            <details key={nm} open>
              <summary className="cursor-pointer bg-[#e9eff9] px-2 py-1 font-semibold">
                {nm} <span className="text-xs text-gray-500">({es.length})</span>
              </summary>
              <ul>
                {es.map((e) => (
                  <li key={e.ent_id}>
                    <button type="button" onClick={() => focus(e.ent_id)} aria-current={sel === e.ent_id} className={`w-full truncate px-3 py-1 text-left ${sel === e.ent_id ? 'bg-amber-100' : 'hover:bg-gray-50'}`}>
                      <span style={{ color: (TP_COLOR[e.ent_tp_cd] ?? TP_COLOR.BASE).border }}>■</span> {phy ? e.tbl_phy_nm : e.ent_log_nm}
                      {e.ref && <span className="ml-1 text-xs text-gray-500">참조</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {!ents.length && <p className="p-3 text-gray-500">엔터티가 없습니다(논리 모델에서 등록)</p>}
        </nav>

        <div className="rounded border" aria-label="ERD 캔버스">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={() => setDirty(true)}
            onNodeClick={(_, n) => setSel(n.id)}
            onPaneClick={() => setSel(null)}
            nodesDraggable={editor}
            nodesConnectable={false}
            minZoom={0.05}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (TP_COLOR[(n.data as EntData).ent.ent_tp_cd] ?? TP_COLOR.BASE).border} />
          </ReactFlow>
        </div>

        <aside className="overflow-auto rounded border p-3 text-sm" aria-label="엔터티 정보">
          {editor && !form && (
            <button type="button" onClick={() => setForm('new')} disabled={!prjSubjs.length} className="mb-2 rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40">
              ＋ 엔터티 추가
            </button>
          )}
          {form === 'new' && <EntForm key="new" api={api} areaId={areaId} subjs={prjSubjs} onDone={formDone} onCancel={() => setForm(null)} />}
          {form === 'edit' && selEnt && <EntForm key={`edit-${selEnt.ent_id}-${selEnt.ver_no}`} api={api} areaId={areaId} subjs={prjSubjs} init={selEnt} onDone={formDone} onCancel={() => setForm(null)} />}
          {selEnt && !form ? (
            <>
              <h2 className="font-semibold text-[#1f3a68]">{selEnt.ent_log_nm}</h2>
              <p className="font-mono text-xs text-gray-600">{selEnt.tbl_phy_nm}</p>
              <p className="mt-1 text-xs">
                {selEnt.subj_nm} · {(TP_COLOR[selEnt.ent_tp_cd] ?? TP_COLOR.BASE).nm}
                {selEnt.ref && ' · 다른 주제영역(참조)'}
              </p>
              {selEnt.ent_desc && <p className="mt-1 text-xs text-gray-700">{selEnt.ent_desc}</p>}
              {editor && (
                <button type="button" onClick={() => setForm('edit')} className="mt-2 mr-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50">
                  엔터티 수정
                </button>
              )}
              {selIss.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-xs text-red-700" aria-label="이 엔터티 검토 결과">
                  {selIss.map((i, k) => (
                    <li key={k}>{i.msg}</li>
                  ))}
                </ul>
              )}
              {editor && (
                <label className="mt-2 flex items-center gap-1">
                  <input type="checkbox" checked={!!byId.get(selEnt.ent_id)?.data.fix} onChange={() => toggleFix(selEnt.ent_id)} /> 위치 고정(자동 배치 제외)
                </label>
              )}
              <p className="mt-2 text-xs text-gray-600">관계 {rels.filter((r) => r.prnt_ent_id === selEnt.ent_id || r.chld_ent_id === selEnt.ent_id).length}건(아래 관계 편집)</p>
              <div className="mt-2">
                <Attrs key={selEnt.ent_id} api={api} areaId={areaId} entId={selEnt.ent_id} entNm={selEnt.ent_log_nm} editor={editor} onChanged={refresh} />
              </div>
            </>
          ) : form ? null : (
            <p className="text-gray-500">엔터티를 누르면 정보·속성 편집이 보입니다. 🔑 주식별자 · ↗ 상속(FK) · * 필수 / 실선 = 식별 관계, 점선 = 비식별 관계, 까마귀발 = 여러 건, ○ = 선택</p>
          )}
        </aside>
      </div>

      {chk && (
        <section className="mt-3 rounded border p-3 text-sm" aria-label="검토 결과">
          <h2 className="font-semibold text-[#1f3a68]">검토 결과(논리 모델 점검)</h2>
          <p className="mt-1">
            주식별자 없음 {chk.summary.no_pk} · FK 누락 {chk.summary.fk_missing} · 수정 필요 {chk.summary.issues} · 검토 {chk.summary.reviews}
            {!chk.summary.no_pk && !chk.summary.fk_missing && !chk.summary.issues ? <span className="ml-2 text-green-700">물리 전환 가능</span> : <span className="ml-2 text-amber-700">물리 전환 전 해결 필요</span>}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-gray-600">이슈 {chk.issues.length}건 보기(누르면 해당 엔터티로 이동)</summary>
            <ul className="mt-1 max-h-48 overflow-auto text-xs">
              {chk.issues.map((i, k) => (
                <li key={k}>
                  <button type="button" className="text-left hover:underline" onClick={() => focus(i.ent_id)}>
                    [{i.kind}] {ents.find((e) => e.ent_id === i.ent_id)?.ent_log_nm ?? ''} — {i.msg}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {prjId && (
        <details className="mt-3 rounded border p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-[#1f3a68]">관계 편집(등록·수정·삭제·FK 상속·N:M 해소)</summary>
          <Relations api={api} prjId={prjId} editor={editor} entsKey={ents.length} onSaved={refresh} />
        </details>
      )}
    </main>
  )
}

export default function ErdPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  return (
    <ReactFlowProvider>
      <Erd areaId={areaId} />
    </ReactFlowProvider>
  )
}

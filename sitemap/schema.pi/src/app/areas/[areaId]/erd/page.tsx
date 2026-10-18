'use client'
import { piFetch } from '@pi/auth/client'
// ERD 화면(PRD_PiErd S3 E1·E3·E4·E5·E6 1차) — 모델의 뷰 : 엔터티·속성·관계는 논리 모델 정본, 여기서는 배치(좌표·고정)만 저장
//  캔버스 @xyflow/react : 엔터티 박스(내용 맞춤 크기, 유형별 색, 참조 엔터티 점선), IE 관계선(식별 실선·비식별 점선·까마귀발, 가까운 변 자동 연결)
//  자동 배치(modelpi/layout.ts) : 미리보기 → 저장·되돌리기, 새 엔터티만 배치, 고정 존중 / 표시 수준 개념·논리·물리, 논리명·물리명 전환
//  순서 = 엔터티 작성완료 → 물리 전환 → 테이블 작성완료 → ERD(마스터 지시 2026-10-17) : 작성완료 테이블의 엔터티만 그림, 없으면 안내만
//  ERD 단위 = 주제영역 1개(마스터 지시 2026-10-17) — 전체 보기 없음, 다른 주제영역 엔터티(관계 상대)는 '참조 표시' 를 켤 때만
//  3단 : 왼쪽 모델 트리(주제영역 → 엔터티, 누르면 이동) · 캔버스 · 오른쪽 편집(E6 — 엔터티 추가·수정·속성, 논리 모델 화면과 같은 컴포넌트·같은 표준 검증 API), 아래 관계 편집·검토 결과
//  편집 뒤 다시 불러올 때 저장 안 한 드래그 위치는 유지
//  관계선 위치 조정(마스터 지시 2026-10-18) : 선을 누르면 끝점 2개(박스 변 따라 이동·변 바꾸기)·꺾임점 1개(가운데 선 이동) 손잡이, 두 번 누르면 자동으로.
//   자동 = 가까운 변 + 같은 변에 모인 선 고르게 나눔(modelpi/edge-geo.ts). 옮긴 선만 배치 저장 때 함께 저장(sql/034 mdl_dgm_rel)
//  인쇄(마스터 지시 2026-10-18) : 툴바 용지·방향 + '페이지 가이드' = 캔버스에 100% 크기 페이지 경계 점선(쪽 번호). 🖨 인쇄 = 미리보기(body 직속 포털)
//   — 화면 그림(.react-flow__viewport)을 복사해 쪽마다 위치만 바꿔 그림 : '한 장에 맞춤' 또는 '가이드대로 나눔(엔터티 없는 쪽 제외)', @page 용지 지정, 인쇄 때 미리보기 밖은 숨김
import '@xyflow/react/dist/style.css'
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getSmoothStepPath, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, ViewportPortal, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dbmsList } from '@/lib/modelpi/dbms'
import { autoLayout, boxSize } from '@/lib/modelpi/layout'
import { autoAnchors, project, sidePoint, type Box, type Pt, type RelLyt, type Side } from '@/lib/modelpi/edge-geo'
import { fitView as printFit, pageGrid, PAPER, printArea, type Orient } from '@/lib/modelpi/print'
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

// 관계선(사용자 정의 선) — 끝점·꺾임점은 부모 화면이 계산해 data 로 넘김. 선택된 선(편집 권한)만 손잡이 3개
type Grip = 's' | 't' | 'm'
type RelData = { sp: Pt; tp: Pt; ps: Side; cs: Side; mx: number | null; my: number | null; edit: boolean; onDrag: (id: string, k: Grip, screen: Pt) => void; onReset: (id: string) => void }
type REdge = Edge<RelData, 'rel'>
const POS: Record<Side, Position> = { T: Position.Top, R: Position.Right, B: Position.Bottom, L: Position.Left }
const GRIP_NM: Record<Grip, string> = { s: '부모 끝점 — 끌어서 박스 변을 따라 이동', t: '자식 끝점 — 끌어서 박스 변을 따라 이동', m: '꺾임점 — 끌어서 가운데 선 이동' }

function RelEdge({ id, data, markerStart, markerEnd, style, label, labelStyle, selected }: EdgeProps<REdge>) {
  const d = data!
  const [path, lx, ly] = getSmoothStepPath({ sourceX: d.sp.x, sourceY: d.sp.y, sourcePosition: POS[d.ps], targetX: d.tp.x, targetY: d.tp.y, targetPosition: POS[d.cs], ...(d.mx !== null && d.my !== null ? { centerX: d.mx, centerY: d.my } : {}) })
  const grip = (k: Grip, p: Pt) => (
    <div
      key={k}
      className="nodrag nopan"
      title={`${GRIP_NM[k]} · 두 번 누르면 자동 위치`}
      style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)`, pointerEvents: 'all', width: 11, height: 11, borderRadius: k === 'm' ? 2 : 9999, background: k === 'm' ? '#d97706' : '#fff', border: '2px solid #d97706', cursor: 'move' }}
      onPointerDown={(e) => {
        // 끄는 동안은 창(window) 이벤트로 추적 — 선이 다시 그려지며 손잡이가 바뀌어도 끊기지 않고, 엔터티 끌기·캔버스 이동과 겹치지 않음
        e.stopPropagation()
        e.preventDefault()
        const move = (ev: PointerEvent) => d.onDrag(id, k, { x: ev.clientX, y: ev.clientY })
        const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      onClick={(e) => e.stopPropagation()} // 놓을 때 생기는 click 이 캔버스(pane)로 올라가 선 선택이 풀리지 않게
      onDoubleClick={(e) => (e.stopPropagation(), d.onReset(id))}
    />
  )
  // 꺾임점 손잡이 = 가운데 선 위 : 좌우 변끼리면 세로 선(x 만 의미), 위아래 변끼리면 가로 선(y 만 의미), 섞이면 꺾임 1번이라 손잡이 없음
  const hz = (s: Side) => s === 'L' || s === 'R'
  const mid = hz(d.ps) && hz(d.cs) ? { x: d.mx ?? lx, y: (d.sp.y + d.tp.y) / 2 } : !hz(d.ps) && !hz(d.cs) ? { x: (d.sp.x + d.tp.x) / 2, y: d.my ?? ly } : null
  return (
    <>
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} style={selected ? { ...style, stroke: '#d97706', strokeWidth: 2 } : style} label={label} labelX={lx} labelY={ly} labelStyle={labelStyle} interactionWidth={14} />
      {d.edit && <EdgeLabelRenderer>{[grip('s', d.sp), grip('t', d.tp), mid && grip('m', mid)]}</EdgeLabelRenderer>}
    </>
  )
}
const edgeTypes = { rel: RelEdge }

// IE 표기 마커 정의 — pf = id 접두어(화면 '' / 인쇄 미리보기 'p')
const markers = (pf: string) => (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        {/* IE 표기 — 끝점(엔터티 쪽)에 그림, 시작 표식은 auto-start-reverse 로 뒤집힘 */}
        <marker id={`${pf}ie-one`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="20" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M14 3 L14 17" stroke="#475569" strokeWidth="1.6" fill="none" />
        </marker>
        <marker id={`${pf}ie-zero-one`} viewBox="0 0 24 20" refX="24" refY="10" markerWidth="24" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <circle cx="7" cy="10" r="4" stroke="#475569" strokeWidth="1.4" fill="white" />
          <path d="M18 3 L18 17" stroke="#475569" strokeWidth="1.6" fill="none" />
        </marker>
        <marker id={`${pf}ie-one-many`} viewBox="0 0 24 20" refX="24" refY="10" markerWidth="24" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M8 3 L8 17 M12 10 L24 2 M12 10 L24 18 M12 10 L24 10" stroke="#475569" strokeWidth="1.4" fill="none" />
        </marker>
        <marker id={`${pf}ie-zero-many`} viewBox="0 0 26 20" refX="26" refY="10" markerWidth="26" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <circle cx="6" cy="10" r="4" stroke="#475569" strokeWidth="1.4" fill="white" />
          <path d="M14 10 L26 2 M14 10 L26 18 M14 10 L26 10" stroke="#475569" strokeWidth="1.4" fill="none" />
        </marker>
      </defs>
    </svg>
)
const TITLE_H = 34 // 인쇄 쪽 제목 줄
const FOOT_H = 16 // 인쇄 쪽 범례 줄

function Erd({ areaId }: { areaId: string }) {
  const api = `/api/areas/${areaId}`
  const flow = useReactFlow()
  const [role, setRole] = useState<MbrRole | null>(null)
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [subjs, setSubjs] = useState<{ subj_id: string; subj_nm: string; prj_id: string }[]>([])
  const [subj, setSubj] = useState('')
  const [showRef, setShowRef] = useState(false) // 다른 주제영역 참조 엔터티 표시(기본 숨김)
  const [phyId, setPhyId] = useState('') // 기준 물리 모델(빈 값 = 서버가 첫 모델)
  const [phyModels, setPhyModels] = useState<{ phy_mdl_id: string; dbms_cd: string }[] | null>(null) // null = 아직 모름
  const [hidden, setHidden] = useState(0)
  const [phyDone, setPhyDone] = useState(true) // 이 주제영역 물리완료 여부
  const [lvl, setLvl] = useState<Lvl>('LGCL')
  const [phy, setPhy] = useState(false)
  const [ents, setEnts] = useState<Ent[]>([])
  const [rels, setRels] = useState<Rel[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<ENode>([])
  const [sel, setSel] = useState<string | null>(null)
  const [selRel, setSelRel] = useState<string | null>(null) // 선택된 관계선
  const [pr, setPr] = useState({ paper: 'A3', orient: 'landscape' as Orient, margin: 10, title: true, guide: false, mode: 'fit' as 'fit' | 'pages' }) // 인쇄 설정
  const [shot, setShot] = useState<string | null>(null) // 인쇄 미리보기(화면 그림 복사본) — null = 닫힘
  const canvasRef = useRef<HTMLDivElement>(null)
  const [lyt, setLyt] = useState<Record<string, RelLyt>>({}) // 사용자가 옮긴 관계선(없으면 자동)
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
    const j = await (await piFetch(`${api}/projects/${prjId}/diagram?lvl=${lvl}${subj ? `&subj=${subj}` : ''}${phyId ? `&phy=${phyId}` : ''}`)).json()
    if (seq !== loadSeq.current) return
    if (!j.ok) return setMsg(j.message)
    setPhyModels(j.phy_models)
    setHidden(j.hidden)
    setPhyDone(!!j.phy_done)
    if (!phyId && j.phy_mdl_id) setPhyId(j.phy_mdl_id)
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
    if (!keep) setLyt(Object.fromEntries(((j.rel_lyt ?? []) as (RelLyt & { rel_id: string })[]).map(({ rel_id, ...l }) => [rel_id, l])))
    if (!keep) setSelRel(null)
    setDirty((d) => (keep && d) || es.some((e) => !pos.has(e.ent_id)))
    setUndo(null)
    void piFetch(`${api}/projects/${prjId}/logical`)
      .then((r) => r.json())
      .then((c) => seq === loadSeq.current && c.ok && setChk({ summary: c.summary, issues: c.issues }))
      .catch(() => {})
    if (j.capped) setMsg('프로젝트 조회 상한(엔터티 500·속성 5,000)을 넘어 일부만 표시될 수 있습니다')
    else if (!keep) setMsg('') // 편집 뒤 재조회는 편집 결과 메시지 유지
    if (!keep) requestAnimationFrame(() => flow.fitView({ padding: 0.15, maxZoom: 1 }))
  }, [api, prjId, subj, lvl, phy, showRef, phyId, setNodes, flow])
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
  // 박스(실측 크기 우선)·자동 끝점 — 드래그할 때마다 다시 계산
  const geo = useMemo(() => {
    const boxes = new Map<string, Box>()
    for (const n of nodes) {
      const s = sizeOf(n.data.ent, lvl, phy)
      boxes.set(n.id, { x: n.position.x, y: n.position.y, w: n.measured?.width ?? s.w, h: n.measured?.height ?? s.h })
    }
    const shown = rels.filter((r) => boxes.has(r.prnt_ent_id) && boxes.has(r.chld_ent_id))
    return { boxes, shown, auto: autoAnchors(shown.map((r) => ({ id: r.rel_id, from: r.prnt_ent_id, to: r.chld_ent_id })), boxes) }
  }, [nodes, rels, lvl, phy])
  const lytOf = useCallback((id: string): RelLyt => lyt[id] ?? { ...geo.auto.get(id)!, mx: null, my: null }, [lyt, geo])
  // 손잡이 끌기 — 끝점은 놓은 자리에서 가장 가까운 변·비율로, 꺾임점은 좌표 그대로
  const dragRel = useCallback(
    (id: string, k: Grip, screen: Pt) => {
      const r = rels.find((x) => x.rel_id === id)
      if (!r) return
      const p = flow.screenToFlowPosition(screen)
      const cur = lytOf(id)
      let next: RelLyt = cur
      if (k === 'm') next = { ...cur, mx: p.x, my: p.y }
      else {
        const b = geo.boxes.get(k === 's' ? r.prnt_ent_id : r.chld_ent_id)
        if (!b) return
        const pr = project(b, p)
        // 끝점이 바뀌면 꺾임점은 두 끝의 가운데로(마스터 지시 2026-10-18)
        next = k === 's' ? { ...cur, ps: pr.side, pr: pr.r, mx: null, my: null } : { ...cur, cs: pr.side, cr: pr.r, mx: null, my: null }
      }
      setLyt((L) => ({ ...L, [id]: next }))
      setDirty(true)
    },
    [rels, flow, lytOf, geo],
  )
  // 엔터티를 옮기면(끌기·자동 배치) 이어진 관계선의 꺾임점을 가운데로 — 옮긴 꺾임점은 두 끝이 그대로일 때만 유지
  const midToCenter = useCallback(
    (ids: Set<string> | null) =>
      setLyt((L) => {
        let ch = false
        const o = { ...L }
        for (const r of rels)
          if ((!ids || ids.has(r.prnt_ent_id) || ids.has(r.chld_ent_id)) && o[r.rel_id]?.mx != null) {
            o[r.rel_id] = { ...o[r.rel_id], mx: null, my: null }
            ch = true
          }
        return ch ? o : L
      }),
    [rels],
  )
  const resetRel = useCallback((id: string) => {
    setLyt(({ [id]: _, ...rest }) => rest)
    setDirty(true)
    setMsg('관계선을 자동 위치로 되돌렸습니다(저장하면 반영)')
  }, [])
  const edges: REdge[] = useMemo(
    () =>
      geo.shown.map((r) => {
          const l = lytOf(r.rel_id)
          const sp = sidePoint(geo.boxes.get(r.prnt_ent_id)!, l.ps, l.pr)
          const tp = sidePoint(geo.boxes.get(r.chld_ent_id)!, l.cs, l.cr)
          const many = r.crdn_cd !== '11'
          return {
            id: r.rel_id,
            source: r.prnt_ent_id,
            target: r.chld_ent_id,
            sourceHandle: `s-${l.ps.toLowerCase()}`,
            targetHandle: `t-${l.cs.toLowerCase()}`,
            type: 'rel' as const,
            selected: selRel === r.rel_id,
            data: { sp, tp, ps: l.ps, cs: l.cs, mx: l.mx, my: l.my, edit: editor && selRel === r.rel_id, onDrag: dragRel, onReset: resetRel },
            label: r.rel_nm ?? undefined,
            labelStyle: { fontSize: 10 },
            style: { stroke: '#475569', strokeWidth: 1.4, strokeDasharray: r.idnt_yn === 'Y' ? undefined : '6 4' },
            markerStart: r.prnt_opt_yn === 'Y' ? 'ie-zero-one' : 'ie-one',
            markerEnd: many ? (r.chld_opt_yn === 'Y' ? 'ie-zero-many' : 'ie-one-many') : r.chld_opt_yn === 'Y' ? 'ie-zero-one' : 'ie-one',
          }
        }),
    [geo, lytOf, selRel, editor, dragRel, resetRel],
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
    midToCenter(null)
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
        body: JSON.stringify({
          subj_id: subj || null,
          mdl_lvl_cd: lvl,
          pos: nodes.map((n) => ({ ent_id: n.id, x: n.position.x, y: n.position.y, fix: n.data.fix })),
          rel_lyt: geo.shown.filter((r) => lyt[r.rel_id]).map((r) => ({ rel_id: r.rel_id, ...lyt[r.rel_id] })),
          rel_scope: geo.shown.map((r) => r.rel_id),
        }),
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
  // 인쇄 — 쪽 크기(여백 뺀 인쇄 영역)·내용 영역(제목·범례 줄 뺌)·페이지 나눔
  const page = useMemo(() => {
    const a = printArea(pr.paper, pr.orient, pr.margin)
    const ch = a.h - (pr.title ? TITLE_H + FOOT_H : 0)
    return { ...a, cw: a.w, ch, grid: pageGrid([...geo.boxes.values()], a.w, ch) }
  }, [pr, geo])
  const openPrint = () => {
    setSel(null)
    setSelRel(null)
    setForm(null)
    // 선택 해제가 그려진 뒤 화면 그림 복사(가이드·손잡이 제외, 마커 id 를 인쇄용 접두로)
    setTimeout(() => {
      const vp = canvasRef.current?.querySelector('.react-flow__viewport')
      if (!vp) return
      const c = vp.cloneNode(true) as HTMLElement
      c.querySelectorAll('.react-flow__viewport-portal, .react-flow__edgelabel-renderer').forEach((x) => x.remove())
      setShot(c.innerHTML.replace(/url\((['"]?)#ie-/g, 'url($1#pie-'))
    }, 80)
  }
  const sheets = pr.mode === 'fit' ? [{ no: 1, t: printFit([...geo.boxes.values()], page.cw, page.ch) }] : page.grid.tiles.map((t) => ({ no: t.no, t: { x: -(page.grid.x0 + t.c * page.cw), y: -(page.grid.y0 + t.r * page.ch), zoom: 1 } }))
  const selEnt = ents.find((e) => e.ent_id === sel)
  const selRelObj = rels.find((r) => r.rel_id === selRel)
  const entNm = (id: string) => { const e = ents.find((x) => x.ent_id === id); return e ? (phy ? e.tbl_phy_nm : e.ent_log_nm) : '' }
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
      {markers('')}

      <section className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-2 text-sm text-white shadow-md" aria-label="ERD 설정">
        <select value={prjId} onChange={(e) => (setPrjId(e.target.value), setSubj(''), setPhyId(''), setPhyModels(null), setSel(null))} className={sel2} aria-label="프로젝트 선택">
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
        {phyModels && phyModels.length > 1 && (
          <select value={phyId} onChange={(e) => (setPhyId(e.target.value), setSel(null))} className={sel2} aria-label="기준 물리 모델">
            {phyModels.map((p) => (
              <option key={p.phy_mdl_id} value={p.phy_mdl_id}>
                물리 {dbmsList().find((d) => d.cd === p.dbms_cd)?.nm ?? p.dbms_cd}
              </option>
            ))}
          </select>
        )}
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
          <select value={pr.paper} onChange={(e) => setPr({ ...pr, paper: e.target.value, guide: true })} className={sel2} aria-label="인쇄 용지">
            {Object.keys(PAPER).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select value={pr.orient} onChange={(e) => setPr({ ...pr, orient: e.target.value as Orient, guide: true })} className={sel2} aria-label="인쇄 방향">
            <option value="landscape">가로</option>
            <option value="portrait">세로</option>
          </select>
          <label className="flex items-center gap-1" title="100% 크기 인쇄 쪽 경계를 점선으로 표시">
            <input type="checkbox" checked={pr.guide} onChange={(e) => setPr({ ...pr, guide: e.target.checked })} /> 페이지 가이드
          </label>
          <button type="button" className={btn} disabled={!nodes.length} onClick={openPrint} title="인쇄 미리보기 — 한 장에 맞춤 또는 가이드대로 나눠 인쇄(PDF 저장은 인쇄 창의 'PDF로 저장')">
            🖨 인쇄
          </button>
          {editor && (
            <button type="button" className="rounded bg-white px-3 py-1 font-semibold text-[#1f3a68] disabled:opacity-40" disabled={!dirty || busy || !nodes.length} onClick={() => void save()}>
              배치 저장{dirty ? ' *' : ''}
            </button>
          )}
        </span>
      </section>
      {phyModels && phyModels.length === 0 && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          이 프로젝트에는 아직 물리 모델이 없습니다. 순서는 논리 모델 → 물리 모델 → ERD 입니다 —{' '}
          <Link href={`/areas/${areaId}/physical`} className="font-semibold underline">
            물리 모델에서 먼저 전환
          </Link>
          하십시오.
        </p>
      )}
      {phyModels && phyModels.length > 0 && !phyDone && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="note">
          이 주제영역에 작성완료된 테이블이 없습니다. 순서는 엔터티 작성완료 → 물리 전환 → 테이블 작성완료 → ERD 입니다 —{' '}
          <Link href={`/areas/${areaId}/physical`} className="font-semibold underline">
            물리 모델에서 엔터티 전환·테이블 작성완료
          </Link>
          하십시오.
        </p>
      )}
      {phyModels && phyModels.length > 0 && phyDone && hidden > 0 && (
        <p className="mt-2 text-sm text-amber-800" role="note">
          작성완료 테이블이 아닌 엔터티 {hidden}개는 표시하지 않습니다 —{' '}
          <Link href={`/areas/${areaId}/physical`} className="underline">
            물리 모델에서 전환·작성완료
          </Link>
          하면 보입니다.
        </p>
      )}
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

        <div ref={canvasRef} className="rounded border" aria-label="ERD 캔버스">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeDrag={(_, __, ns) => midToCenter(new Set(ns.map((x) => x.id)))}
            onNodeDragStop={() => setDirty(true)}
            onNodeClick={(_, n) => (setSel(n.id), setSelRel(null))}
            onEdgeClick={(_, e) => (setSelRel(e.id), setSel(null), setForm(null))}
            onPaneClick={() => (setSel(null), setSelRel(null))}
            nodesDraggable={editor}
            nodesConnectable={false}
            minZoom={0.05}
            fitView
            proOptions={{ hideAttribution: false }}
          >
            <Background gap={20} size={1} />
            {pr.guide && (
              <ViewportPortal>
                {Array.from({ length: page.grid.rows * page.grid.cols }, (_, i) => {
                  const c = i % page.grid.cols, r = Math.floor(i / page.grid.cols)
                  const t = page.grid.tiles.find((x) => x.c === c && x.r === r)
                  return (
                    <div key={i} className="pointer-events-none absolute border-2 border-dashed border-sky-500/70" style={{ left: page.grid.x0 + c * page.cw, top: page.grid.y0 + r * page.ch, width: page.cw, height: page.ch }}>
                      <span className="absolute top-1 left-2 text-xs font-semibold text-sky-600/80">{t ? `${t.no}쪽` : '(빈 쪽 — 인쇄 안 함)'} · {pr.paper} {pr.orient === 'landscape' ? '가로' : '세로'}</span>
                    </div>
                  )
                })}
              </ViewportPortal>
            )}
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
          ) : form ? null : selRelObj ? (
            <>
              <h2 className="font-semibold text-[#1f3a68]">관계선</h2>
              <p className="mt-1 text-xs">
                {entNm(selRelObj.prnt_ent_id)} → {entNm(selRelObj.chld_ent_id)}
                {selRelObj.rel_nm && ` · ${selRelObj.rel_nm}`} · {selRelObj.idnt_yn === 'Y' ? '식별' : '비식별'}
              </p>
              <p className="mt-1 text-xs text-gray-600">{lyt[selRelObj.rel_id] ? '위치를 옮긴 선(배치 저장 때 함께 저장)' : '자동 위치(가까운 변, 같은 변의 선은 고르게 나눔)'}</p>
              {editor ? (
                <>
                  <ul className="mt-2 list-disc pl-4 text-xs text-gray-700">
                    <li>흰 원 = 끝점 : 끌면 박스 변을 따라 움직이고, 다른 변 가까이 놓으면 그 변으로 옮겨 갑니다</li>
                    <li>주황 네모 = 꺾임점 : 끌면 가운데 선이 옮겨집니다</li>
                    <li>손잡이를 두 번 누르거나 아래 버튼 = 자동 위치</li>
                  </ul>
                  <button type="button" disabled={!lyt[selRelObj.rel_id]} onClick={() => resetRel(selRelObj.rel_id)} className="mt-2 rounded border px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-40">
                    선 위치 초기화(자동)
                  </button>
                </>
              ) : (
                <p className="mt-2 text-xs text-gray-500">조회 권한 : 선 위치는 편집 권한이 있을 때 옮길 수 있습니다</p>
              )}
            </>
          ) : (
            <p className="text-gray-500">엔터티를 누르면 정보·속성 편집, 관계선을 누르면 선 위치 조정이 보입니다. 🔑 주식별자 · ↗ 상속(FK) · * 필수 / 실선 = 식별 관계, 점선 = 비식별 관계, 까마귀발 = 여러 건, ○ = 선택</p>
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
      {shot !== null &&
        createPortal(
          <div id="erd-print-root" className="fixed inset-0 z-[1000] overflow-auto bg-gray-300 p-4">
            <style>{`@page { size: ${pr.paper === 'Letter' ? 'letter' : pr.paper} ${pr.orient}; margin: ${pr.margin}mm }
@media print {
  body > *:not(#erd-print-root) { display: none !important }
  #erd-print-root { position: static !important; overflow: visible !important; background: #fff !important; padding: 0 !important }
  #erd-print-root .no-print { display: none !important }
  .erd-page { margin: 0 !important; box-shadow: none !important; break-after: page }
  .erd-page:last-child { break-after: auto }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
}`}</style>
            {markers('p')}
            <div className="no-print mx-auto mb-3 flex max-w-5xl flex-wrap items-center gap-2 rounded-xl bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-2 text-sm text-white shadow" aria-label="인쇄 설정">
              <strong className="mr-1">인쇄 설정</strong>
              <select value={pr.paper} onChange={(e) => setPr({ ...pr, paper: e.target.value })} className={sel2} aria-label="용지">
                {Object.keys(PAPER).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select value={pr.orient} onChange={(e) => setPr({ ...pr, orient: e.target.value as Orient })} className={sel2} aria-label="방향">
                <option value="landscape">가로</option>
                <option value="portrait">세로</option>
              </select>
              <select value={pr.margin} onChange={(e) => setPr({ ...pr, margin: Number(e.target.value) })} className={sel2} aria-label="여백">
                {[5, 10, 15, 20].map((m) => (
                  <option key={m} value={m}>
                    여백 {m}mm
                  </option>
                ))}
              </select>
              <select value={pr.mode} onChange={(e) => setPr({ ...pr, mode: e.target.value as 'fit' | 'pages' })} className={sel2} aria-label="배율">
                <option value="fit">한 장에 맞춤</option>
                <option value="pages">가이드대로 나눔(100%, {page.grid.tiles.length}쪽)</option>
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={pr.title} onChange={(e) => setPr({ ...pr, title: e.target.checked })} /> 제목·범례
              </label>
              <span className="ml-auto flex gap-2">
                <button type="button" className="rounded bg-white px-3 py-1 font-semibold text-[#1f3a68]" onClick={() => window.print()}>
                  인쇄 ({sheets.length}쪽)
                </button>
                <button type="button" className={btn} onClick={() => setShot(null)}>
                  닫기
                </button>
              </span>
            </div>
            {sheets.map((sh) => (
              <div key={sh.no} className="erd-page mx-auto mb-4 flex flex-col overflow-hidden bg-white shadow-lg" style={{ width: page.w, height: page.h }}>
                {pr.title && (
                  <div className="flex shrink-0 items-end justify-between border-b-2 border-[#1f3a68] px-3 text-xs" style={{ height: TITLE_H }}>
                    <span className="pb-1">
                      <strong className="text-base text-[#1f3a68]">ERD — {prjSubjs.find((x) => x.subj_id === subj)?.subj_nm ?? ''}</strong>
                      <span className="ml-2 text-gray-600">{prjs.find((x) => x.prj_id === prjId)?.prj_nm}</span>
                    </span>
                    <span className="pb-1 text-gray-600">
                      {LVL_NM[lvl]} · {phy ? '물리명' : '논리명'} · 출력 {new Date().toLocaleDateString('sv-SE')} · {sh.no} / {sheets.length}쪽
                    </span>
                  </div>
                )}
                <div className="react-flow relative min-h-0 flex-1 overflow-hidden">
                  <div className="react-flow__viewport" style={{ position: 'absolute', transform: `translate(${sh.t.x}px, ${sh.t.y}px) scale(${sh.t.zoom})` }} dangerouslySetInnerHTML={{ __html: shot }} />
                </div>
                {pr.title && (
                  <div className="shrink-0 border-t px-3 text-[10px] leading-4 text-gray-500" style={{ height: FOOT_H }}>
                    실선 = 식별 관계 · 점선 = 비식별 관계 · 까마귀발 = 여러 건 · ○ = 선택 · 🔑 주식별자 · ↗ 상속(FK) · * 필수
                  </div>
                )}
              </div>
            ))}
          </div>,
          document.body,
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

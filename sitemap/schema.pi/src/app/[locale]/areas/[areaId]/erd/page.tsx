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
//  표기법(마스터 지시 2026-10-18) : IE(ERwin 정보공학) / 바커(DA#) 선택(이 브라우저에 기억). 바커 = 둥근 박스·# * o, 선 반쪽 실선(필수)·점선(선택),
//   까마귀발 = 여러 건, 식별 관계 = 자식 쪽 가로 막대(UID bar). 부모 쪽 반 = 부모의 자식 참여(chld_opt_yn), 자식 쪽 반 = 자식의 부모 참여(prnt_opt_yn)
//  개체명 보기옵션(마스터 지시 2026-10-18, DA# 홈 › 옵션 › 개체명 보기옵션) : 논리 = 엔터티명(보조명·동의어)·속성명(보조명·동의어·도메인),
//   물리 = 테이블명(엔터티명·보조명·동의어)·컬럼명(속성명·보조명·동의어·도메인). 보조명 = sql/035, 동의어 = 용어 이음동의어·엔터티는 구성 단어 SYN. 이 브라우저에 기억
import '@xyflow/react/dist/style.css'
import { toPng, toSvg } from 'html-to-image'
import { Background, BaseEdge, Controls, EdgeLabelRenderer, getNodesBounds, getSmoothStepPath, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, SelectionMode, useNodesState, useReactFlow, useStoreApi, ViewportPortal, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { Link } from '@/i18n/navigation'
import { createContext, use, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { dbmsList } from '@/lib/modelpi/dbms'
import { autoLayout, boxSize } from '@/lib/modelpi/layout'
import { autoAnchors, halfDash, project, sidePoint, type Box, type Pt, type RelLyt, type Side } from '@/lib/modelpi/edge-geo'
import { fitView as printFit, pageGrid, PAPER, printArea, realign, type Orient } from '@/lib/modelpi/print'
import { type MbrRole, type Perm } from '@/lib/roles'
import Attrs from '../model/attrs'
import EntForm from '../model/ent-form'
import Relations from '../model/relations'
import { VersionPanel, type VerShow } from './versions'
import { toMark, type DiffOp, type VerMark } from '@/lib/modelpi/ver'
import { ENT_TP, entTpColor, type EntTp } from '@/lib/model-name'

interface Attr {
  attr_id: string
  term_log_nm: string
  term_phy_nm: string
  dom_nm: string | null
  pk_yn: string
  esntl_yn: string
  fk_rel_id: string | null
  attr_asst_nm?: string | null // 보조명(sql/035)
  term_syn?: string | null // 용어 이음동의어
  dom?: { lgc_tp_cd: string; data_len: number | null; data_scale: number | null } | null // 용어 도메인(데이터타입 보기)
}
interface Ent {
  ent_id: string
  ent_log_nm: string
  tbl_phy_nm: string
  ent_tp_cd: string
  subj_id: string
  subj_nm: string
  ent_desc: string | null
  ent_asst_nm?: string | null // 보조명(sql/035)
  ent_syns?: string[] // 구성 단어 이음동의어
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
type Nt = 'IE' | 'BK' // 표기법 : IE(ERwin 정보공학) / BK(바커, DA#)
type EntData = { ent: Ent; lvl: Lvl; phy: boolean; fix: boolean; nt?: Nt; nmo?: Nmo }
const NT_NM: Record<Nt, string> = { IE: 'IE 표기(ERwin)', BK: '바커 표기(DA#)' }
const LEGEND: Record<Nt, string> = {
  IE: '실선 = 식별 관계 · 점선 = 비식별 관계 · 까마귀발 = 여러 건 · ○ = 선택 · 🔑 주식별자(다홍) · ↗ 상속 FK(분홍) · * 필수',
  BK: '바커 표기 : 선 반쪽 실선 = 반드시(필수) · 점선 = 선택 · 까마귀발 = 여러 건 · 가로 막대 = 식별 관계(UID) · # 식별자(다홍) · 상속 FK(분홍) · * 필수 · o 선택',
}
type ENode = Node<EntData, 'ent'>

// 엔터티 유형별 색(E5) — BASE 실체·기준 / ACT 행위 / AGG 집계
const LVL_NM: Record<Lvl, string> = { CNCP: '개념(이름)', LGCL: '논리(속성·키)', PHY: '물리(칼럼·도메인)' }

// 논리 데이터타입 이름(GET /api/types, 화면 진입 시 채움) — 데이터타입 보기 : NUMERIC(10,2)·VARCHAR(50)
const LT: Record<string, string> = {}
const tpText = (a: Attr) => (a.dom ? `${LT[a.dom.lgc_tp_cd] ?? a.dom.lgc_tp_cd}${a.dom.data_len ? `(${a.dom.data_len}${a.dom.data_scale ? `,${a.dom.data_scale}` : ''})` : ''}` : '')
// 속성 줄 = 칸 배열(DA# 처럼 칸 정렬) — [기호, 이름, …옵션 칸]. IE : 🔑 주식별자·↗ 상속·· 일반 + 이름 끝 * 필수 / 바커 : # 식별자·* 필수·o 선택
//  논리 : 속성명[보조]{동의어} · (컬럼명) · 도메인 / 물리 : 컬럼명[보조]{동의어} · 데이터타입 · 속성명 · 도메인 — 켠 옵션만 칸이 생김
const cells = (e: Ent, lvl: Lvl, phy: boolean, nt: Nt = 'IE', o: Nmo = NMO_DEF): string[][] =>
  lvl === 'CNCP'
    ? []
    : e.attrs.map((a) => {
        const p = phy || lvl === 'PHY'
        const mark = nt === 'BK' ? (a.pk_yn === 'Y' ? '#' : a.esntl_yn === 'Y' ? '*' : 'o') : a.pk_yn === 'Y' ? '🔑' : a.fk_rel_id ? '↗' : '·'
        const req = nt !== 'BK' && a.esntl_yn === 'Y' && a.pk_yn !== 'Y' ? ' *' : ''
        if (p)
          return [mark, `${a.term_phy_nm}${addOn(a.attr_asst_nm, a.term_syn, o.pColAsst, o.pColSyn)}${req}`, ...(o.pColTp ? [tpText(a)] : []), ...(o.pColAttr ? [a.term_log_nm] : []), ...(o.pColDom ? [a.dom_nm ?? ''] : [])]
        return [mark, `${a.term_log_nm}${addOn(a.attr_asst_nm, a.term_syn, o.lAttrAsst, o.lAttrSyn)}${req}`, ...(o.lAttrPhy ? [`(${a.term_phy_nm})`] : []), ...(o.lAttrDom ? [a.dom_nm ?? ''] : [])]
      })
// 크기 계산용 줄 — 칸별 최장 글자를 이어 붙인 한 줄을 행 수만큼(표 너비 = 칸별 최대의 합)
const lines = (e: Ent, lvl: Lvl, phy: boolean, nt: Nt = 'IE', o: Nmo = NMO_DEF) => {
  const rows = cells(e, lvl, phy, nt, o)
  if (!rows.length) return []
  const w = (t: string) => [...t].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
  const max = rows[0].map((_, i) => rows.reduce((m, r) => (w(r[i] ?? '') > w(m) ? (r[i] ?? '') : m), ''))
  const comp = max.join('   ')
  return rows.map(() => comp)
}
// 개체명 보기옵션(DA# 개체명 보기옵션과 같은 구성) — l* 논리 표시(엔터티·속성), p* 물리 표시(테이블·컬럼)
type Nmo = { lEntPhy: boolean; lEntAsst: boolean; lEntSyn: boolean; lAttrPhy: boolean; lAttrAsst: boolean; lAttrSyn: boolean; lAttrDom: boolean; pTblEnt: boolean; pTblAsst: boolean; pTblSyn: boolean; pColTp: boolean; pColAttr: boolean; pColAsst: boolean; pColSyn: boolean; pColDom: boolean }
// 기본값 : DA# 화면(논리 = 물리명·컬럼명 병기, 물리 = 엔터티명·데이터타입·속성명 병기) + 물리 도메인(기존 '물리(칼럼·도메인)' 표시 유지)
const NMO_DEF: Nmo = { lEntPhy: true, lEntAsst: false, lEntSyn: false, lAttrPhy: true, lAttrAsst: false, lAttrSyn: false, lAttrDom: false, pTblEnt: true, pTblAsst: false, pTblSyn: false, pColTp: true, pColAttr: true, pColAsst: false, pColSyn: false, pColDom: true }
const NMO_FORM: [string, [string, [keyof Nmo, string][]][]][] = [
  ['논리', [['엔터티명 보기 옵션', [['lEntPhy', '물리명(테이블명) 보기'], ['lEntAsst', '보조명 보기'], ['lEntSyn', '동의어 보기']]], ['속성명 보기 옵션', [['lAttrPhy', '컬럼명 보기'], ['lAttrAsst', '보조명 보기'], ['lAttrSyn', '동의어 보기'], ['lAttrDom', '도메인 보기']]]]],
  ['물리', [['테이블명 보기 옵션', [['pTblEnt', '엔터티명 보기'], ['pTblAsst', '보조명 보기'], ['pTblSyn', '동의어 보기']]], ['컬럼명 보기 옵션', [['pColTp', '데이터타입 보기'], ['pColAttr', '속성명 보기'], ['pColAsst', '보조명 보기'], ['pColSyn', '동의어 보기'], ['pColDom', '도메인 보기']]]]],
]
// 덧붙임 : 보조명 [ ], 동의어 { }, 물리일 때 논리명 ( )
const addOn = (asst: string | null | undefined, syn: string | string[] | null | undefined, showAsst: boolean, showSyn: boolean) => {
  const sy = (Array.isArray(syn) ? syn : (syn ?? '').split(',')).map((x) => x.trim()).filter(Boolean)
  return `${showAsst && asst ? ` [${asst}]` : ''}${showSyn && sy.length ? ` {${sy.join(', ')}}` : ''}`
}
const title = (e: Ent, phy: boolean, o: Nmo = NMO_DEF) =>
  phy ? `${e.tbl_phy_nm}${o.pTblEnt ? ` (${e.ent_log_nm})` : ''}${addOn(e.ent_asst_nm, e.ent_syns, o.pTblAsst, o.pTblSyn)}` : `${e.ent_log_nm}${o.lEntPhy ? ` (${e.tbl_phy_nm})` : ''}${addOn(e.ent_asst_nm, e.ent_syns, o.lEntAsst, o.lEntSyn)}`
// 물리 표시 = '물리명' 체크 또는 표시 수준 물리(마스터 지시 2026-10-18 : 물리 모델일 때 테이블명(엔터티명))
const isPhy = (lvl: Lvl, phy: boolean) => phy || lvl === 'PHY'
const sizeOf = (e: Ent, lvl: Lvl, phy: boolean, o: Nmo = NMO_DEF) => boxSize(title(e, isPhy(lvl, phy), o), lines(e, lvl, phy, 'IE', o))

const SIDES = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
] as const

// 키 속성 글자색(마스터 지시 2026-10-20) : 주식별자 = 다홍색, FK(상속 속성) = 분홍색 — PK 이면서 FK(식별 관계 상속)는 주식별자 색. 기호·이름 칸만(옵션 칸은 회색 유지)
const KEY_C = { pk: '#E34234', fk: '#E75480' }
const keyColor = (a: Attr | undefined) => (a?.pk_yn === 'Y' ? KEY_C.pk : a?.fk_rel_id ? KEY_C.fk : undefined)
// 버전 차이 표시(ERD-4, 버전 패널 'ERD 에 표시') — 기준 버전 → 현재 모델 : 추가 초록·변경 주황 테두리·속성 행 배경·관계선, 삭제는 캔버스에 없어 건수만
//  노드 데이터를 다시 만들지 않도록 컨텍스트로 전달(끄기·켜기·다시 불러오기와 무관)
const VER_C: Record<DiffOp, string> = { INS: '#16a34a', UPD: '#d97706', DEL: '#dc2626' }
const VER_BG: Record<DiffOp, string> = { INS: '#dcfce7', UPD: '#fef3c7', DEL: '#fee2e2' }
const VER_NM: Record<DiffOp, string> = { INS: '추가', UPD: '변경', DEL: '삭제' }
const MarkCtx = createContext<VerMark | null>(null)

function EntNode({ data, selected }: NodeProps<ENode>) {
  const { ent: e, lvl, phy, fix, nt = 'IE', nmo = NMO_DEF } = data
  const c = entTpColor(e.ent_tp_cd) // 유형별 자동 색(실체 노랑·기준 초록·행위 파랑·가공 없음)
  const { w, h } = sizeOf(e, lvl, phy, nmo)
  const vm = useContext(MarkCtx)
  const mk = vm?.ent[e.ent_id]
  const delA = vm?.delAttr[e.ent_id] ?? 0
  return (
    <div style={{ minWidth: w, width: 'max-content', minHeight: h, borderColor: c.border, borderStyle: e.ref ? 'dashed' : 'solid', background: c.fill, boxShadow: mk ? `0 0 0 4px ${VER_C[mk]}` : undefined }} className={`${nt === 'BK' ? 'overflow-hidden rounded-2xl' : 'rounded'} border-2 text-xs shadow-sm ${selected ? 'ring-2 ring-amber-400' : ''}`}>
      {SIDES.map(([k, p]) => (
        <span key={k}>
          <Handle type="source" id={`s-${k}`} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
          <Handle type="target" id={`t-${k}`} position={p} className="!h-1 !w-1 !border-0 !bg-transparent" />
        </span>
      ))}
      <div style={{ background: c.head, color: c.text, borderBottom: `1px solid ${c.border}` }} className="flex items-center gap-1 px-2 py-1 font-semibold">
        <span className="truncate" title={title(e, isPhy(lvl, phy), nmo)}>{title(e, isPhy(lvl, phy), nmo)}</span>
        {fix && <span title="고정(자동 배치가 옮기지 않음)">📌</span>}
        {mk && <span className="rounded px-1 text-[10px] text-white" style={{ background: VER_C[mk] }}>{VER_NM[mk]}</span>}
        {delA > 0 && <span className="rounded px-1 text-[10px] text-white" style={{ background: VER_C.DEL }} title="기준 버전에 있던 속성이 지금은 없음">속성 삭제 {delA}</span>}
        {e.ref && <span className="ml-auto rounded bg-white/60 px-1 text-[10px]">참조 · {e.subj_nm}</span>}
      </div>
      {/* 박스 너비 = 내용(표) 맞춤, 추정 크기는 최소 너비 — 관계선은 실측 크기(measured)로 붙음 */}
      {lvl !== 'CNCP' && (
        <table className="mx-2 my-1 font-mono leading-[18px]">
          <tbody>
            {cells(e, lvl, phy, nt, nmo).map((r, i) => (
              <tr key={i} className={e.attrs[i]?.pk_yn === 'Y' ? 'font-semibold' : ''} style={{ color: keyColor(e.attrs[i]), background: (vm && e.attrs[i] && VER_BG[vm.attr[e.attrs[i].attr_id]]) || undefined }}>
                {r.map((c, j) => (
                  <td key={j} className={`whitespace-nowrap ${j === 0 ? 'pr-1' : 'pr-3'} ${j > 1 ? 'font-normal text-gray-600' : ''}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {!e.attrs.length && (
              <tr>
                <td className="text-gray-400">(속성 없음)</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
const nodeTypes = { ent: EntNode }

// 관계선(사용자 정의 선) — 끝점·꺾임점은 부모 화면이 계산해 data 로 넘김. 선택된 선(편집 권한)만 손잡이 3개
type Grip = 's' | 't' | 'm'
type RelData = { sp: Pt; tp: Pt; ps: Side; cs: Side; mx: number | null; my: number | null; edit: boolean; onDrag: (id: string, k: Grip, screen: Pt) => void; onReset: (id: string) => void; bk?: { p: boolean; c: boolean } } // bk = 바커 반쪽 점선 여부(부모 쪽·자식 쪽)
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
  const st = selected ? { ...style, stroke: '#d97706', strokeWidth: 2 } : style
  // 바커 반쪽 선 — 경로 길이를 재서 앞·뒤 절반 dasharray(halfDash)
  const ref = useRef<SVGPathElement>(null)
  const [len, setLen] = useState(0)
  useLayoutEffect(() => {
    const l = ref.current?.getTotalLength() ?? 0
    if (Math.abs(l - len) > 0.5) setLen(l)
  }) // 매 그리기마다 확인(표기 전환·경로 변경 모두) — 길이가 바뀔 때만 상태 갱신
  if (d.bk)
    return (
      <>
        <BaseEdge id={id} path={path} style={{ stroke: 'transparent' }} label={label} labelX={lx} labelY={ly} labelStyle={labelStyle} interactionWidth={14} />
        <path ref={ref} d={path} fill="none" stroke={st?.stroke as string} strokeWidth={st?.strokeWidth} strokeDasharray={len ? halfDash(len, 'first', d.bk.p) : undefined} markerStart={markerStart} />
        <path d={path} fill="none" stroke={st?.stroke as string} strokeWidth={st?.strokeWidth} strokeDasharray={len ? halfDash(len, 'second', d.bk.c) : undefined} markerEnd={markerEnd} />
        {d.edit && <EdgeLabelRenderer>{[grip('s', d.sp), grip('t', d.tp), mid && grip('m', mid)]}</EdgeLabelRenderer>}
      </>
    )
  return (
    <>
      <BaseEdge id={id} path={path} markerStart={markerStart} markerEnd={markerEnd} style={st} label={label} labelX={lx} labelY={ly} labelStyle={labelStyle} interactionWidth={14} />
      {d.edit && <EdgeLabelRenderer>{[grip('s', d.sp), grip('t', d.tp), mid && grip('m', mid)]}</EdgeLabelRenderer>}
    </>
  )
}
const edgeTypes = { rel: RelEdge }

// 관계 표식 정의(IE ie-* · 바커 bk-*) — pf = id 접두어(화면 '' / 인쇄 미리보기 'p')
const markers = (pf: string) => (
    <svg width="0" height="0" className="absolute" aria-hidden data-erd-markers={pf || 'screen'}>
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
        {/* 바커 표기 — 까마귀발(여러 건)·UID 막대(식별 관계, 자식 쪽) */}
        <marker id={`${pf}bk-many`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="20" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M4 10 L20 1 M4 10 L20 19 M4 10 L20 10" stroke="#475569" strokeWidth="1.4" fill="none" />
        </marker>
        <marker id={`${pf}bk-uid`} viewBox="0 0 20 20" refX="20" refY="10" markerWidth="20" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M8 2 L8 18" stroke="#475569" strokeWidth="1.8" fill="none" />
        </marker>
        <marker id={`${pf}bk-many-uid`} viewBox="0 0 28 20" refX="28" refY="10" markerWidth="28" markerHeight="20" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M3 2 L3 18" stroke="#475569" strokeWidth="1.8" fill="none" />
          <path d="M12 10 L28 1 M12 10 L28 19 M12 10 L28 10" stroke="#475569" strokeWidth="1.4" fill="none" />
        </marker>
      </defs>
    </svg>
)
const TITLE_H = 34 // 인쇄 쪽 제목 줄
const FOOT_H = 16 // 인쇄 쪽 범례 줄

function Erd({ areaId }: { areaId: string }) {
  const api = `/api/areas/${areaId}`
  const flow = useReactFlow()
  const rf = useStoreApi()
  const [role, setRole] = useState<MbrRole | null>(null)
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [subjs, setSubjs] = useState<{ subj_id: string; subj_nm: string; prj_id: string }[]>([])
  const [subj, setSubj] = useState('')
  const [showRef, setShowRef] = useState(false) // 다른 주제영역 참조 엔터티 표시(기본 숨김)
  const [verOpen, setVerOpen] = useState(false) // 모델 버전 패널(스냅샷·비교, ERD-4)
  const [verShow, setVerShow] = useState<VerShow | null>(null) // 캔버스 버전 차이 표시(기준 → 현재)
  const verMark = useMemo(() => (verShow ? toMark(verShow.diff) : null), [verShow])
  useEffect(() => setVerShow(null), [prjId]) // 다른 프로젝트로 바꾸면 차이 표시 해제
  const [phyId, setPhyId] = useState('') // 기준 물리 모델(빈 값 = 서버가 첫 모델)
  const [phyModels, setPhyModels] = useState<{ phy_mdl_id: string; dbms_cd: string }[] | null>(null) // null = 아직 모름
  const [hidden, setHidden] = useState(0)
  const [phyDone, setPhyDone] = useState(true) // 이 주제영역 물리완료 여부
  const [dgmSts, setDgmSts] = useState<'WRT' | 'CMPTN'>('WRT') // ERD 작성완료(sql/037) — 완료면 배치·관계선 잠금
  const [lvl, setLvl] = useState<Lvl>('LGCL')
  const [phy, setPhy] = useState(false)
  const [ents, setEnts] = useState<Ent[]>([])
  const [rels, setRels] = useState<Rel[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState<ENode>([])
  const [sel, setSel] = useState<string | null>(null)
  const [selRel, setSelRel] = useState<string | null>(null) // 선택된 관계선
  // 미리보기(MiniMap) 보이기·숨기기(마스터 지시 2026-10-20) — 보는 사람 브라우저에 기억(저장 실패해도 동작)
  const [mini, setMini] = useState(true)
  useEffect(() => {
    try {
      setMini(localStorage.getItem('erd-minimap') !== '0')
    } catch {}
  }, [])
  const toggleMini = (v: boolean) => {
    setMini(v)
    try {
      localStorage.setItem('erd-minimap', v ? '1' : '0')
    } catch {}
  }
  const [pr, setPr] = useState({ paper: 'A3', orient: 'landscape' as Orient, margin: 10, title: true, guide: false, mode: 'fit' as 'fit' | 'pages' }) // 인쇄 설정
  // 마지막 설정·화면 위치 기억(마스터 지시 2026-10-18 "최종 설정 위치를 저장해서 다시 로딩 시 최종 설정과 위치로") — 이 브라우저, 분류체계별
  //  설정 = 주제영역·표시 수준·물리명·참조 표시·기준 물리 모델·인쇄(용지·방향·가이드·여백·제목·방식), 화면 위치 = 프로젝트|주제영역|표시 수준별 이동·확대
  const viewKey = `erd-view-${areaId}`, vpKey = `erd-vp-${areaId}`
  const restored = useRef(false)
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(viewKey) ?? 'null')
      if (v) {
        if (typeof v.subj === 'string') setSubj(v.subj)
        if (v.lvl === 'CNCP' || v.lvl === 'LGCL' || v.lvl === 'PHY') setLvl(v.lvl)
        if (typeof v.phy === 'boolean') setPhy(v.phy)
        if (typeof v.showRef === 'boolean') setShowRef(v.showRef)
        if (typeof v.phyId === 'string') setPhyId(v.phyId)
        if (v.pr && typeof v.pr === 'object') setPr((p) => ({ ...p, ...v.pr }))
      }
    } catch {}
    requestAnimationFrame(() => (restored.current = true)) // 복원 값이 그려진 뒤부터 저장(기본값으로 덮어쓰지 않게)
  }, [viewKey])
  const readVp = (k: string): { x: number; y: number; zoom: number } | null => {
    try {
      return (JSON.parse(window.localStorage.getItem(vpKey) ?? '{}') as Record<string, { x: number; y: number; zoom: number }>)[k] ?? null
    } catch {
      return null
    }
  }
  const saveVp = (k: string, vp: { x: number; y: number; zoom: number }) => {
    try {
      const all = JSON.parse(window.localStorage.getItem(vpKey) ?? '{}')
      all[k] = { x: Math.round(vp.x), y: Math.round(vp.y), zoom: Math.round(vp.zoom * 1000) / 1000 }
      window.localStorage.setItem(vpKey, JSON.stringify(all))
    } catch {}
  }
  const [shot, setShot] = useState<string | null>(null) // 인쇄 미리보기(화면 그림 복사본) — null = 닫힘
  const [nt, setNt] = useState<Nt>('IE') // 표기법
  const [nmo, setNmo] = useState<Nmo>(NMO_DEF) // 개체명 보기옵션
  const [nmoDraft, setNmoDraft] = useState<Nmo | null>(null) // 대화창 편집 중 값(null = 닫힘)
  const [ltReady, setLtReady] = useState(0) // 데이터타입 이름 채움 → 노드 다시 그리기
  // 좌우 패널 너비(마스터 지시 2026-10-18 — 경계 손잡이 끌기로 넓히고 줄임, 두 번 누르면 기본, 이 브라우저에 기억)
  const PANE = { l: { def: 224, min: 120, max: 600 }, r: { def: 384, min: 200, max: 800 } } as const
  const [paneW, setPaneW] = useState({ l: PANE.l.def as number, r: PANE.r.def as number })
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem('erd-pane') ?? 'null')
      if (v && typeof v.l === 'number' && typeof v.r === 'number') setPaneW({ l: v.l, r: v.r })
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const keepPane = (v: { l: number; r: number }) => {
    try {
      window.localStorage.setItem('erd-pane', JSON.stringify(v))
    } catch {}
  }
  // 손잡이 — 끄는 동안 창 이벤트로 추적(캔버스 위를 지나가도 끊기지 않음), 왼쪽은 오른쪽으로 끌면 넓어지고 오른쪽은 왼쪽으로 끌면 넓어짐
  const splitter = (k: 'l' | 'r') => (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={k === 'l' ? '모델 트리 너비 조절' : '엔터티 정보 너비 조절'}
      title="끌어서 너비 조절 · 두 번 누르면 기본 너비"
      className="group hidden cursor-col-resize items-center justify-center md:flex"
      onPointerDown={(e) => {
        e.preventDefault()
        const x0 = e.clientX, w0 = paneW[k]
        let last = paneW
        const move = (ev: PointerEvent) => {
          const d = ev.clientX - x0
          const w = Math.round(Math.min(PANE[k].max, Math.max(PANE[k].min, w0 + (k === 'l' ? d : -d))))
          setPaneW((p) => (last = { ...p, [k]: w }))
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          document.body.style.cursor = ''
          keepPane(last)
        }
        document.body.style.cursor = 'col-resize'
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
      onDoubleClick={() => setPaneW((p) => { const v = { ...p, [k]: PANE[k].def }; keepPane(v); return v })}
    >
      <span className="h-16 w-1.5 rounded-full bg-[#c7d2e6] group-hover:bg-[#3b5f9e]" />
    </div>
  )
  useEffect(() => {
    piFetch('/api/types')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return
        for (const t of j.types as { lgc_tp_cd: string; lgc_tp_nm: string }[]) LT[t.lgc_tp_cd] = t.lgc_tp_nm
        setLtReady((n) => n + 1)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('erd-nmo')
      if (v) setNmo({ ...NMO_DEF, ...JSON.parse(v) })
    } catch {}
  }, [])
  const applyNmo = (v: Nmo) => {
    setNmo(v)
    setNmoDraft(null)
    try {
      window.localStorage.setItem('erd-nmo', JSON.stringify(v))
    } catch {}
  }
  useEffect(() => {
    try {
      if (window.localStorage.getItem('erd-notation') === 'BK') setNt('BK')
    } catch {}
  }, [])
  const pickNt = (v: Nt) => {
    setNt(v)
    try {
      window.localStorage.setItem('erd-notation', v)
    } catch {}
  }
  const canvasRef = useRef<HTMLDivElement>(null)
  const [lyt, setLyt] = useState<Record<string, RelLyt>>({}) // 사용자가 옮긴 관계선(없으면 자동)
  const [dirty, setDirty] = useState(false)
  const [undo, setUndo] = useState<Record<string, { x: number; y: number }> | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const editor = perms.includes('MODEL_EDIT')
  const lay = editor && dgmSts !== 'CMPTN' // 배치·관계선 편집 가능(작성완료 ERD 는 완료 취소 후)
  const loadSeq = useRef(0) // 늦게 도착한 응답이 최신 선택을 덮어쓰지 않도록
  const curRef = useRef<Map<string, { x: number; y: number }>>(new Map()) // 편집 뒤 재조회 시 저장 안 한 드래그 위치 유지
  const keepRef = useRef('') // 편집 뒤 재조회 대상 키(프로젝트|주제영역|단계) — 다른 대상 조회에는 적용 안 함
  const autoRef = useRef<Set<string>>(new Set()) // 자동 배치 후 끌지도 저장하지도 않은 엔터티 — 재조회(관계 추가 등) 때 다시 관계 상대 옆으로 배치
  const [form, setForm] = useState<'new' | 'edit' | null>(null)
  const [chk, setChk] = useState<{ summary: { no_pk: number; fk_missing: number; issues: number; reviews: number }; issues: Issue[] } | null>(null)

  useEffect(() => {
    piFetch(api)
      .then((r) => r.json())
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
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
    setDgmSts(j.dgm?.dgm_sts_cd ?? 'WRT')
    if (!phyId && j.phy_mdl_id) setPhyId(j.phy_mdl_id)
    const es = (j.ents as Ent[]).filter((e) => showRef || !e.ref)
    const pos = new Map((j.pos as { ent_id: string; x: number; y: number; fix: boolean }[]).map((p) => [p.ent_id, p]))
    const keep = keepRef.current === `${prjId}|${subj}|${lvl}`
    keepRef.current = ''
    if (!keep) setChk(null)
    const dbPos = pos.size > 0
    const prevAuto = keep ? autoRef.current : new Set<string>()
    if (keep) for (const [id, c] of curRef.current) if (!prevAuto.has(id)) pos.set(id, { ent_id: id, ...c, fix: pos.get(id)?.fix ?? false })
    autoRef.current = new Set(es.filter((e) => !pos.has(e.ent_id) && (keep ? prevAuto.has(e.ent_id) || !curRef.current.has(e.ent_id) : dbPos)).map((e) => e.ent_id))
    // 좌표 없는 엔터티만 자동 배치(좌표가 하나도 없으면 전체 배치)
    const laid = autoLayout(
      es.map((e) => ({ id: e.ent_id, ...sizeOf(e, lvl, phy, nmo), group: e.subj_id, x: pos.get(e.ent_id)?.x, y: pos.get(e.ent_id)?.y, fixed: pos.get(e.ent_id)?.fix })),
      (j.rels as Rel[]).map((r) => ({ from: r.prnt_ent_id, to: r.chld_ent_id })),
      { mode: 'new' },
    )
    setEnts(es)
    const shownIds = new Set(es.map((e) => e.ent_id))
    setRels((j.rels as Rel[]).filter((r) => shownIds.has(r.prnt_ent_id) && shownIds.has(r.chld_ent_id))) // 숨긴 참조 엔터티의 관계 제외
    setNodes(es.map((e) => ({ id: e.ent_id, type: 'ent', position: laid[e.ent_id], data: { ent: e, lvl, phy, nt, nmo, fix: !!pos.get(e.ent_id)?.fix } })))
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
    if (!keep) {
      const vp = readVp(`${prjId}|${subj}|${lvl}`)
      requestAnimationFrame(() => (vp ? void flow.setViewport(vp) : void flow.fitView({ padding: 0.15, maxZoom: 1 }))) // 기억한 위치가 있으면 그대로
    }
  }, [api, prjId, subj, lvl, phy, showRef, phyId, setNodes, flow])
  // 프로젝트를 바꾸면 그 프로젝트의 첫 주제영역을 자동 선택(ERD 는 주제영역 단위)
  useEffect(() => {
    if (!prjId || !subjs.length) return // 목록을 받기 전에는 판단하지 않음(기억한 주제영역을 지우지 않게)
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

  // 설정이 바뀌면 기억(복원이 끝난 뒤부터)
  useEffect(() => {
    if (!restored.current) return
    try {
      window.localStorage.setItem(viewKey, JSON.stringify({ subj, lvl, phy, showRef, phyId, pr }))
    } catch {}
  }, [viewKey, subj, lvl, phy, showRef, phyId, pr])
  // 표시 수준·이름 전환은 데이터만 갱신(좌표 유지)
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, lvl, phy, nt, nmo } })))
  }, [lvl, phy, nt, nmo, ltReady, setNodes])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  // 박스(실측 크기 우선)·자동 끝점 — 드래그할 때마다 다시 계산
  const geo = useMemo(() => {
    const boxes = new Map<string, Box>()
    for (const n of nodes) {
      const s = sizeOf(n.data.ent, lvl, phy, nmo)
      boxes.set(n.id, { x: n.position.x, y: n.position.y, w: n.measured?.width ?? s.w, h: n.measured?.height ?? s.h })
    }
    const shown = rels.filter((r) => boxes.has(r.prnt_ent_id) && boxes.has(r.chld_ent_id))
    return { boxes, shown, auto: autoAnchors(shown.map((r) => ({ id: r.rel_id, from: r.prnt_ent_id, to: r.chld_ent_id })), boxes) }
  }, [nodes, rels, lvl, phy, nmo, ltReady])
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
          const o = {
            id: r.rel_id,
            source: r.prnt_ent_id,
            target: r.chld_ent_id,
            sourceHandle: `s-${l.ps.toLowerCase()}`,
            targetHandle: `t-${l.cs.toLowerCase()}`,
            type: 'rel' as const,
            selected: selRel === r.rel_id,
            data: { sp, tp, ps: l.ps, cs: l.cs, mx: l.mx, my: l.my, edit: lay && selRel === r.rel_id, onDrag: dragRel, onReset: resetRel, ...(nt === 'BK' ? { bk: { p: r.chld_opt_yn === 'Y', c: r.prnt_opt_yn === 'Y' } } : {}) },
            label: r.rel_nm ?? undefined,
            labelStyle: { fontSize: 10 },
            ...(nt === 'BK'
              ? {
                  // 바커 : 여러 건 = 까마귀발, 1 = 표식 없음, 식별 관계 = 자식 쪽 UID 막대, N:M 은 부모 쪽도 까마귀발
                  style: { stroke: '#475569', strokeWidth: 1.4 },
                  markerStart: r.crdn_cd === 'NM' ? 'bk-many' : undefined,
                  markerEnd: many ? (r.idnt_yn === 'Y' ? 'bk-many-uid' : 'bk-many') : r.idnt_yn === 'Y' ? 'bk-uid' : undefined,
                }
              : {
                  style: { stroke: '#475569', strokeWidth: 1.4, strokeDasharray: r.idnt_yn === 'Y' ? undefined : '6 4' },
                  markerStart: r.prnt_opt_yn === 'Y' ? 'ie-zero-one' : 'ie-one',
                  markerEnd: many ? (r.chld_opt_yn === 'Y' ? 'ie-zero-many' : 'ie-one-many') : r.chld_opt_yn === 'Y' ? 'ie-zero-one' : 'ie-one',
                }),
          }
          const vk = verMark?.rel[r.rel_id] // 버전 차이 표시 : 추가·변경 관계선 색·굵게
          return vk ? { ...o, style: { ...o.style, stroke: VER_C[vk], strokeWidth: 2.6 } } : o
        }),
    [geo, lytOf, selRel, lay, dragRel, resetRel, nt, verMark],
  )

  const curPos = () => Object.fromEntries(nodes.map((n) => [n.id, { ...n.position }]))
  const arrange = (mode: 'all' | 'new') => {
    setUndo(curPos())
    const laid = autoLayout(
      nodes.map((n) => ({ id: n.id, ...sizeOf(n.data.ent, lvl, phy, nmo), group: n.data.ent.subj_id, x: n.position.x, y: n.position.y, fixed: n.data.fix })),
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
    autoRef.current.clear()
    setMsg(`배치를 저장했습니다(${LVL_NM[lvl]} 다이어그램)`)
  }
  // ERD 작성완료·완료 취소(보고 있는 주제영역 다이어그램) — 완료 = 배치·관계선 잠금, DDL 생성 대상
  const setStage = async (sts: 'WRT' | 'CMPTN') => {
    if (sts === 'CMPTN' && !window.confirm('ERD 작성완료 — 배치·관계선 편집이 잠기고 DDL 생성 대상이 됩니다(완료 취소 후 편집). 계속할까요?')) return
    setBusy(true)
    const j = await (await piFetch(`${api}/projects/${prjId}/stage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layer: 'DGM', sts, subj_id: subj, mdl_lvl_cd: lvl, phy_mdl_id: phyId || undefined }) })).json()
    setBusy(false)
    if (j.done?.length) {
      setDgmSts(sts)
      setSel(null)
      setSelRel(null)
      setMsg(sts === 'CMPTN' ? 'ERD 작성완료 — 배치·관계선이 잠겼습니다(DDL 생성 화면에서 대상)' : 'ERD 완료를 취소했습니다 — 배치·관계선을 편집할 수 있습니다')
    } else setMsg(j.fail?.[0]?.why?.join(' · ') ?? j.message ?? '')
  }
  const toggleFix = (id: string) => {
    autoRef.current.delete(id)
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, fix: !n.data.fix } } : n)))
    setDirty(true)
  }
  const focus = (id: string) => {
    const n = byId.get(id)
    if (!n) return
    setSel(id)
    const { w, h } = sizeOf(n.data.ent, lvl, phy, nmo)
    void flow.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1.1, duration: 300 })
  }
  // 인쇄 — 쪽 크기(여백 뺀 인쇄 영역)·내용 영역(제목·범례 줄 뺌)·페이지 나눔
  const page = useMemo(() => {
    const a = printArea(pr.paper, pr.orient, pr.margin)
    const ch = a.h - (pr.title ? TITLE_H + FOOT_H : 0)
    return { ...a, cw: a.w, ch, grid: pageGrid([...geo.boxes.values()], a.w, ch) }
  }, [pr, geo])
  // 화면 그림 복사(가이드·손잡이 제외, 마커 id 를 인쇄용 접두로) — 다시 그려진 뒤
  const snap = () =>
    setTimeout(() => {
      const vp = canvasRef.current?.querySelector('.react-flow__viewport')
      if (!vp) return
      const c = vp.cloneNode(true) as HTMLElement
      c.querySelectorAll('.react-flow__viewport-portal, .react-flow__edgelabel-renderer').forEach((x) => x.remove())
      setShot(c.innerHTML.replace(/url\((['"]?)#(ie|bk)-/g, 'url($1#p$2-'))
    }, 120)
  // 이미지 내보내기(PNG·SVG, PRD_PiErd S5 2026-10-20) — 엔터티 전체 영역을 100% 크기로, 화면 이동·확대와 무관. 인쇄 복사본처럼 손잡이·가이드(포털·라벨 층)는 뺌
  //  관계 표식(marker) 정의는 캡처 영역 밖(별도 svg)에 있어 그대로면 그림에서 빠짐 → 캡처하는 동안만 복사본을 영역 안에 넣었다 뺌
  const exportImg = async (kind: 'png' | 'svg') => {
    const vp = canvasRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!vp || !nodes.length) return
    const b = getNodesBounds(nodes)
    const pad = 40
    const w = Math.ceil(b.width + pad * 2)
    const h = Math.ceil(b.height + pad * 2)
    const defs = document.querySelector('[data-erd-markers="screen"]')?.cloneNode(true) as Element | undefined
    if (defs) vp.appendChild(defs)
    setBusy(true)
    try {
      const opt = {
        backgroundColor: '#ffffff',
        width: w,
        height: h,
        pixelRatio: kind === 'png' ? 2 : 1,
        style: { width: `${w}px`, height: `${h}px`, transform: `translate(${pad - b.x}px, ${pad - b.y}px) scale(1)` },
        filter: (n: HTMLElement) => !n.classList?.contains('react-flow__viewport-portal') && !n.classList?.contains('react-flow__edgelabel-renderer'),
      }
      const url = kind === 'png' ? await toPng(vp, opt) : await toSvg(vp, opt)
      const a = document.createElement('a')
      a.href = url
      a.download = `${subjs.find((s) => s.subj_id === subj)?.subj_nm ?? '전체'}_${LVL_NM[lvl].replace(/\(.*\)/, '')}_ERD_${new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)}.${kind}` // 날짜 = 한국 시간
      a.click()
      setMsg(`ERD 를 ${kind.toUpperCase()} 로 내려받았습니다(${w}×${h})`)
    } catch (e) {
      setMsg(`이미지 내보내기 실패 : ${(e as Error).message}`)
    } finally {
      defs?.remove()
      setBusy(false)
    }
  }
  const openPrint = () => {
    setSel(null)
    setSelRel(null)
    setForm(null)
    snap()
  }
  // 용지·방향 바꿈 — 좌상단 엔터티를 첫 쪽 모서리 같은 자리(40,40)로, 전체(엔터티·옮긴 꺾임점)를 같은 거리만큼(되돌리기 가능, 저장해야 반영)
  const changePaper = (patch: { paper?: string; orient?: Orient }) => {
    const next = { ...pr, ...patch, guide: true }
    const same = next.paper === pr.paper && next.orient === pr.orient
    setPr(next)
    if (!lay) return // 작성완료 ERD·조회 권한 : 용지만 바꾸고 배치는 그대로
    const d = realign([...geo.boxes.values()])
    if (same || (Math.abs(d.dx) < 0.5 && Math.abs(d.dy) < 0.5)) return
    setUndo(curPos())
    setNodes((ns) => ns.map((x) => ({ ...x, position: { x: x.position.x + d.dx, y: x.position.y + d.dy } })))
    setLyt((L) => Object.fromEntries(Object.entries(L).map(([k, l]) => [k, l.mx == null || l.my == null ? l : { ...l, mx: l.mx + d.dx, my: l.my + d.dy }])))
    setDirty(true)
    setMsg(`${next.paper} ${next.orient === 'landscape' ? '가로' : '세로'} — 좌상단 엔터티 기준으로 전체를 같은 위치로 옮겼습니다(배치 저장하면 반영, 되돌리기 가능)`)
    if (shot !== null) snap() // 인쇄 미리보기 중이면 옮긴 그림으로 다시
  }
  const sheets = pr.mode === 'fit' ? [{ no: 1, t: printFit([...geo.boxes.values()], page.cw, page.ch) }] : page.grid.tiles.map((t) => ({ no: t.no, t: { x: -(page.grid.x0 + t.c * page.cw), y: -(page.grid.y0 + t.r * page.ch), zoom: 1 } }))
  const selEnt = ents.find((e) => e.ent_id === sel)
  const selRelObj = rels.find((r) => r.rel_id === selRel)
  const entNm = (id: string) => { const e = ents.find((x) => x.ent_id === id); return e ? (isPhy(lvl, phy) ? `${e.tbl_phy_nm} (${e.ent_log_nm})` : e.ent_log_nm) : '' }
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
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5 md:flex md:h-full md:flex-col">
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
        <select value={nt} onChange={(e) => pickNt(e.target.value as Nt)} className={sel2} aria-label="표기법" title="IE(정보공학, ERwin) 또는 바커(Barker, DA#) 표기">
          {(Object.keys(NT_NM) as Nt[]).map((k) => (
            <option key={k} value={k}>
              {NT_NM[k]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={phy} onChange={(e) => setPhy(e.target.checked)} /> 물리명
        </label>
        <button type="button" className="rounded bg-white/20 px-2 py-1 hover:bg-white/30" onClick={() => setNmoDraft(nmo)} title="DA# 개체명 보기옵션 — 보조명·동의어·도메인·논리명 병기">
          개체명 보기옵션
        </button>
        <label className="flex items-center gap-1" title="관계로 이어진 다른 주제영역 엔터티를 점선 박스로 함께 표시">
          <input type="checkbox" checked={showRef} onChange={(e) => (setShowRef(e.target.checked), setSel(null))} /> 다른 주제영역 참조 표시
        </label>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={!lay || !nodes.length} onClick={() => arrange('all')}>
            자동 배치
          </button>
          <button type="button" className={btn} disabled={!lay || !nodes.length} onClick={() => arrange('new')}>
            새 엔터티만 배치
          </button>
          <button type="button" className={btn} disabled={!undo} onClick={revert}>
            되돌리기
          </button>
          <select value={pr.paper} onChange={(e) => changePaper({ paper: e.target.value })} className={sel2} aria-label="인쇄 용지">
            {Object.keys(PAPER).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select value={pr.orient} onChange={(e) => changePaper({ orient: e.target.value as Orient })} className={sel2} aria-label="인쇄 방향">
            <option value="landscape">가로</option>
            <option value="portrait">세로</option>
          </select>
          <label className="flex items-center gap-1" title="100% 크기 인쇄 쪽 경계를 점선으로 표시">
            <input type="checkbox" checked={pr.guide} onChange={(e) => setPr({ ...pr, guide: e.target.checked })} /> 페이지 가이드
          </label>
          <label className="flex items-center gap-1" title="오른쪽 아래 전체 미리보기(작은 지도) 보이기·숨기기">
            <input type="checkbox" checked={mini} onChange={(e) => toggleMini(e.target.checked)} /> 미리보기
          </label>
          <button type="button" className={btn} disabled={!nodes.length} onClick={openPrint} title="인쇄 미리보기 — 한 장에 맞춤 또는 가이드대로 나눠 인쇄(PDF 저장은 인쇄 창의 'PDF로 저장')">
            🖨 인쇄
          </button>
          <button type="button" className={btn} disabled={!nodes.length || busy} onClick={() => void exportImg('png')} title="ERD 전체를 PNG 이미지로 내려받기(100% 크기·2배 해상도, 손잡이·가이드 제외)">
            PNG
          </button>
          <button type="button" className={btn} disabled={!nodes.length || busy} onClick={() => void exportImg('svg')} title="ERD 전체를 SVG 로 내려받기(확대해도 선명)">
            SVG
          </button>
          <button type="button" className={btn} disabled={!prjId} onClick={() => setVerOpen(true)} title="프로젝트 논리 모델 스냅샷 저장·두 버전(또는 현재) 비교">
            버전
          </button>
          {lay && (
            <button type="button" className="rounded bg-white px-3 py-1 font-semibold text-[#1f3a68] disabled:opacity-40" disabled={!dirty || busy || !nodes.length} onClick={() => void save()}>
              배치 저장{dirty ? ' *' : ''}
            </button>
          )}
          {dgmSts === 'CMPTN' && <span className="rounded bg-emerald-500 px-2 py-1 font-semibold">ERD 작성완료</span>}
          {editor && subj && phyDone && (
            dgmSts === 'CMPTN' ? (
              <button type="button" className={btn} disabled={busy} onClick={() => void setStage('WRT')} title="완료를 취소하면 배치·관계선을 다시 편집할 수 있습니다">
                완료 취소
              </button>
            ) : (
              <button type="button" className="rounded bg-emerald-500 px-3 py-1 font-semibold hover:bg-emerald-600 disabled:opacity-40" disabled={busy || dirty || !nodes.length} onClick={() => void setStage('CMPTN')} title={dirty ? '배치를 먼저 저장하십시오' : '배치·관계선을 잠그고 DDL 생성 대상으로'}>
                ERD 작성완료
              </button>
            )
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
      {verShow && verMark && (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm">
          <span className="font-semibold">버전 차이 표시 : {verShow.title}</span>
          {(['INS', 'UPD'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: VER_C[k] }} /> {VER_NM[k]}
            </span>
          ))}
          <span>추가 {verShow.cnt.ins} · 변경 {verShow.cnt.upd} · 삭제 {verShow.cnt.del}</span>
          {verMark.delEnt + verMark.delRel > 0 && <span className="text-red-700">삭제된 엔터티 {verMark.delEnt}·관계 {verMark.delRel} 는 캔버스에 없음(버전 패널 목록 참고)</span>}
          <button type="button" className="ml-auto rounded border border-emerald-400 px-2 py-0.5 hover:bg-emerald-100" onClick={() => setVerShow(null)}>
            표시 끄기
          </button>
        </div>
      )}

      <div className="mt-3 grid h-[72vh] gap-3 md:h-auto md:min-h-[26rem] md:flex-1 md:grid-cols-[var(--erd-l)_10px_minmax(0,1fr)_10px_var(--erd-r)] md:gap-0" style={{ ["--erd-l" as string]: `${paneW.l}px`, ["--erd-r" as string]: `${paneW.r}px` }}>
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
                      <span style={{ color: entTpColor(e.ent_tp_cd).border }}>■</span> {isPhy(lvl, phy) ? `${e.tbl_phy_nm} (${e.ent_log_nm})` : e.ent_log_nm}
                      {e.ref && <span className="ml-1 text-xs text-gray-500">참조</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {!ents.length && <p className="p-3 text-gray-500">엔터티가 없습니다(논리 모델에서 등록)</p>}
        </nav>
        {splitter('l')}

        {/* 오른쪽 끌기로 화면 이동할 때 브라우저 메뉴 막음 — 빈 곳뿐 아니라 엔터티·관계선·선택 상자 위에서 떼도(onPaneContextMenu 는 빈 곳만, 2026-10-20 검증 지적) */}
        <div
          ref={canvasRef}
          className="rounded border"
          aria-label="ERD 캔버스"
          onContextMenu={(e) => e.preventDefault()}
        >
          <MarkCtx.Provider value={verMark}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={(cs) => (cs.forEach((c) => c.type === 'position' && !c.dragging && autoRef.current.delete(c.id)), onNodesChange(cs))} // 화살표 키 이동도 사용자가 옮긴 것
            onNodeDrag={(_, __, ns) => midToCenter(new Set(ns.map((x) => x.id)))}
            onNodeDragStop={(_, __, ns) => (setDirty(true), ns.forEach((x) => autoRef.current.delete(x.id)))}
            // 엔터티 클릭(끌기 없음) = 그것만 선택(Ctrl·⌘ = 추가·빼기는 React Flow 기본) — 기본 동작은 이미 선택된 엔터티를 눌러도 여러 개 선택이 유지돼 하나만 옮길 수 없음
            onNodeClick={(ev, n) => {
              if (!ev.ctrlKey && !ev.metaKey) setNodes((ns) => ns.map((x) => (x.selected === (x.id === n.id) ? x : { ...x, selected: x.id === n.id })))
              setSel(n.id)
              setSelRel(null)
            }}
            onEdgeClick={(_, e) => (setSelRel(e.id), setSel(null), setForm(null))}
            // 빈 곳 클릭 = 선택 해제(selectionOnDrag 에서는 클릭이 크기 0 선택 상자로 처리돼 기본 해제가 안 됨)
            onPaneClick={() => (setNodes((ns) => (ns.some((x) => x.selected) ? ns.map((x) => (x.selected ? { ...x, selected: false } : x)) : ns)), setSel(null), setSelRel(null))}
            nodesDraggable={lay}
            nodesConnectable={false}
            // 여러 엔터티 선택·함께 이동(마스터 지시 2026-10-18) : 빈 곳 왼쪽 끌기 = 선택 상자(걸친 엔터티), Ctrl+클릭 = 추가·빼기,
            //  선택한 엔터티 하나를 끌면 함께 이동. 화면 이동 = 가운데·오른쪽 버튼 끌기(휠 = 확대·축소, 터치 한 손가락 = 화면 이동).
            //  잠금(작성완료·조회 권한) = 엔터티를 옮길 수 없으므로 왼쪽 끌기도 화면 이동(2026-10-20 마스터 확인)
            selectionOnDrag={lay}
            panOnDrag={lay ? [1, 2] : true}
            // 선택 상자가 끝나면 묶음 사각형(NodesSelection)을 없애고 엔터티별 선택만 남김(2026-10-20 마스터 지시) — 사각형이 클릭을 가로채
            //  하나만 다시 고를 수 없던 문제. 이제 엔터티 클릭 = 그것만 선택·그것만 이동, 선택된 여러 개 중 하나를 끌기 = 함께 이동, 빈 곳 클릭 = 해제
            //  React Flow 가 onSelectionEnd 를 부른 '다음'에 nodesSelectionActive 를 켜므로 한 틱 뒤에 끔(@xyflow/react 12.12 Pane pointerup 순서)
            onSelectionEnd={() => window.setTimeout(() => rf.setState({ nodesSelectionActive: false }))}
            autoPanOnSelection={false} // 캔버스 가장자리에서 선택 상자를 끌면 화면이 계속 밀려 나가던 문제(검증 실측 — 화면 위치 기억까지 틀어짐)
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode="Control"
            deleteKeyCode={null} // Delete·Backspace 로 화면에서 엔터티가 빠지지 않게(삭제는 엔터티 수정 화면에서)
            onMoveEnd={(_, vp) => prjId && subj && shot === null && saveVp(`${prjId}|${subj}|${lvl}`, vp)} // 이동·확대가 끝나면 위치 기억
            onSelectionDrag={(_, ns) => midToCenter(new Set(ns.map((x) => x.id)))}
            onSelectionDragStop={() => setDirty(true)}
            minZoom={0.05}
            // 처음 화면 맞춤은 load()가 함(기억한 위치가 있으면 그 위치) — fitView 속성은 그 뒤에 다시 맞춰 기억 위치를 덮으므로 쓰지 않음
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
            {mini && <MiniMap pannable zoomable nodeColor={(n) => entTpColor((n.data as EntData).ent.ent_tp_cd).border} />}
          </ReactFlow>
          </MarkCtx.Provider>
        </div>
        {splitter('r')}

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
                {selEnt.subj_nm} · {ENT_TP[selEnt.ent_tp_cd as EntTp] ?? selEnt.ent_tp_cd}
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
              {lay && (
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
              {lay ? (
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
                <p className="mt-2 text-xs text-gray-500">{editor ? 'ERD 작성완료 : 선 위치는 완료 취소 후 옮길 수 있습니다' : '조회 권한 : 선 위치는 편집 권한이 있을 때 옮길 수 있습니다'}</p>
              )}
            </>
          ) : (
            <p className="text-gray-500">엔터티를 누르면 정보·속성 편집, 관계선을 누르면 선 위치 조정이 보입니다. {lay ? '빈 곳을 왼쪽 버튼으로 끌면 여러 엔터티 선택(Ctrl+클릭 추가) → 하나를 끌면 함께 이동, 화면 이동은 오른쪽·가운데 버튼 끌기' : '작성완료·조회 권한은 엔터티 이동 불가 — 끌기 = 화면 이동(옮기려면 완료 취소)'}. {LEGEND[nt]}</p>
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
      {nmoDraft && (
        <div className="fixed inset-0 z-[900] grid place-items-center bg-black/30" onClick={() => setNmoDraft(null)}>
          <div role="dialog" aria-label="개체명 보기옵션" className="w-80 rounded-lg border bg-white text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-3 py-2">
              <strong>개체명 보기옵션</strong>
              <button type="button" onClick={() => setNmoDraft(null)} aria-label="닫기" className="text-gray-500">
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-2">
              {NMO_FORM.map(([grp, secs]) => (
                <div key={grp} className="mb-2 rounded border">
                  <div className="bg-gray-100 px-2 py-1 font-semibold">{grp}</div>
                  {secs.map(([sec, items]) => (
                    <div key={sec}>
                      <div className="bg-gray-50 px-3 py-0.5 text-xs font-semibold text-gray-700">{sec}</div>
                      {items.map(([k, nm]) => (
                        <label key={k} className="flex items-center justify-between border-t px-4 py-1 hover:bg-gray-50">
                          {nm}
                          <input type="checkbox" checked={nmoDraft[k]} onChange={(e) => setNmoDraft({ ...nmoDraft, [k]: e.target.checked })} />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
              <p className="px-1 text-xs text-gray-500">표시 : [보조명] · {'{동의어}'} · 물리에서 (논리명) — 논리/물리는 '물리명'·표시 수준(물리)에 따름</p>
            </div>
            <div className="flex justify-end gap-2 border-t px-3 py-2">
              <button type="button" onClick={() => setNmoDraft(NMO_DEF)} className="mr-auto text-xs text-gray-600 underline">
                기본값
              </button>
              <button type="button" onClick={() => applyNmo(nmoDraft)} className="btn-3d px-4 py-1">
                확인
              </button>
              <button type="button" onClick={() => setNmoDraft(null)} className="rounded border px-4 py-1">
                취소
              </button>
            </div>
          </div>
        </div>
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
              <select value={pr.paper} onChange={(e) => changePaper({ paper: e.target.value })} className={sel2} aria-label="용지">
                {Object.keys(PAPER).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select value={pr.orient} onChange={(e) => changePaper({ orient: e.target.value as Orient })} className={sel2} aria-label="방향">
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
                      {LVL_NM[lvl]} · {NT_NM[nt]} · {phy ? '물리명' : '논리명'} · 출력 {new Date().toLocaleDateString('sv-SE')} · {sh.no} / {sheets.length}쪽
                    </span>
                  </div>
                )}
                <div className="react-flow relative min-h-0 flex-1 overflow-hidden">
                  <div className="react-flow__viewport" style={{ position: 'absolute', transform: `translate(${sh.t.x}px, ${sh.t.y}px) scale(${sh.t.zoom})` }} dangerouslySetInnerHTML={{ __html: shot }} />
                </div>
                {pr.title && (
                  <div className="shrink-0 border-t px-3 text-[10px] leading-4 text-gray-500" style={{ height: FOOT_H }}>
                    {LEGEND[nt]}
                  </div>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
      {verOpen && prjId && <VersionPanel api={api} prjId={prjId} editor={editor} onClose={() => setVerOpen(false)} onShow={setVerShow} />}
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

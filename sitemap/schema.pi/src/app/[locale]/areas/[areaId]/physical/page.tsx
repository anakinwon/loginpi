'use client'
import { piFetch } from '@pi/auth/client'
// 물리 모델 화면(PRD_PiErd S2 P1·P5·P6) — 논리 모델 → 물리 전환과 칼럼 그리드 편집, DDL·물리 정의서 내려받기
//  상단 : 프로젝트·DBMS·대소문자·삭제 칼럼 선택 → 전환 미리보기(관문 사유·변환 이슈·테이블/칼럼/FK 수) → 전환
//  아래 : 물리 모델(DBMS별) 선택 → 논리와의 차이(도메인 영향 포함)·DDL·정의서 / 왼쪽 테이블 목록 · 오른쪽 칼럼 그리드(순서·NULL·기본값, 저장 = 테이블 단위 묶음)
//  엔터티 선택 전환(마스터 지시 2026-10-17) : 작성완료 엔터티만 골라 전환, 테이블 작성완료 → ERD
//  주제영역 콤보(논리 화면과 선택 공유) : 테이블 목록·단계 패널을 선택한 주제영역 1개로 한정
//  논리 변경 반영(S5) = 동기화(순서·NULL·기본값 편집 유지) + 변경분 DDL(ALTER) 내려받기. 삭제 후 재전환도 가능(편집값 사라짐)
//  인덱스(S5, sql/063) : 테이블 상세 아래 목록·추가(칼럼을 고른 순서 = 인덱스 칼럼 순서)·삭제, 테이블 작성완료면 읽기 전용
import { Link } from '@/i18n/navigation'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Download, KeyRound, Lock, Plus, RefreshCw, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { DBMS_PRFL, dbmsList, type DbmsCd } from '@/lib/modelpi/dbms'
import { type MbrRole, type Perm } from '@/lib/roles'
import { Icon3D } from '@/components/icon-3d'
import { InfoTip, PageHead } from '@/components/page-head'
import { MENU_ICON } from '@/lib/menu-icons'
import StageBar, { type StageData } from '../model/stage-bar'
import { useSubj } from '../model/use-subj'

interface Col {
  phy_col_id: string
  attr_id: string | null
  sys_col_yn: string
  col_nm: string
  col_seq: number
  phy_tp_nm: string
  data_len: number | null
  data_scale: number | null
  null_yn: string
  bsc_val_txt: string | null
  pk_yn: string
  pk_seq: number | null
  ver_no: number
}
interface Tbl {
  phy_tbl_id: string
  ent_id: string
  tbl_nm: string
  tbl_desc: string | null
  phy_sts_cd?: string
  auto_inc_yn?: string // 단일 PK 자동 증가(테이블별, sql/036)
  ver_no?: number
  cols: Col[]
  indexes?: Idx[] // 일반·유일 인덱스(sql/063)
}
interface Idx {
  phy_idx_id: string
  idx_nm: string
  unq_yn: string
  col_ids: string[]
  col_nms: string[]
  ver_no: number
  invalid: boolean // 삭제된 칼럼 참조·PK 와 같은 구성(DDL 생략)
  why: string | null
}
interface Mdl {
  phy_mdl_id: string
  dbms_cd: string
  idntfr_ltr_cd: string
  del_col_use_yn: string
  ver_no: number
  reg_dtm: string
}
interface Preview {
  dbms_cd: string
  why: string[]
  issues: string[]
  tbl_cnt: number
  col_cnt: number
  fk_cnt: number
}
type Diff = Record<'add_tbl' | 'del_tbl' | 'chg_tbl' | 'add_col' | 'del_col' | 'chg_col' | 'dom_chg' | 'seq_col', string[]>
const DIFF_NM: Record<keyof Diff, string> = { add_tbl: '추가 테이블', del_tbl: '삭제 테이블', chg_tbl: '테이블명 변경', add_col: '추가 칼럼', del_col: '삭제 칼럼', chg_col: '변경 칼럼', dom_chg: '도메인 변경 영향', seq_col: '칼럼 순서 변경' }
const DBMS = dbmsList()
const dbmsNm = (cd: string) => DBMS.find((d) => d.cd === cd)?.nm ?? cd
const tpOf = (c: Col) => (c.data_len != null ? `${c.phy_tp_nm}(${c.data_len}${c.data_scale != null ? `,${c.data_scale}` : ''})` : c.phy_tp_nm)
// 보조 동작 = 평면 버튼(sm), 칼럼 표 칸 = 행 헤어라인만
const btn = 'btn-key btn-sm'
const TDP = 'border-b px-3 py-1'

export default function PhysicalPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const api = `/api/areas/${areaId}`
  const [role, setRole] = useState<MbrRole | null>(null)
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [dbms, setDbms] = useState<DbmsCd | ''>('')
  const [ltr, setLtr] = useState<'' | 'UPPER' | 'LOWER'>('')
  const [pv, setPv] = useState<Preview | null>(null)
  const [models, setModels] = useState<Mdl[]>([])
  const [mdlId, setMdlId] = useState('')
  const [det, setDet] = useState<{ mdl: Mdl; tables: Tbl[]; diff: Diff | null } | null>(null)
  const [tblId, setTblId] = useState('')
  const [edit, setEdit] = useState<Map<string, Partial<Col>>>(new Map())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const editor = perms.includes('MODEL_EDIT')
  const base = `${api}/projects/${prjId}/physical`

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
          keep = window.localStorage.getItem(`logical-prj-${areaId}`) // 논리 화면과 같은 프로젝트 선택 유지
        } catch {}
        setPrjId(j.items.find((p: { prj_id: string }) => p.prj_id === keep)?.prj_id ?? j.items[0]?.prj_id ?? '')
      })
  }, [api, areaId])

  const [picked, setPicked] = useState<Set<string>>(new Set()) // 전환할 엔터티
  const { subjs, subjId, setSubjId } = useSubj(api, prjId)
  const [entSubj, setEntSubj] = useState<Map<string, string>>(new Map()) // 엔터티 → 주제영역(단계 패널 응답 재사용)
  const onStage = useCallback((d: StageData) => setEntSubj(new Map(d.ents.map((e) => [e.ent_id, e.subj_id]))), [])
  const [stageRev, setStageRev] = useState(0)
  const pickKey = [...picked].sort().join(',')
  const loadList = useCallback(async () => {
    if (!prjId) return
    const j = await (await piFetch(`${base}?${new URLSearchParams({ ...(dbms ? { dbms } : {}), ...(pickKey ? { ent: pickKey } : {}) })}`)).json()
    if (!j.ok) return setMsg(j.message)
    setPv(j.preview)
    if (!dbms) setDbms(j.preview.dbms_cd)
    setModels(j.models)
    setMdlId((cur) => (j.models.some((m: Mdl) => m.phy_mdl_id === cur) ? cur : (j.models[0]?.phy_mdl_id ?? '')))
  }, [base, prjId, dbms, pickKey])
  useEffect(() => {
    setPicked(new Set()) // 프로젝트·DBMS·주제영역이 바뀌면 전환 선택 초기화(보이지 않는 선택이 남지 않게)
  }, [prjId, dbms, subjId])
  useEffect(() => {
    void loadList()
    try {
      if (prjId) window.localStorage.setItem(`logical-prj-${areaId}`, prjId)
    } catch {}
  }, [loadList, prjId, areaId])

  const loadDet = useCallback(async () => {
    if (!mdlId) return setDet(null)
    const j = await (await piFetch(`${base}?mdl=${mdlId}`)).json()
    if (!j.ok) return setMsg(j.message)
    setDet(j)
    setEdit(new Map())
    setTblId((cur) => (j.tables.some((t: Tbl) => t.phy_tbl_id === cur) ? cur : (j.tables[0]?.phy_tbl_id ?? '')))
  }, [base, mdlId])
  useEffect(() => {
    void loadDet()
  }, [loadDet])

  // 관계 없는 엔터티(PHY_NO_REL) = DA·SYS 만 확인 후 예외 전환(마스터 지시 2026-10-20)
  const convert = async (noRelExc = false) => {
    if (!dbms) return
    setBusy(true)
    setMsg('')
    const r = await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dbms_cd: dbms, ent_ids: [...picked], ...(ltr ? { idntfr_ltr_cd: ltr } : {}), ...(noRelExc ? { no_rel_exc: true } : {}) }) })
    const j = await r.json()
    setBusy(false)
    if (!j.ok && j.code === 'PHY_NO_REL' && j.exc && !noRelExc && confirm(`관계가 없는 엔터티가 있습니다\n${(j.why ?? []).join('\n')}\n\nDA 예외로 그대로 전환하시겠습니까?(감사 이력에 남습니다)`)) return convert(true)
    if (!j.ok) return setMsg([j.message, ...(j.why ?? []), ...(j.issues ?? [])].join(' / '))
    setMsg(`물리 모델을 만들었습니다 — 테이블 ${j.tbl_cnt}·FK ${j.fk_cnt}${j.fk_sync ? ` · 기존 자식 테이블 동기화 ${j.fk_sync}건(FK 칼럼 포함)` : ''}`)
    setMdlId(j.item.phy_mdl_id)
    setPicked(new Set())
    await loadList()
    setStageRev((v) => v + 1)
  }
  const remove = async () => {
    if (!det || !window.confirm(`${dbmsNm(det.mdl.dbms_cd)} 물리 모델을 삭제할까요? 칼럼 그리드에서 바꾼 순서·NULL·기본값도 함께 삭제됩니다(다시 전환하면 논리 모델 기준으로 새로 만듭니다).`)) return
    const j = await (await piFetch(`${base}?mdl=${det.mdl.phy_mdl_id}&ver_no=${det.mdl.ver_no}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message)
    setMsg('삭제했습니다')
    setMdlId('')
    await loadList()
    setStageRev((v) => v + 1)
  }
  const down = async (q: string, fallback: string) => {
    const r = await piFetch(`${base}?mdl=${mdlId}&${q}`)
    if (!r.ok) return setMsg('파일을 만들지 못했습니다')
    const cd = decodeURIComponent((r.headers.get('content-disposition') ?? '').split("UTF-8''")[1] ?? '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await r.blob())
    a.download = cd || fallback
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // 일부 WebView 는 즉시 해제 시 내려받기 취소
  }

  const subjTbls = useMemo(() => (det?.tables ?? []).filter((t) => entSubj.get(t.ent_id) === subjId), [det, entSubj, subjId])
  const tbl = subjTbls.find((t) => t.phy_tbl_id === tblId) ?? subjTbls[0]
  const rows = useMemo(() => (tbl ? tbl.cols.map((c) => ({ ...c, ...edit.get(c.phy_col_id) })).sort((a, b) => a.col_seq - b.col_seq) : []), [tbl, edit])
  const put = (id: string, v: Partial<Col>) => setEdit((m) => new Map(m).set(id, { ...m.get(id), ...v }))
  const move = (i: number, d: -1 | 1) => {
    const a = rows[i], b = rows[i + d]
    if (!b || a.sys_col_yn === 'Y' || b.sys_col_yn === 'Y') return
    put(a.phy_col_id, { col_seq: b.col_seq })
    put(b.phy_col_id, { col_seq: a.col_seq })
  }
  // 단일 PK 자동 증가(테이블별) 저장 — 대상 아님·작성완료 잠금은 서버가 거부
  const setAutoInc = async (on: boolean) => {
    if (!tbl || !det) return
    setBusy(true)
    const j = await (await piFetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phy_mdl_id: det.mdl.phy_mdl_id, phy_tbl_id: tbl.phy_tbl_id, auto_inc_yn: on ? 'Y' : 'N' }) })).json()
    setBusy(false)
    setMsg(j.ok ? `${tbl.tbl_nm} 단일 PK 자동 증가 ${on ? '지정' : '해제'}` : (j.message ?? ''))
    await loadDet()
  }
  const save = async () => {
    if (!tbl || !det) return
    const cols = [...edit.entries()].map(([id, v]) => {
      const o = tbl.cols.find((c) => c.phy_col_id === id)!
      return { phy_col_id: id, ver_no: o.ver_no, ...(v.col_seq !== undefined && v.col_seq !== o.col_seq ? { col_seq: v.col_seq } : {}), ...(v.null_yn !== undefined && v.null_yn !== o.null_yn ? { null_yn: v.null_yn } : {}), ...(v.bsc_val_txt !== undefined && (v.bsc_val_txt || null) !== o.bsc_val_txt ? { bsc_val_txt: v.bsc_val_txt || null } : {}) }
    }).filter((c) => Object.keys(c).length > 2)
    if (!cols.length) return setMsg('바뀐 내용이 없습니다')
    setBusy(true)
    const j = await (await piFetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phy_mdl_id: det.mdl.phy_mdl_id, phy_tbl_id: tbl.phy_tbl_id, cols }) })).json()
    setBusy(false)
    if (!j.ok && j.code !== 'VERSION_CONFLICT') return setMsg(j.message) // 검증 실패는 편집값을 남겨 고칠 수 있게
    setMsg(j.ok ? `${tbl.tbl_nm} 칼럼 ${j.updated}개를 저장했습니다` : `${j.message}(최신 값을 다시 불러왔습니다)`)
    await loadDet()
  }
  // 인덱스 추가 폼 — 고른 칼럼 순서 = 인덱스 칼럼 순서, 테이블이 바뀌면 초기화
  const [idxCols, setIdxCols] = useState<string[]>([])
  const [idxUnq, setIdxUnq] = useState(false)
  useEffect(() => {
    setIdxCols([])
    setIdxUnq(false)
  }, [tbl?.phy_tbl_id])
  const addIdx = async () => {
    if (!tbl || !det || !idxCols.length) return
    setBusy(true)
    const j = await (await piFetch(`${base}/idx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phy_mdl_id: det.mdl.phy_mdl_id, phy_tbl_id: tbl.phy_tbl_id, col_ids: idxCols, unq_yn: idxUnq ? 'Y' : 'N' }) })).json()
    setBusy(false)
    setMsg(j.ok ? `인덱스 ${j.item.idx_nm} 를 추가했습니다` : j.message)
    if (!j.ok) return
    setIdxCols([])
    setIdxUnq(false)
    await loadDet()
  }
  const delIdx = async (x: Idx) => {
    if (!window.confirm(`인덱스 ${x.idx_nm} 를 삭제할까요?`)) return
    setBusy(true)
    const j = await (await piFetch(`${base}/idx?idx=${x.phy_idx_id}&ver_no=${x.ver_no}`, { method: 'DELETE' })).json()
    setBusy(false)
    setMsg(j.ok ? `인덱스 ${x.idx_nm} 를 삭제했습니다` : j.message)
    await loadDet()
  }
  const diffN = det?.diff ? Object.values(det.diff).reduce((n, v) => n + v.length, 0) : 0
  const sync = async () => {
    if (!det || !window.confirm('논리 모델의 변경(추가·삭제·이름·타입·주키)을 이 물리 모델에 반영합니다. 칼럼 순서·NULL·기본값 편집은 유지됩니다. 먼저 변경분 DDL 을 내려받아 두기를 권합니다. 계속할까요?')) return
    setBusy(true)
    const j = await (await piFetch(`${base}?sync=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phy_mdl_id: det.mdl.phy_mdl_id, ver_no: det.mdl.ver_no }) })).json()
    setBusy(false)
    setMsg(j.ok ? `동기화했습니다 — 변경 ${j.ops}건, FK 추가 ${j.addFk}·삭제 ${j.delFk}` : [j.message, ...(j.why ?? []), ...(j.issues ?? [])].join(' / '))
    await loadList()
    setStageRev((v) => v + 1)
    await loadDet()
  }
  const canConvert = editor && picked.size > 0 && !!pv && !pv.why.length && !pv.issues.length

  return (
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="물리 모델" info="논리 모델 점검을 통과한 프로젝트를 DBMS별 물리 모델(테이블·칼럼·FK)로 전환하고, 칼럼 순서·NULL·기본값을 다듬은 뒤 DDL을 내려받습니다(DB에 직접 실행하지 않음)." />

      <section className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm" aria-label="전환 설정">
        <span className="text-xs font-medium text-ink-3">프로젝트</span>
        <select value={prjId} onChange={(e) => (setPrjId(e.target.value), setMdlId(''), setDbms(''))} className="input-sm w-auto max-w-60" aria-label="프로젝트 선택">
          {prjs.length === 0 && <option value="">프로젝트 없음(개념 모델에서 등록)</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <span className="text-xs font-medium text-ink-3">DBMS</span>
        <select value={dbms} onChange={(e) => setDbms(e.target.value as DbmsCd)} className="input-sm w-auto" aria-label="DBMS 선택">
          {DBMS.map((d) => (
            <option key={d.cd} value={d.cd}>
              {d.nm}
            </option>
          ))}
        </select>
        <select value={dbms === '0014' ? 'LOWER' : ltr} disabled={dbms === '0014'} title={dbms === '0014' ? 'PostgreSQL DDL 은 항상 소문자(테이블·칼럼·PK·인덱스) — 물리 모델 이름은 대문자 그대로' : 'DDL 식별자 대소문자'} onChange={(e) => setLtr(e.target.value as '' | 'UPPER' | 'LOWER')} className="input-sm w-auto disabled:text-ink-3" aria-label="식별자 대소문자">
          <option value="">대소문자 : DBMS 기본</option>
          <option value="UPPER">대문자</option>
          <option value="LOWER">소문자</option>
        </select>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <span className="text-xs font-medium text-ink-3">주제영역</span>
        <select value={subjId} onChange={(e) => (setSubjId(e.target.value), setEdit(new Map()))} className="input-sm w-auto max-w-60" aria-label="주제영역 선택">
          {subjs.length === 0 && <option value="">주제영역 없음</option>}
          {subjs.map((x) => (
            <option key={x.subj_id} value={x.subj_id}>
              {x.subj_nm}
            </option>
          ))}
        </select>
        <button type="button" disabled={!canConvert || busy} onClick={() => void convert()} className="btn-3d btn-sm ms-auto">
          물리 모델로 전환
        </button>
      </section>

      {prjId && dbms && <StageBar api={api} prjId={prjId} editor={editor} mode="PHY" dbms={dbms} picked={picked} onPick={setPicked} subjId={subjId} rev={stageRev} onChanged={() => void loadDet()} onLoad={onStage} />}
      {pv && (
        <section className="panel mt-3 px-4 py-3 text-sm" aria-label="전환 미리보기">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-ink">미리보기</span>
            <span className="text-ink-2">
              {dbmsNm(pv.dbms_cd)}
              {picked.size ? ` · 선택 엔터티 ${picked.size}` : ' · 전환 가능(작성완료·미전환) 엔터티 전체'}
            </span>
            <span className="font-mono text-xs text-ink-3 tabular-nums">
              테이블 {pv.tbl_cnt} · 칼럼 {pv.col_cnt} · FK {pv.fk_cnt}
            </span>
            {!picked.size && (
              <span className="badge" data-tone="warn">
                전환할 엔터티 선택 필요
              </span>
            )}
          </p>
          {pv.why.length > 0 && (
            <ul className="mt-2 list-disc ps-5 text-danger">
              {pv.why.map((w) => (
                <li key={w}>
                  {w} ·{' '}
                  <Link href={`/areas/${areaId}/logical`} className="text-accent-ink hover:underline">
                    논리 모델에서 고치기
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pv.issues.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc overflow-auto ps-5 text-danger">
              {pv.issues.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {!pv.why.length && !pv.issues.length && (
            <p className="mt-1 flex items-center gap-1 text-dense text-ok">
              <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              전환 가능
            </p>
          )}
        </section>
      )}
      {/* 이미 전환된 엔터티의 논리 변경(속성·FK 추가 등)은 전환이 아니라 동기화로 반영 — 위에서 바로 보이게(2026-10-20 마스터 "추가했는데 반영이 안 돼") */}
      {diffN > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-control bg-warn-soft px-3 py-2 text-dense text-warn">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          반영 안 된 논리 변경 {diffN}건 · 동기화로 반영
          {editor && (
            <button type="button" className="btn-key btn-sm ms-auto" disabled={busy} onClick={() => void sync()}>
              <RefreshCw aria-hidden />
              동기화
            </button>
          )}
        </p>
      )}
      {msg && (
        <p role="status" className="mt-2 text-dense text-ink">
          {msg}
        </p>
      )}

      {models.length > 0 && (
        <nav className="seg mt-6" aria-label="물리 모델 목록">
          {models.map((m) => (
            <button key={m.phy_mdl_id} type="button" onClick={() => setMdlId(m.phy_mdl_id)} aria-pressed={m.phy_mdl_id === mdlId} className="seg-item">
              {dbmsNm(m.dbms_cd)} · {m.dbms_cd === '0014' || m.idntfr_ltr_cd === 'LOWER' ? 'DDL 소문자' : 'DDL 대문자'}
            </button>
          ))}
        </nav>
      )}

      {det && (
        <>
          <section className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="물리 모델 작업">
            <button type="button" className={btn} onClick={() => void down('format=ddl', 'ddl.sql')}>
              <Download aria-hidden />
              DDL
            </button>
            <button type="button" className={btn} onClick={() => void down('format=csv&type=tbl', '테이블정의서.csv')}>
              <Download aria-hidden />
              테이블정의서
            </button>
            <button type="button" className={btn} onClick={() => void down('format=csv&type=col', '칼럼정의서.csv')}>
              <Download aria-hidden />
              칼럼정의서
            </button>
            {editor && (
              <button type="button" className="btn-danger btn-sm ms-auto" onClick={() => void remove()}>
                <Trash2 aria-hidden />
                물리 모델 삭제
              </button>
            )}
          </section>
          {det.diff && (
            <details className="panel mt-3 px-4 py-2 text-sm" open={diffN > 0}>
              <summary className={`cursor-pointer py-1 font-medium ${diffN ? 'text-warn' : 'text-ok'}`}>{diffN ? `논리 모델과 차이 ${diffN}건(도메인 영향 ${det.diff.dom_chg.length})` : '논리 모델과 차이 없음'}</summary>
              {diffN > 0 && (
                <p className="my-2 flex flex-wrap gap-2">
                  <button type="button" className={btn} onClick={() => void down('format=alter', '변경분DDL.sql')}>
                    <Download aria-hidden />
                    변경분 DDL(ALTER)
                  </button>
                  {editor && (
                    <button type="button" className={btn} disabled={busy} onClick={() => void sync()}>
                      <RefreshCw aria-hidden />
                      동기화
                    </button>
                  )}
                </p>
              )}
              <div className="space-y-1 pb-1 text-dense">
                {(Object.keys(DIFF_NM) as (keyof Diff)[])
                  .filter((k) => det.diff![k].length)
                  .map((k) => (
                    <p key={k} className={k === 'dom_chg' ? 'text-danger' : 'text-ink-2'}>
                      <span className="font-medium text-ink">{DIFF_NM[k]}</span> : {det.diff![k].join(', ')}
                    </p>
                  ))}
              </div>
            </details>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
            <ul className="panel max-h-[32rem] overflow-auto p-1 text-sm" aria-label="테이블 목록">
              {subjTbls.length === 0 && (
                <li className="empty">
                  <Icon3D icon={MENU_ICON.physical} />
                  전환된 테이블 없음
                </li>
              )}
              {subjTbls.map((t) => (
                <li key={t.phy_tbl_id}>
                  <button type="button" onClick={() => (setTblId(t.phy_tbl_id), setEdit(new Map()))} aria-current={t.phy_tbl_id === tbl?.phy_tbl_id} className={`flex w-full items-center gap-2 rounded-control px-3 py-1.5 text-start font-mono text-dense transition-colors ${t.phy_tbl_id === tbl?.phy_tbl_id ? 'bg-accent-soft font-medium text-accent-ink' : 'hover:bg-raised'}`}>
                    <span className="min-w-0 flex-1 truncate">{t.tbl_nm}</span>
                    <span className="text-xs text-ink-3 tabular-nums">{t.cols.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            {tbl && (
              <section className="min-w-0" aria-label={`${tbl.tbl_nm} 칼럼`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="chip-phy" data-size="lg">
                    {tbl.tbl_nm}
                  </h2>
                  <span className="text-dense text-ink-2">{tbl.tbl_desc}</span>
                  {(() => {
                    // 단일 PK 자동 증가(테이블별 옵션) — 화면은 단일·정수만 판정, 관계 상속 칼럼은 저장 때 서버가 거부
                    const pk = tbl.cols.filter((c) => c.pk_yn === 'Y')
                    const why = pk.length !== 1 ? (pk.length ? '복합 PK' : 'PK 없음') : !/^(NUMBER|NUMERIC|DECIMAL|INT|INTEGER|BIGINT|SMALLINT)$/i.test(pk[0].phy_tp_nm) ? '정수형 PK 아님' : pk[0].data_scale ? '소수점 있는 PK' : tbl.phy_sts_cd === 'CMPTN' ? '작성완료(완료 취소 후 변경)' : ''
                    const on = tbl.auto_inc_yn === 'Y'
                    return (
                      <label className={`inline-flex items-center gap-2 rounded-control border px-2 py-1 text-dense transition-colors ${on ? 'border-accent-ink/40 bg-accent-soft text-accent-ink' : 'border-line'}`} title={why ? `자동 증가 불가 : ${why}` : `단일 PK ${pk[0]?.col_nm ?? ''} 를 자동 증가로 DDL 생성 — ${DBMS_PRFL[det.mdl.dbms_cd as DbmsCd]?.autoInc ?? ''}`}>
                        <input type="checkbox" disabled={!editor || busy || (!!why && !on)} checked={on} onChange={(e) => void setAutoInc(e.target.checked)} /> 단일 PK 자동 증가
                        {why && <span className="text-xs text-ink-3">({why})</span>}
                      </label>
                    )
                  })()}
                  {editor && (
                    <span className="ms-auto flex gap-2">
                      <button type="button" className={btn} disabled={!edit.size || busy} onClick={() => setEdit(new Map())}>
                        <Undo2 aria-hidden />
                        되돌리기
                      </button>
                      <button type="button" className="btn-3d btn-sm" disabled={!edit.size || busy} onClick={() => void save()}>
                        저장
                      </button>
                    </span>
                  )}
                </div>
                <div className="mt-2 overflow-x-auto rounded-card border border-line bg-surface">
                  <table className="w-full border-collapse text-dense">
                    <thead>
                      <tr className="thead-3d text-start">
                        {['순서', '칼럼명', '타입', 'PK', 'NULL', '기본값', ''].map((h) => (
                          <th key={h} className="px-3 py-2 text-start">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c, i) => {
                        const sys = c.sys_col_yn === 'Y'
                        const dirty = edit.has(c.phy_col_id)
                        return (
                          <tr key={c.phy_col_id} data-mode={dirty && !sys ? 'edit' : undefined} className={sys ? 'bg-well text-ink-3' : ''}>
                            <td className={`${TDP} text-right font-mono text-xs text-ink-3 tabular-nums`}>{c.col_seq}</td>
                            <td className={TDP}>
                              <span className="chip-phy">{c.col_nm}</span>
                              {sys && <span className="badge ms-1">시스템</span>}
                            </td>
                            <td className={`${TDP} font-mono text-xs`}>{tpOf(c)}</td>
                            <td className={TDP}>
                              {c.pk_yn === 'Y' && (
                                <span className="inline-flex items-center gap-1 text-ink-2 tabular-nums">
                                  <KeyRound className="h-3.5 w-3.5 text-warn" aria-label="PK" />
                                  {c.pk_seq}
                                </span>
                              )}
                            </td>
                            <td className={TDP}>
                              <input type="checkbox" checked={c.null_yn === 'Y'} disabled={!editor || sys || c.pk_yn === 'Y'} onChange={(e) => put(c.phy_col_id, { null_yn: e.target.checked ? 'Y' : 'N' })} aria-label={`${c.col_nm} NULL 허용`} />
                            </td>
                            <td className={TDP}>
                              <input value={c.bsc_val_txt ?? ''} disabled={!editor || sys} onChange={(e) => put(c.phy_col_id, { bsc_val_txt: e.target.value })} placeholder="기본값" title="예 : 0 · 'N' · CURRENT_TIMESTAMP" maxLength={200} className="input-sm w-48 font-mono text-xs disabled:border-transparent disabled:bg-transparent" aria-label={`${c.col_nm} 기본값`} />
                            </td>
                            <td className={`${TDP} whitespace-nowrap`}>
                              {editor && !sys && (
                                <span className="inline-flex gap-0.5">
                                  <button type="button" className="btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${c.col_nm} 위로`} title="위로">
                                    <ChevronUp aria-hidden />
                                  </button>
                                  <button type="button" className="btn-ghost btn-icon btn-sm" disabled={rows[i + 1]?.sys_col_yn !== 'N'} onClick={() => move(i, 1)} aria-label={`${c.col_nm} 아래로`} title="아래로">
                                    <ChevronDown aria-hidden />
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <p className="hint mt-0">시스템 칼럼 4개는 DDL 때만 맨 끝에 추가</p>
                  <InfoTip>시스템 칼럼(최종수정일시·최종수정자ID·최종등록일시·최종등록자ID)은 모델에 두지 않고 DDL 내려받기 때만 테이블 맨 끝에 자동으로 붙습니다. 기본값은 숫자·작은따옴표 문자열·CURRENT_TIMESTAMP 같은 키워드만 허용합니다.</InfoTip>
                </div>
                <section className="panel mt-4 text-sm" aria-label={`${tbl.tbl_nm} 인덱스`}>
                  <h3 className="panel-head">인덱스</h3>
                  <div className="px-4 py-3">
                    {(tbl.indexes ?? []).length === 0 ? (
                      <p className="text-ink-3">PK 외 인덱스 없음</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {(tbl.indexes ?? []).map((x) => (
                          <li key={x.phy_idx_id} className={`flex flex-wrap items-center gap-2 py-1.5 ${x.invalid ? 'text-danger' : ''}`}>
                            <span className="chip-phy">{x.idx_nm}</span>
                            {x.unq_yn === 'Y' && (
                              <span className="badge" data-tone="accent">
                                유일
                              </span>
                            )}
                            <span className="font-mono text-xs text-ink-2">({x.col_nms.join(', ')})</span>
                            {x.invalid && (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <TriangleAlert className="h-3.5 w-3.5 text-warn" aria-hidden />
                                {x.why ?? '삭제된 칼럼 참조'} · DDL 에서 생략, 삭제 후 다시 생성
                              </span>
                            )}
                            {editor && tbl.phy_sts_cd !== 'CMPTN' && (
                              <button type="button" className="btn-ghost btn-icon btn-sm ms-auto hover:text-danger" disabled={busy} onClick={() => void delIdx(x)} aria-label={`${x.idx_nm} 삭제`} title="삭제">
                                <Trash2 aria-hidden />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {tbl.phy_sts_cd === 'CMPTN' ? (
                      <p className="hint mt-2 flex items-center gap-1">
                        <Lock className="h-3 w-3 text-tone-std" aria-hidden />
                        작성완료 테이블 · 완료 취소 후 편집
                      </p>
                    ) : (
                      editor && (
                        <div className="mt-3 border-t border-line pt-3">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium text-ink-2">인덱스 칼럼</p>
                            <InfoTip>칼럼을 누른 순서가 인덱스 칼럼 순서입니다(최대 16개, 다시 누르면 빠짐). 이름은 X_테이블명_번호로 자동 생성됩니다.</InfoTip>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {rows.map((c) => {
                              const i = idxCols.indexOf(c.phy_col_id)
                              return (
                                <button key={c.phy_col_id} type="button" aria-pressed={i >= 0} disabled={i < 0 && idxCols.length >= 16} onClick={() => setIdxCols((a) => (i >= 0 ? a.filter((id) => id !== c.phy_col_id) : [...a, c.phy_col_id]))} className="btn-key btn-sm font-mono text-xs">
                                  {i >= 0 && <span className="tabular-nums">{i + 1}.</span>}
                                  {c.col_nm}
                                </button>
                              )
                            })}
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <label className="inline-flex items-center gap-2">
                              <input type="checkbox" checked={idxUnq} onChange={(e) => setIdxUnq(e.target.checked)} /> 유일(UNIQUE)
                            </label>
                            <button type="button" className={btn} disabled={!idxCols.length || busy} onClick={() => void addIdx()}>
                              <Plus aria-hidden />
                              인덱스 추가
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  )
}

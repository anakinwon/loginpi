'use client'
import { piFetch } from '@pi/auth/client'
// 물리 모델 화면(PRD_PiErd S2 P1·P5·P6) — 논리 모델 → 물리 전환과 칼럼 그리드 편집, DDL·물리 정의서 내려받기
//  상단 : 프로젝트·DBMS·대소문자·삭제 칼럼 선택 → 전환 미리보기(관문 사유·변환 이슈·테이블/칼럼/FK 수) → 전환
//  아래 : 물리 모델(DBMS별) 선택 → 논리와의 차이(도메인 영향 포함)·DDL·정의서 / 왼쪽 테이블 목록 · 오른쪽 칼럼 그리드(순서·NULL·기본값, 저장 = 테이블 단위 묶음)
//  엔터티 선택 전환(마스터 지시 2026-10-17) : 작성완료 엔터티만 골라 전환, 테이블 작성완료 → ERD
//  주제영역 콤보(논리 화면과 선택 공유) : 테이블 목록·단계 패널을 선택한 주제영역 1개로 한정
//  논리 변경 반영(S5) = 동기화(순서·NULL·기본값 편집 유지) + 변경분 DDL(ALTER) 내려받기. 삭제 후 재전환도 가능(편집값 사라짐)
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { DBMS_PRFL, dbmsList, type DbmsCd } from '@/lib/modelpi/dbms'
import { type MbrRole, type Perm } from '@/lib/roles'
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
type Diff = Record<'add_tbl' | 'del_tbl' | 'chg_tbl' | 'add_col' | 'del_col' | 'chg_col' | 'dom_chg', string[]>
const DIFF_NM: Record<keyof Diff, string> = { add_tbl: '추가 테이블', del_tbl: '삭제 테이블', chg_tbl: '테이블명 변경', add_col: '추가 칼럼', del_col: '삭제 칼럼', chg_col: '변경 칼럼', dom_chg: '도메인 변경 영향' }
const DBMS = dbmsList()
const dbmsNm = (cd: string) => DBMS.find((d) => d.cd === cd)?.nm ?? cd
const tpOf = (c: Col) => (c.data_len != null ? `${c.phy_tp_nm}(${c.data_len}${c.data_scale != null ? `,${c.data_scale}` : ''})` : c.phy_tp_nm)
const btn = 'rounded border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-40'

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
    setMsg(`물리 모델을 만들었습니다 — 테이블 ${j.tbl_cnt}·FK ${j.fk_cnt}`)
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
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">물리 모델</h1>
      <p className="mt-1 text-sm text-gray-600">논리 모델 점검을 통과한 프로젝트를 DBMS별 물리 모델(테이블·칼럼·FK)로 전환하고, 칼럼 순서·NULL·기본값을 다듬은 뒤 DDL을 내려받습니다(DB에 직접 실행하지 않음).</p>

      <section className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-3 text-sm text-white shadow-md" aria-label="전환 설정">
        <span className="font-semibold">프로젝트</span>
        <select value={prjId} onChange={(e) => (setPrjId(e.target.value), setMdlId(''), setDbms(''))} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="프로젝트 선택">
          {prjs.length === 0 && <option value="">프로젝트가 없습니다(개념 모델에서 등록)</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        <span className="font-semibold">DBMS</span>
        <select value={dbms} onChange={(e) => setDbms(e.target.value as DbmsCd)} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="DBMS 선택">
          {DBMS.map((d) => (
            <option key={d.cd} value={d.cd}>
              {d.nm}
            </option>
          ))}
        </select>
        <select value={dbms === '0014' ? 'LOWER' : ltr} disabled={dbms === '0014'} title={dbms === '0014' ? 'PostgreSQL DDL 은 항상 소문자(테이블·칼럼·PK·인덱스) — 물리 모델 이름은 대문자 그대로' : 'DDL 식별자 대소문자'} onChange={(e) => setLtr(e.target.value as '' | 'UPPER' | 'LOWER')} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900 disabled:opacity-70" aria-label="식별자 대소문자">
          <option value="">대소문자 : DBMS 기본</option>
          <option value="UPPER">대문자</option>
          <option value="LOWER">소문자</option>
        </select>
        <span className="font-semibold">주제영역</span>
        <select value={subjId} onChange={(e) => (setSubjId(e.target.value), setEdit(new Map()))} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="주제영역 선택">
          {subjs.length === 0 && <option value="">주제영역이 없습니다</option>}
          {subjs.map((x) => (
            <option key={x.subj_id} value={x.subj_id}>
              {x.subj_nm}
            </option>
          ))}
        </select>
        <button type="button" disabled={!canConvert || busy} onClick={() => void convert()} className="ml-auto rounded bg-white px-3 py-1 font-semibold text-[#1f3a68] disabled:opacity-40">
          물리 모델로 전환
        </button>
      </section>

      {prjId && dbms && <StageBar api={api} prjId={prjId} editor={editor} mode="PHY" dbms={dbms} picked={picked} onPick={setPicked} subjId={subjId} rev={stageRev} onChanged={() => void loadDet()} onLoad={onStage} />}
      {pv && (
        <section className="mt-3 rounded border p-3 text-sm" aria-label="전환 미리보기">
          <p>
            미리보기({dbmsNm(pv.dbms_cd)}{picked.size ? ` · 선택 엔터티 ${picked.size}` : ' · 전환 가능(작성완료·미전환) 엔터티 전체'}) : 테이블 {pv.tbl_cnt} · 칼럼 {pv.col_cnt} · FK {pv.fk_cnt}
            {!picked.size && <span className="ml-2 text-amber-700">아래에서 전환할 엔터티(작성완료)를 고르십시오</span>}
          </p>
          {pv.why.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-red-700">
              {pv.why.map((w) => (
                <li key={w}>
                  {w} — <Link href={`/areas/${areaId}/logical`} className="underline">논리 모델에서 고치기</Link>
                </li>
              ))}
            </ul>
          )}
          {pv.issues.length > 0 && (
            <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-red-700">
              {pv.issues.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {!pv.why.length && !pv.issues.length && <p className="mt-1 text-green-700">전환할 수 있습니다</p>}
        </section>
      )}
      {/* 이미 전환된 엔터티의 논리 변경(속성·FK 추가 등)은 전환이 아니라 동기화로 반영 — 위에서 바로 보이게(2026-10-20 마스터 "추가했는데 반영이 안 돼") */}
      {diffN > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          이미 전환된 테이블에 반영되지 않은 논리 변경 {diffN}건이 있습니다 — 전환이 아니라 동기화로 반영합니다
          {editor && (
            <button type="button" className={`${btn} bg-[#1f3a68] text-white`} disabled={busy} onClick={() => void sync()}>
              논리 변경 반영(동기화)
            </button>
          )}
        </p>
      )}
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}

      {models.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="물리 모델 목록">
          {models.map((m) => (
            <button key={m.phy_mdl_id} type="button" onClick={() => setMdlId(m.phy_mdl_id)} aria-pressed={m.phy_mdl_id === mdlId} className={`rounded-full border px-3 py-1 text-sm ${m.phy_mdl_id === mdlId ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : ''}`}>
              {dbmsNm(m.dbms_cd)} · {m.dbms_cd === '0014' || m.idntfr_ltr_cd === 'LOWER' ? 'DDL 소문자' : 'DDL 대문자'}
            </button>
          ))}
        </nav>
      )}

      {det && (
        <>
          <section className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="물리 모델 작업">
            <button type="button" className={btn} onClick={() => void down('format=ddl', 'ddl.sql')}>
              DDL 내려받기(.sql)
            </button>
            <button type="button" className={btn} onClick={() => void down('format=csv&type=tbl', '테이블정의서.csv')}>
              테이블정의서
            </button>
            <button type="button" className={btn} onClick={() => void down('format=csv&type=col', '칼럼정의서.csv')}>
              칼럼정의서
            </button>
            {editor && (
              <button type="button" className={`${btn} ml-auto text-red-700`} onClick={() => void remove()}>
                물리 모델 삭제
              </button>
            )}
          </section>
          {det.diff && (
            <details className="mt-2 rounded border p-2 text-sm" open={diffN > 0}>
              <summary className={diffN ? 'font-semibold text-amber-700' : 'text-green-700'}>{diffN ? `논리 모델과 차이 ${diffN}건(도메인 영향 ${det.diff.dom_chg.length})` : '논리 모델과 차이 없음'}</summary>
              {diffN > 0 && (
                <p className="my-1 flex flex-wrap gap-2">
                  <button type="button" className={btn} onClick={() => void down('format=alter', '변경분DDL.sql')}>
                    변경분 DDL(ALTER) 내려받기
                  </button>
                  {editor && (
                    <button type="button" className={`${btn} bg-[#1f3a68] text-white`} disabled={busy} onClick={() => void sync()}>
                      논리 변경 반영(동기화)
                    </button>
                  )}
                </p>
              )}
              {(Object.keys(DIFF_NM) as (keyof Diff)[])
                .filter((k) => det.diff![k].length)
                .map((k) => (
                  <p key={k} className={k === 'dom_chg' ? 'text-red-700' : ''}>
                    <b>{DIFF_NM[k]}</b> : {det.diff![k].join(', ')}
                  </p>
                ))}
            </details>
          )}

          <div className="mt-3 grid gap-4 md:grid-cols-[16rem_1fr]">
            <ul className="max-h-[32rem] overflow-auto rounded border text-sm" aria-label="테이블 목록">
              {subjTbls.length === 0 && <li className="px-3 py-2 text-gray-500">이 주제영역에 전환된 테이블이 없습니다</li>}
              {subjTbls.map((t) => (
                <li key={t.phy_tbl_id}>
                  <button type="button" onClick={() => (setTblId(t.phy_tbl_id), setEdit(new Map()))} aria-current={t.phy_tbl_id === tbl?.phy_tbl_id} className={`w-full px-3 py-2 text-left font-mono ${t.phy_tbl_id === tbl?.phy_tbl_id ? 'bg-[#e9eff9] font-semibold' : 'hover:bg-gray-50'}`}>
                    {t.tbl_nm}
                    <span className="ml-1 text-xs text-gray-500">({t.cols.length})</span>
                  </button>
                </li>
              ))}
            </ul>
            {tbl && (
              <section aria-label={`${tbl.tbl_nm} 칼럼`}>
                <div className="flex items-center gap-2">
                  <h2 className="font-mono font-semibold text-[#1f3a68]">{tbl.tbl_nm}</h2>
                  <span className="text-sm text-gray-600">{tbl.tbl_desc}</span>
                  {(() => {
                    // 단일 PK 자동 증가(테이블별 옵션) — 화면은 단일·정수만 판정, 관계 상속 칼럼은 저장 때 서버가 거부
                    const pk = tbl.cols.filter((c) => c.pk_yn === 'Y')
                    const why = pk.length !== 1 ? (pk.length ? '복합 PK' : 'PK 없음') : !/^(NUMBER|NUMERIC|DECIMAL|INT|INTEGER|BIGINT|SMALLINT)$/i.test(pk[0].phy_tp_nm) ? '정수형 PK 아님' : pk[0].data_scale ? '소수점 있는 PK' : tbl.phy_sts_cd === 'CMPTN' ? '작성완료(완료 취소 후 변경)' : ''
                    const on = tbl.auto_inc_yn === 'Y'
                    return (
                      <label className={`flex items-center gap-1 rounded border px-2 py-0.5 text-sm ${on ? 'border-[#3b5f9e] bg-[#e9eff9]' : ''}`} title={why ? `자동 증가 불가 : ${why}` : `단일 PK ${pk[0]?.col_nm ?? ''} 를 자동 증가로 DDL 생성 — ${DBMS_PRFL[det.mdl.dbms_cd as DbmsCd]?.autoInc ?? ''}`}>
                        <input type="checkbox" disabled={!editor || busy || (!!why && !on)} checked={on} onChange={(e) => void setAutoInc(e.target.checked)} /> 단일 PK 자동 증가
                        {why && <span className="text-xs text-gray-500">({why})</span>}
                      </label>
                    )
                  })()}
                  {editor && (
                    <span className="ml-auto flex gap-2">
                      <button type="button" className={btn} disabled={!edit.size || busy} onClick={() => setEdit(new Map())}>
                        되돌리기
                      </button>
                      <button type="button" className={`${btn} bg-[#1f3a68] text-white`} disabled={!edit.size || busy} onClick={() => void save()}>
                        저장
                      </button>
                    </span>
                  )}
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-[#e9eff9]">
                      <tr>
                        {['순서', '칼럼명', '타입', 'PK', 'NULL', '기본값', ''].map((h) => (
                          <th key={h} className="border px-2 py-1 text-left">
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
                          <tr key={c.phy_col_id} className={sys ? 'bg-gray-50 text-gray-500' : dirty ? 'bg-amber-50' : ''}>
                            <td className="border px-2 py-1">{c.col_seq}</td>
                            <td className="border px-2 py-1 font-mono">
                              {c.col_nm}
                              {sys && <span className="ml-1 rounded bg-gray-200 px-1 text-xs">시스템</span>}
                            </td>
                            <td className="border px-2 py-1 font-mono">{tpOf(c)}</td>
                            <td className="border px-2 py-1">{c.pk_yn === 'Y' ? `🔑${c.pk_seq}` : ''}</td>
                            <td className="border px-2 py-1">
                              <input type="checkbox" checked={c.null_yn === 'Y'} disabled={!editor || sys || c.pk_yn === 'Y'} onChange={(e) => put(c.phy_col_id, { null_yn: e.target.checked ? 'Y' : 'N' })} aria-label={`${c.col_nm} NULL 허용`} />
                            </td>
                            <td className="border px-2 py-1">
                              <input value={c.bsc_val_txt ?? ''} disabled={!editor || sys} onChange={(e) => put(c.phy_col_id, { bsc_val_txt: e.target.value })} placeholder="예 : 0 · 'N' · CURRENT_TIMESTAMP" maxLength={200} className="w-48 rounded border px-1 font-mono text-xs disabled:bg-transparent" aria-label={`${c.col_nm} 기본값`} />
                            </td>
                            <td className="border px-2 py-1 whitespace-nowrap">
                              {editor && !sys && (
                                <>
                                  <button type="button" className="px-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${c.col_nm} 위로`}>
                                    ▲
                                  </button>
                                  <button type="button" className="px-1" disabled={rows[i + 1]?.sys_col_yn !== 'N'} onClick={() => move(i, 1)} aria-label={`${c.col_nm} 아래로`}>
                                    ▼
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-gray-500">시스템 칼럼(최종수정일시·최종수정자ID·최종등록일시·최종등록자ID)은 모델에 두지 않고 DDL 내려받기 때만 테이블 맨 끝에 자동으로 붙습니다. 기본값은 숫자·작은따옴표 문자열·CURRENT_TIMESTAMP 같은 키워드만 허용합니다.</p>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  )
}

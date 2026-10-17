'use client'
import { piFetch } from '@pi/auth/client'
// 물리 모델 화면(PRD_PiErd S2 P1·P5·P6) — 논리 모델 → 물리 전환과 칼럼 그리드 편집, DDL·물리 정의서 내려받기
//  상단 : 프로젝트·DBMS·대소문자·삭제 칼럼 선택 → 전환 미리보기(관문 사유·변환 이슈·테이블/칼럼/FK 수) → 전환
//  아래 : 물리 모델(DBMS별) 선택 → 논리와의 차이(도메인 영향 포함)·DDL·정의서 / 왼쪽 테이블 목록 · 오른쪽 칼럼 그리드(순서·NULL·기본값, 저장 = 테이블 단위 묶음)
//  재전환 = 삭제 후 다시 전환(그리드 편집값은 사라짐 — 변경분 반영 전환은 S5)
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { dbmsList, type DbmsCd } from '@/lib/modelpi/dbms'
import { can, type MbrRole } from '@/lib/roles'

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
  tbl_nm: string
  tbl_desc: string | null
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
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [dbms, setDbms] = useState<DbmsCd | ''>('')
  const [ltr, setLtr] = useState<'' | 'UPPER' | 'LOWER'>('')
  const [delCol, setDelCol] = useState(true)
  const [pv, setPv] = useState<Preview | null>(null)
  const [models, setModels] = useState<Mdl[]>([])
  const [mdlId, setMdlId] = useState('')
  const [det, setDet] = useState<{ mdl: Mdl; tables: Tbl[]; diff: Diff | null } | null>(null)
  const [tblId, setTblId] = useState('')
  const [edit, setEdit] = useState<Map<string, Partial<Col>>>(new Map())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const editor = !!role && can(role, 'REQUEST')
  const base = `${api}/projects/${prjId}/physical`

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
          keep = window.localStorage.getItem(`logical-prj-${areaId}`) // 논리 화면과 같은 프로젝트 선택 유지
        } catch {}
        setPrjId(j.items.find((p: { prj_id: string }) => p.prj_id === keep)?.prj_id ?? j.items[0]?.prj_id ?? '')
      })
  }, [api, areaId])

  const loadList = useCallback(async () => {
    if (!prjId) return
    const j = await (await piFetch(`${base}${dbms ? `?dbms=${dbms}` : ''}`)).json()
    if (!j.ok) return setMsg(j.message)
    setPv(j.preview)
    if (!dbms) setDbms(j.preview.dbms_cd)
    setModels(j.models)
    setMdlId((cur) => (j.models.some((m: Mdl) => m.phy_mdl_id === cur) ? cur : (j.models[0]?.phy_mdl_id ?? '')))
  }, [base, prjId, dbms])
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

  const convert = async () => {
    if (!dbms) return
    setBusy(true)
    setMsg('')
    const r = await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dbms_cd: dbms, del_col_use_yn: delCol ? 'Y' : 'N', ...(ltr ? { idntfr_ltr_cd: ltr } : {}) }) })
    const j = await r.json()
    setBusy(false)
    if (!j.ok) return setMsg([j.message, ...(j.why ?? []), ...(j.issues ?? [])].join(' / '))
    setMsg(`물리 모델을 만들었습니다 — 테이블 ${j.tbl_cnt}·FK ${j.fk_cnt}`)
    setMdlId(j.item.phy_mdl_id)
    await loadList()
  }
  const remove = async () => {
    if (!det || !window.confirm(`${dbmsNm(det.mdl.dbms_cd)} 물리 모델을 삭제할까요? 칼럼 그리드에서 바꾼 순서·NULL·기본값도 함께 삭제됩니다(다시 전환하면 논리 모델 기준으로 새로 만듭니다).`)) return
    const j = await (await piFetch(`${base}?mdl=${det.mdl.phy_mdl_id}&ver_no=${det.mdl.ver_no}`, { method: 'DELETE' })).json()
    if (!j.ok) return setMsg(j.message)
    setMsg('삭제했습니다')
    setMdlId('')
    await loadList()
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

  const tbl = det?.tables.find((t) => t.phy_tbl_id === tblId)
  const rows = useMemo(() => (tbl ? tbl.cols.map((c) => ({ ...c, ...edit.get(c.phy_col_id) })).sort((a, b) => a.col_seq - b.col_seq) : []), [tbl, edit])
  const put = (id: string, v: Partial<Col>) => setEdit((m) => new Map(m).set(id, { ...m.get(id), ...v }))
  const move = (i: number, d: -1 | 1) => {
    const a = rows[i], b = rows[i + d]
    if (!b || a.sys_col_yn === 'Y' || b.sys_col_yn === 'Y') return
    put(a.phy_col_id, { col_seq: b.col_seq })
    put(b.phy_col_id, { col_seq: a.col_seq })
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
  const canConvert = editor && !!pv && !pv.why.length && !pv.issues.length && !models.some((m) => m.dbms_cd === dbms)

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
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
        <select value={ltr} onChange={(e) => setLtr(e.target.value as '' | 'UPPER' | 'LOWER')} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="식별자 대소문자">
          <option value="">대소문자 : DBMS 기본</option>
          <option value="UPPER">대문자</option>
          <option value="LOWER">소문자</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={delCol} onChange={(e) => setDelCol(e.target.checked)} /> 삭제여부·삭제일시 칼럼
        </label>
        <button type="button" disabled={!canConvert || busy} onClick={() => void convert()} className="ml-auto rounded bg-white px-3 py-1 font-semibold text-[#1f3a68] disabled:opacity-40">
          물리 모델로 전환
        </button>
      </section>

      {pv && (
        <section className="mt-3 rounded border p-3 text-sm" aria-label="전환 미리보기">
          <p>
            미리보기({dbmsNm(pv.dbms_cd)}) : 테이블 {pv.tbl_cnt} · 칼럼 {pv.col_cnt} · FK {pv.fk_cnt}
            {models.some((m) => m.dbms_cd === dbms) && <span className="ml-2 text-amber-700">이 DBMS 물리 모델이 이미 있습니다(삭제 후 다시 전환)</span>}
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
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}

      {models.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="물리 모델 목록">
          {models.map((m) => (
            <button key={m.phy_mdl_id} type="button" onClick={() => setMdlId(m.phy_mdl_id)} aria-pressed={m.phy_mdl_id === mdlId} className={`rounded-full border px-3 py-1 text-sm ${m.phy_mdl_id === mdlId ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : ''}`}>
              {dbmsNm(m.dbms_cd)} · {m.idntfr_ltr_cd === 'LOWER' ? '소문자' : '대문자'}
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
              <summary className={diffN ? 'font-semibold text-amber-700' : 'text-green-700'}>{diffN ? `논리 모델과 차이 ${diffN}건(도메인 영향 ${det.diff.dom_chg.length}) — 반영하려면 삭제 후 다시 전환` : '논리 모델과 차이 없음'}</summary>
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
              {det.tables.map((t) => (
                <li key={t.phy_tbl_id}>
                  <button type="button" onClick={() => (setTblId(t.phy_tbl_id), setEdit(new Map()))} aria-current={t.phy_tbl_id === tblId} className={`w-full px-3 py-2 text-left font-mono ${t.phy_tbl_id === tblId ? 'bg-[#e9eff9] font-semibold' : 'hover:bg-gray-50'}`}>
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
                <p className="mt-1 text-xs text-gray-500">시스템 칼럼(등록자·등록일시·변경자·변경일시·삭제여부·삭제일시)은 항상 맨 끝에 고정됩니다. 기본값은 숫자·작은따옴표 문자열·CURRENT_TIMESTAMP 같은 키워드만 허용합니다.</p>
              </section>
            )}
          </div>
        </>
      )}
    </main>
  )
}

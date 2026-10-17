'use client'
import { piFetch } from '@pi/auth/client'
// 리버스 화면(PRD_PiErd S4 R1~R4) — DDL 붙여넣기·파일 또는 카탈로그 조회 CSV → 스테이징(표준 용어 역매핑·엔터티 단어·관계 후보) → 선택 테이블을 모델에 반영
//  반영 = 기존 API 를 순서대로 호출(엔터티 → 속성 → 관계 → FK 연결)해 표준 검증을 그대로 받음, 결과 ID 는 스테이징에 출처로 기록. 반영 후 ERD 화면이 새 엔터티를 자동 배치
//  미매핑 칼럼(용어 없음)·미등록 단어 테이블은 반영하지 않고 표준 신청 후보로 보여 줌. 서버는 고객 DB 에 접속하지 않는다(카탈로그 SQL 은 사용자가 실행)
import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { dbmsList, type DbmsCd } from '@/lib/modelpi/dbms'
import { can, type MbrRole } from '@/lib/roles'

interface Job {
  rvs_job_id: string
  src_cd: string
  dbms_cd: string
  file_nm: string | null
  job_sts_cd: string
  tbl_cnt: number
  col_cnt: number
  map_pct: number
  reg_dtm: string
}
interface Tbl {
  rvs_tbl_id: string
  tbl_nm: string
  tbl_desc: string | null
  dic_ids: string[] | null
  ent_id: string | null
}
interface Col {
  rvs_col_id: string
  rvs_tbl_id: string
  col_nm: string
  col_seq: number
  data_tp_nm: string
  data_len: number | null
  null_yn: string
  pk_seq: number | null
  col_desc: string | null
  map_cd: string
  term_id: string | null
  cand_nm: string | null
  attr_id: string | null
  rel_id: string | null
}
interface Rel {
  prnt: string
  chld: string
  cols: string[]
  ref_cols: string[]
  src: 'FK' | 'NAME'
  fk_nm: string | null
  idnt: boolean
  opt: boolean
}
const MAP_NM: Record<string, string> = { EXACT: '완전일치', CMNT: '코멘트', SPLIT: '단어 분해(신청 후보)', NONE: '미매핑' }
const MAP_CLS: Record<string, string> = { EXACT: 'text-green-700', CMNT: 'text-green-700', SPLIT: 'text-amber-700', NONE: 'text-red-700' }
const DBMS = dbmsList()
const btn = 'rounded border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-40'

export default function ReversePage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const api = `/api/areas/${areaId}`
  const [role, setRole] = useState<MbrRole | null>(null)
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [subjs, setSubjs] = useState<{ subj_id: string; subj_nm: string; prj_id: string }[]>([])
  const [src, setSrc] = useState<'DDL' | 'CSV'>('DDL')
  const [dbms, setDbms] = useState<DbmsCd>('0014')
  const [text, setText] = useState('')
  const [fileNm, setFileNm] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobId, setJobId] = useState('')
  const [det, setDet] = useState<{ job: Job; tbls: Tbl[]; cols: Col[]; rels: Rel[] } | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [relPick, setRelPick] = useState<Set<number>>(new Set())
  const [subj, setSubj] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [log, setLog] = useState<string[]>([])
  const editor = !!role && can(role, 'REQUEST')
  const base = `${api}/projects/${prjId}/reverse`

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

  const loadJobs = useCallback(async () => {
    if (!prjId) return
    const j = await (await piFetch(base)).json()
    if (j.ok) setJobs(j.items)
  }, [base, prjId])
  useEffect(() => {
    setDet(null)
    setJobId('')
    void loadJobs()
    try {
      if (prjId) window.localStorage.setItem(`logical-prj-${areaId}`, prjId)
    } catch {}
  }, [loadJobs, prjId, areaId])

  const loadDet = useCallback(async () => {
    if (!jobId) return setDet(null)
    const j = await (await piFetch(`${base}?job=${jobId}`)).json()
    if (!j.ok) return setMsg(j.message)
    setDet(j)
    setPick(new Set((j.tbls as Tbl[]).filter((t) => t.dic_ids?.length && !t.ent_id).map((t) => t.rvs_tbl_id)))
    const done = (r: Rel) => (j.cols as Col[]).some((c) => c.rel_id && r.cols.includes(c.col_nm) && (j.tbls as Tbl[]).find((t) => t.rvs_tbl_id === c.rvs_tbl_id)?.tbl_nm === r.chld)
    setRelPick(new Set((j.rels as Rel[]).map((r, i) => (r.src === 'FK' && !done(r) ? i : -1)).filter((i) => i >= 0))) // 선언 FK 만 기본 체크(이름 후보는 사용자가 선택), 이미 반영된 관계 제외
  }, [base, jobId])
  useEffect(() => {
    void loadDet()
  }, [loadDet])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 4_000_000) return setMsg('파일이 너무 큽니다(4MB 이하) — 주제영역·스키마 단위로 나누어 올리십시오')
    setText(await f.text())
    setFileNm(f.name)
    setSrc(/\.csv$/i.test(f.name) ? 'CSV' : 'DDL')
  }
  const copyCatalog = async () => {
    const t = await (await piFetch(`${base}?catalog=${dbms}`)).text()
    try {
      await navigator.clipboard.writeText(t)
      setMsg('카탈로그 조회 SQL 을 복사했습니다 — 대상 DB 에서 실행한 결과를 CSV(머리글 포함)로 저장해 올리십시오')
    } catch {
      setText(t)
      setMsg('클립보드를 쓸 수 없어 아래 입력란에 SQL 을 넣었습니다')
    }
  }
  const stage = async () => {
    setBusy(true)
    setMsg('')
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src_cd: src, dbms_cd: dbms, file_nm: fileNm, text }) })).json()
    setBusy(false)
    if (!j.ok) return setMsg(j.message)
    setMsg(`해석 완료 — 테이블 ${j.tbl_cnt} · 칼럼 ${j.col_cnt} · 용어 매핑 ${j.mapped}${j.warnings?.length ? ` · 경고 ${j.warnings.length}(${j.warnings.slice(0, 3).join(' / ')})` : ''}`)
    await loadJobs()
    setJobId(j.rvs_job_id)
  }

  const cols = useMemo(() => {
    const m = new Map<string, Col[]>()
    for (const c of det?.cols ?? []) m.set(c.rvs_tbl_id, [...(m.get(c.rvs_tbl_id) ?? []), c].sort((a, b) => a.col_seq - b.col_seq))
    return m
  }, [det])
  const cands = useMemo(() => (det?.cols ?? []).filter((c) => !c.term_id), [det])

  // 반영 — 기존 API 를 순서대로 호출. 실패는 기록하고 계속(부분 반영 후 다시 실행하면 이미 반영된 테이블은 건너뜀)
  const apply = async () => {
    if (!det || !subj) return setMsg('반영할 주제영역을 고르십시오')
    const targets = det.tbls.filter((t) => pick.has(t.rvs_tbl_id) && t.dic_ids?.length && !t.ent_id)
    if (!targets.length) return setMsg('반영할 테이블이 없습니다(표준단어로 분해된 미반영 테이블만)')
    if (!window.confirm(`테이블 ${targets.length}개를 엔터티로 반영합니다(용어 매핑된 칼럼만 속성, 선택한 관계 ${relPick.size}건). 계속할까요?`)) return
    setBusy(true)
    const out: string[] = []
    const post = async (u: string, b: unknown) => (await piFetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json()
    const entOf = new Map<string, string>() // 테이블명 → 엔터티ID(이번 반영 + 이전 반영)
    for (const t of det.tbls) if (t.ent_id) entOf.set(t.tbl_nm, t.ent_id)
    const markT: { rvs_tbl_id: string; ent_id: string }[] = []
    const markC: { rvs_col_id: string; attr_id?: string; rel_id?: string }[] = []
    // 출처는 엔터티마다 즉시 기록 — 중간에 실패·창 닫힘이어도 다시 실행하면 반영된 테이블은 건너뜀(엔터티 중복 방지)
    const mark = async (tbls: typeof markT, cs: typeof markC) => {
      const m = await (await piFetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rvs_job_id: det.job.rvs_job_id, tbls, cols: cs }) })).json()
      if (!m.ok) out.push(`출처 기록 실패 : ${m.message}`)
    }
    for (const t of targets) {
      const e = await post(`${api}/entities`, { subj_id: subj, dic_ids: t.dic_ids, ent_tp_cd: 'BASE', ent_desc: t.tbl_desc, mdl_lvl_cd: 'LGCL' })
      if (!e.ok) {
        out.push(`✗ ${t.tbl_nm} : ${e.message}`)
        continue
      }
      const entId = e.item.ent_id as string
      entOf.set(t.tbl_nm, entId)
      markT.push({ rvs_tbl_id: t.rvs_tbl_id, ent_id: entId })
      let n = 0
      const cs = (cols.get(t.rvs_tbl_id) ?? []).filter((c) => c.term_id).sort((a, b) => (a.pk_seq ?? 999) - (b.pk_seq ?? 999) || a.col_seq - b.col_seq)
      for (const c of cs) {
        const a = await post(`${api}/entities/${entId}/attributes`, { term_id: c.term_id, pk_yn: c.pk_seq ? 'Y' : 'N', esntl_yn: c.pk_seq || c.null_yn === 'N' ? 'Y' : 'N', attr_desc: c.col_desc })
        if (a.ok) {
          n++
          markC.push({ rvs_col_id: c.rvs_col_id, attr_id: a.item.attr_id })
        } else out.push(`  ${t.tbl_nm}.${c.col_nm} : ${a.message}`)
      }
      out.push(`✓ ${t.tbl_nm} → ${e.item.ent_log_nm} (속성 ${n}/${(cols.get(t.rvs_tbl_id) ?? []).length})`)
      await mark(markT.slice(-1), markC.splice(0))
    }
    for (const i of relPick) {
      const r = det.rels[i]
      const p = entOf.get(r.prnt), c = entOf.get(r.chld)
      if (!p || !c) continue
      if (det.cols.some((x) => x.rel_id && r.cols.includes(x.col_nm) && det.tbls.find((t) => t.rvs_tbl_id === x.rvs_tbl_id)?.tbl_nm === r.chld)) continue // 이미 반영된 관계
      const rel = await post(`${api}/relations`, { prnt_ent_id: p, chld_ent_id: c, crdn_cd: '1N', idnt_yn: r.idnt ? 'Y' : 'N', prnt_opt_yn: r.opt && !r.idnt ? 'Y' : 'N', rel_desc: r.src === 'FK' ? `리버스 선언 FK ${r.fk_nm ?? ''}`.trim() : '리버스 이름 기반 후보' })
      if (!rel.ok) {
        out.push(`✗ 관계 ${r.prnt} → ${r.chld} : ${rel.message}`)
        continue
      }
      const relId = rel.item.rel_id as string
      for (const cn of r.cols) {
        const sc = det.cols.find((x) => x.col_nm === cn && det.tbls.find((t) => t.rvs_tbl_id === x.rvs_tbl_id)?.tbl_nm === r.chld)
        if (sc) markC.push({ rvs_col_id: sc.rvs_col_id, rel_id: relId })
      }
      // 칼럼명이 부모 주키와 같으면 FK 상속 연결(같은 용어 속성을 관계에 묶음), 역할명이면 논리 모델에서 연결
      if (r.cols.join() === r.ref_cols.join()) {
        const f = await post(`${api}/relations/${relId}/fk-plan`, {})
        out.push(f.ok ? `✓ 관계 ${r.prnt} → ${r.chld} (FK 연결 ${f.applied})` : `△ 관계 ${r.prnt} → ${r.chld} : FK 연결 실패 ${f.message}`)
      } else out.push(`△ 관계 ${r.prnt} → ${r.chld} : 역할명 FK(${r.cols.join(',')}) — 논리 모델의 관계 FK 버튼에서 연결하십시오`)
    }
    await mark([], markC)
    setBusy(false)
    setLog(out)
    setMsg(`반영 완료 — 엔터티 ${markT.length}개. ERD 화면에서 새 엔터티가 자동 배치됩니다`)
    await loadDet()
    await loadJobs()
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">리버스</h1>
      <p className="mt-1 text-sm text-gray-600">기존 DB 의 DDL 또는 카탈로그 조회 결과(CSV)를 표준 데이터 모델로 가져옵니다. 칼럼은 승인된 표준용어로 역매핑되고, 매핑되지 않은 이름은 표준 신청 후보로 남습니다.</p>

      <section className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-3 text-sm text-white shadow-md" aria-label="리버스 원천">
        <select value={prjId} onChange={(e) => setPrjId(e.target.value)} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="프로젝트 선택">
          {prjs.length === 0 && <option value="">프로젝트가 없습니다</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        <select value={dbms} onChange={(e) => setDbms(e.target.value as DbmsCd)} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="DBMS 선택">
          {DBMS.map((d) => (
            <option key={d.cd} value={d.cd}>
              {d.nm}
            </option>
          ))}
        </select>
        <select value={src} onChange={(e) => setSrc(e.target.value as 'DDL' | 'CSV')} className="rounded border border-white/60 bg-white px-2 py-1 text-gray-900" aria-label="원천 형식">
          <option value="DDL">DDL(.sql)</option>
          <option value="CSV">카탈로그 조회 결과(CSV)</option>
        </select>
        <button type="button" onClick={() => void copyCatalog()} className="rounded bg-white/20 px-3 py-1 hover:bg-white/30" disabled={!prjId}>
          카탈로그 조회 SQL 복사
        </button>
        <label className="cursor-pointer rounded bg-white/20 px-3 py-1 hover:bg-white/30">
          파일 선택
          <input type="file" accept=".sql,.ddl,.txt,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {fileNm && <span className="text-xs">{fileNm}</span>}
        {editor && (
          <button type="button" onClick={() => void stage()} disabled={busy || !text.trim() || !prjId} className="ml-auto rounded bg-white px-3 py-1 font-semibold text-[#1f3a68] disabled:opacity-40">
            해석·매핑
          </button>
        )}
      </section>
      <textarea value={text} onChange={(e) => (setText(e.target.value), setFileNm(null))} rows={6} placeholder={src === 'DDL' ? 'CREATE TABLE … 문장을 붙여넣거나 파일을 고르십시오' : 'TABLE_NAME,COLUMN_NAME,DATA_TYPE,… 머리글 포함 CSV'} className="mt-2 w-full rounded border p-2 font-mono text-xs" aria-label="원천 내용" />
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}

      {jobs.length > 0 && (
        <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="리버스 작업">
          {jobs.map((j) => (
            <button key={j.rvs_job_id} type="button" onClick={() => setJobId(j.rvs_job_id)} aria-pressed={j.rvs_job_id === jobId} className={`rounded-full border px-3 py-1 ${j.rvs_job_id === jobId ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : ''}`}>
              {j.file_nm ?? j.src_cd} · 테이블 {j.tbl_cnt} · 매핑 {j.map_pct}%{j.job_sts_cd === 'APPLIED' ? ' · 반영' : ''}
            </button>
          ))}
        </nav>
      )}

      {det && (
        <>
          <section className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="반영">
            <span>
              매핑 {det.job.map_pct}% · 신청 후보 {cands.length}
            </span>
            {editor && (
              <>
                <select value={subj} onChange={(e) => setSubj(e.target.value)} className="ml-auto rounded border px-2 py-1" aria-label="반영할 주제영역">
                  <option value="">반영할 주제영역</option>
                  {subjs
                    .filter((s) => s.prj_id === prjId)
                    .map((s) => (
                      <option key={s.subj_id} value={s.subj_id}>
                        {s.subj_nm}
                      </option>
                    ))}
                </select>
                <button type="button" className={`${btn} bg-[#1f3a68] text-white`} disabled={busy || !pick.size || !subj} onClick={() => void apply()}>
                  선택 {pick.size}개 모델에 반영
                </button>
              </>
            )}
          </section>
          {log.length > 0 && <pre className="mt-2 max-h-48 overflow-auto rounded border bg-gray-50 p-2 text-xs">{log.join('\n')}</pre>}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[#e9eff9]">
                <tr>
                  {['', '테이블', '엔터티 단어', '칼럼(매핑)', '상태'].map((h) => (
                    <th key={h} className="border px-2 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {det.tbls.map((t) => {
                  const cs = cols.get(t.rvs_tbl_id) ?? []
                  const ok = !!t.dic_ids?.length
                  return (
                    <tr key={t.rvs_tbl_id} className={t.ent_id ? 'bg-green-50' : ''}>
                      <td className="border px-2 py-1 align-top">
                        <input type="checkbox" disabled={!ok || !!t.ent_id || !editor} checked={pick.has(t.rvs_tbl_id)} onChange={() => setPick((p) => (p.has(t.rvs_tbl_id) ? new Set([...p].filter((x) => x !== t.rvs_tbl_id)) : new Set([...p, t.rvs_tbl_id])))} aria-label={`${t.tbl_nm} 반영`} />
                      </td>
                      <td className="border px-2 py-1 align-top font-mono">
                        {t.tbl_nm}
                        {t.tbl_desc && <div className="font-sans text-xs text-gray-600">{t.tbl_desc}</div>}
                      </td>
                      <td className="border px-2 py-1 align-top text-xs">{ok ? `${t.dic_ids!.length}단어` : <span className="text-red-700">미등록 단어 — 표준단어 신청 후 다시 해석</span>}</td>
                      <td className="border px-2 py-1 align-top text-xs">
                        <ul>
                          {cs.map((c) => (
                            <li key={c.rvs_col_id}>
                              {c.pk_seq ? '🔑' : '·'} <span className="font-mono">{c.col_nm}</span> <span className={MAP_CLS[c.map_cd]}>{MAP_NM[c.map_cd]}</span>
                              {c.cand_nm && <span className="text-gray-600"> → {c.cand_nm}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="border px-2 py-1 align-top text-xs">{t.ent_id ? '반영됨' : ok ? '반영 가능' : '불가'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {det.rels.length > 0 && (
            <section className="mt-3 text-sm" aria-label="관계 후보">
              <h2 className="font-semibold text-[#1f3a68]">관계 후보(선언 FK 는 기본 선택, 이름 기반은 직접 선택)</h2>
              <ul className="mt-1">
                {det.rels.map((r, i) => (
                  <li key={i}>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" disabled={!editor} checked={relPick.has(i)} onChange={() => setRelPick((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))} />
                      <span className="font-mono">
                        {r.prnt} → {r.chld} ({r.cols.join(', ')})
                      </span>
                      <span className={r.src === 'FK' ? 'text-green-700' : 'text-amber-700'}>{r.src === 'FK' ? `선언 FK${r.fk_nm ? ` ${r.fk_nm}` : ''}` : '이름 기반 후보'}</span>
                      {r.idnt && <span className="text-xs">식별</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {cands.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold text-[#1f3a68]">표준 신청 후보 {cands.length}건(용어 미매핑 칼럼)</summary>
              <ul className="mt-1 text-xs">
                {cands.map((c) => (
                  <li key={c.rvs_col_id}>
                    <span className="font-mono">{c.col_nm}</span> {c.cand_nm ? `→ ${c.cand_nm}` : '(단어 분해 불가)'}{' '}
                    <Link href={`/areas/${areaId}/terms?new=${encodeURIComponent(c.cand_nm ?? c.col_nm)}`} className="text-blue-700 underline">
                      용어 신청
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </main>
  )
}

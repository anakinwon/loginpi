'use client'
// DDL 생성 화면(마스터 지시 2026-10-18) — 프로젝트 > 물리 모델(DBMS) > 주제영역 > 물리 테이블 목록에서 골라 DDL 미리보기·내려받기
//  선택 가능 = 테이블 작성완료 + 자기 주제영역 ERD 작성완료에 배치됨(아니면 사유 배지), 여러 주제영역 누적 선택
//  오른쪽 탭 : 미리보기(+실행 요청) / 요청·승인·실행 결과 / 접속 관리 — 실행은 DA 승인 후(자기 승인 금지), 서버 직접(PostgreSQL·Oracle) 또는 로컬 에이전트
// ponytail: 테이블 목록은 물리 모델 전체를 한 번 받아 화면에서 페이지 나눔(DDL 생성에 전체가 필요) — 수천 개 모델이면 서버 페이지 조회로
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { use, useEffect, useMemo, useState } from 'react'
import { dbmsList } from '@/lib/modelpi/dbms'
import ConnPanel, { type Conn } from './conn-panel'
import ReqPanel from './req-panel'

interface Tbl {
  phy_tbl_id: string
  ent_id: string
  tbl_nm: string
  subj_id: string
  phy_sts_cd: string
  ok: boolean
  why: string | null
}
interface Subj {
  subj_id: string
  subj_nm: string
  dgm_done: boolean
  n: number
}
interface Pv {
  ddl: string
  hash: string
  blockers: string[]
  stmt_cnt: number
  tbl_cnt: number
}
const SIZE = 20

export default function DdlPage({
  params,
}: {
  params: Promise<{ areaId: string }>
}) {
  const { areaId } = use(params)
  const api = `/api/areas/${areaId}`
  const [prjs, setPrjs] = useState<{ prj_id: string; prj_nm: string }[]>([])
  const [prjId, setPrjId] = useState('')
  const [mdls, setMdls] = useState<{ phy_mdl_id: string; dbms_cd: string }[]>(
    [],
  )
  const [mdlId, setMdlId] = useState('')
  const [subjs, setSubjs] = useState<Subj[]>([])
  const [subjId, setSubjId] = useState('')
  const [tbls, setTbls] = useState<Tbl[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [kw, setKw] = useState('')
  const [page, setPage] = useState(1)
  const [pv, setPv] = useState<Pv | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'pv' | 'req' | 'conn'>('pv')
  const [conns, setConns] = useState<Conn[]>([])
  const [connId, setConnId] = useState('')
  const [rev, setRev] = useState(0) // 요청 목록 다시 불러오기
  const loadConns = () =>
    void piFetch(`${api}/db-conns`)
      .then((r) => r.json())
      .then((j) => j.ok && setConns(j.items))
  useEffect(loadConns, [api]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    piFetch(`${api}/projects`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return
        setPrjs(j.items)
        let keep: string | null = null
        try {
          keep = window.localStorage.getItem(`logical-prj-${areaId}`) // 논리·물리·ERD 화면과 프로젝트 선택 공유
        } catch {}
        setPrjId(
          j.items.find((p: { prj_id: string }) => p.prj_id === keep)?.prj_id ??
            j.items[0]?.prj_id ??
            '',
        )
      })
  }, [api, areaId])
  useEffect(() => {
    setMdls([])
    setMdlId('')
    if (!prjId) return
    piFetch(`${api}/projects/${prjId}/ddl`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setMsg(j.message)
        setMdls(j.models ?? [])
        setMdlId(j.models?.[0]?.phy_mdl_id ?? '')
      })
  }, [api, prjId])
  useEffect(() => {
    setTbls([])
    setSubjs([])
    setPicked(new Set())
    setPv(null)
    if (!prjId || !mdlId) return
    piFetch(`${api}/projects/${prjId}/ddl?mdl=${mdlId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setMsg(j.message)
        setTbls(j.tables)
        setSubjs(j.subjs)
        setSubjId((s) =>
          j.subjs.some((x: Subj) => x.subj_id === s)
            ? s
            : (j.subjs.find((x: Subj) => x.dgm_done)?.subj_id ??
              j.subjs[0]?.subj_id ??
              ''),
        )
      })
  }, [api, prjId, mdlId])

  const list = useMemo(
    () =>
      tbls.filter(
        (t) =>
          t.subj_id === subjId &&
          (!kw || t.tbl_nm.toLowerCase().includes(kw.toLowerCase())),
      ),
    [tbls, subjId, kw],
  )
  const pages = Math.max(1, Math.ceil(list.length / SIZE))
  const rows = list.slice((page - 1) * SIZE, page * SIZE)
  const okIds = list.filter((t) => t.ok).map((t) => t.phy_tbl_id)
  const allOn = okIds.length > 0 && okIds.every((id) => picked.has(id))
  const toggle = (ids: string[], on: boolean) => {
    setPicked((s) => {
      const n = new Set(s)
      for (const id of ids) on ? n.add(id) : n.delete(id)
      return n
    })
    setPv(null)
  }
  const preview = async () => {
    setBusy(true)
    const j = await (
      await piFetch(`${api}/projects/${prjId}/ddl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phy_mdl_id: mdlId, tbl_ids: [...picked] }),
      })
    ).json()
    setBusy(false)
    if (!j.ok) return setMsg(j.message)
    setPv(j)
    setMsg('')
  }
  const down = () => {
    if (!pv) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob([pv.ddl], { type: 'application/sql;charset=utf-8' }),
    )
    a.download = `ddl_${dbmsList().find((d) => d.cd === mdls.find((m) => m.phy_mdl_id === mdlId)?.dbms_cd)?.nm ?? 'db'}_${pv.tbl_cnt}tbl.sql`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000) // 일부 WebView 는 즉시 해제 시 내려받기 취소
  }
  // 실행 요청 — 서버가 DDL 을 다시 만들어 스냅샷 저장(화면 DDL 을 보내지 않음), 승인 대기로
  const dbmsCd = mdls.find((m) => m.phy_mdl_id === mdlId)?.dbms_cd ?? ''
  const myConns = conns.filter((c) => c.dbms_cd === dbmsCd)
  const request = async () => {
    if (!connId) return
    setBusy(true)
    const j = await (
      await piFetch(`${api}/projects/${prjId}/ddl-reqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phy_mdl_id: mdlId,
          conn_id: connId,
          tbl_ids: [...picked],
        }),
      })
    ).json()
    setBusy(false)
    if (!j.ok)
      return setMsg(
        `${j.message}${Array.isArray(j.detail) && j.detail.length ? ` — ${j.detail.slice(0, 3).join(' · ')}` : ''}`,
      )
    setMsg(
      '실행을 요청했습니다 — 다른 승인권자(시스템담당자·데이터아키텍트)가 승인하면 실행할 수 있습니다',
    )
    setRev((r) => r + 1)
    setTab('req')
  }
  const sel2 = 'rounded border border-white/60 bg-white px-2 py-1 text-gray-900'
  const subjNm = new Map(subjs.map((s) => [s.subj_id, s.subj_nm]))
  const pickedBySubj = [
    ...new Set(
      tbls.filter((t) => picked.has(t.phy_tbl_id)).map((t) => t.subj_id),
    ),
  ].map(
    (s) =>
      `${subjNm.get(s)} ${tbls.filter((t) => t.subj_id === s && picked.has(t.phy_tbl_id)).length}`,
  )

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-1 text-2xl font-bold">DDL 생성</h1>
      <section
        className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#c7d2e6] bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-4 py-2 text-sm text-white shadow-md"
        aria-label="DDL 대상 선택"
      >
        <select
          value={prjId}
          onChange={(e) => setPrjId(e.target.value)}
          className={sel2}
          aria-label="프로젝트 선택"
        >
          {prjs.length === 0 && <option value="">프로젝트가 없습니다</option>}
          {prjs.map((p) => (
            <option key={p.prj_id} value={p.prj_id}>
              {p.prj_nm}
            </option>
          ))}
        </select>
        <select
          value={mdlId}
          onChange={(e) => setMdlId(e.target.value)}
          className={sel2}
          aria-label="물리 모델(DBMS)"
        >
          {mdls.length === 0 && <option value="">물리 모델이 없습니다</option>}
          {mdls.map((m) => (
            <option key={m.phy_mdl_id} value={m.phy_mdl_id}>
              물리 {dbmsList().find((d) => d.cd === m.dbms_cd)?.nm ?? m.dbms_cd}
            </option>
          ))}
        </select>
        <span className="text-xs text-white/80">
          순서 : 테이블 작성완료 → ERD 작성완료 → DDL
        </span>
      </section>
      {msg && (
        <p role="status" className="mt-2 text-sm font-medium text-[#1f3a68]">
          {msg}
        </p>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.3fr)]">
        <nav className="rounded border text-sm" aria-label="주제영역">
          <h2 className="bg-[#e9eff9] px-2 py-1 font-semibold">주제영역</h2>
          <ul>
            {subjs.map((s) => (
              <li key={s.subj_id}>
                <button
                  type="button"
                  onClick={() => (setSubjId(s.subj_id), setPage(1))}
                  aria-current={s.subj_id === subjId}
                  className={`w-full px-3 py-1 text-left ${s.subj_id === subjId ? 'bg-amber-100' : 'hover:bg-gray-50'} ${s.dgm_done ? '' : 'text-gray-400'}`}
                >
                  {s.subj_nm} <span className="text-xs">({s.n})</span>
                  {!s.dgm_done && (
                    <span className="block text-xs">ERD 작성완료 필요</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section
          className="rounded border p-2 text-sm"
          aria-label="물리 테이블 목록"
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={kw}
              onChange={(e) => (setKw(e.target.value), setPage(1))}
              placeholder="테이블 이름 검색"
              className="rounded border px-2 py-1"
              aria-label="테이블 검색"
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={allOn}
                disabled={!okIds.length}
                onChange={(e) => toggle(okIds, e.target.checked)}
              />{' '}
              이 주제영역 전체 선택({okIds.length})
            </label>
          </div>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="w-8 border px-1 py-1">선택</th>
                <th className="border px-2 py-1 text-left">테이블</th>
                <th className="border px-2 py-1 text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.phy_tbl_id} className={t.ok ? '' : 'text-gray-400'}>
                  <td className="border px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      disabled={!t.ok}
                      checked={picked.has(t.phy_tbl_id)}
                      onChange={(e) => toggle([t.phy_tbl_id], e.target.checked)}
                      aria-label={`${t.tbl_nm} 선택`}
                    />
                  </td>
                  <td className="border px-2 py-1 font-mono">{t.tbl_nm}</td>
                  <td className="border px-2 py-1 text-xs">
                    {t.ok ? (
                      <span className="text-green-700">대상</span>
                    ) : (
                      <span className="rounded bg-gray-100 px-1">{t.why}</span>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-gray-500">
                    테이블이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
            <span className="mr-auto text-gray-600">
              총 {list.length}개 · {page} / {pages} 페이지
            </span>
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="rounded border px-2 py-1 disabled:opacity-30"
            >
              ‹
            </button>
            {Array.from(
              { length: Math.min(5, pages) },
              (_, i) =>
                Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i,
            ).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                aria-current={p === page}
                className={`hidden rounded border px-2 py-1 sm:inline ${p === page ? 'bg-[#1f3a68] text-white' : ''}`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              disabled={page >= pages}
              className="rounded border px-2 py-1 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </section>

        <section
          className="rounded border p-2 text-sm"
          aria-label="DDL 미리보기·실행"
        >
          <div role="tablist" className="mb-2 flex gap-1 border-b text-sm">
            {(
              [
                ['pv', 'DDL 미리보기'],
                ['req', '실행 요청·승인·결과'],
                ['conn', 'DB 접속'],
              ] as const
            ).map(([k, nm]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`-mb-px rounded-t border px-3 py-1 ${tab === k ? 'border-b-white bg-white font-semibold text-[#1f3a68]' : 'bg-gray-50 text-gray-600'}`}
              >
                {nm}
              </button>
            ))}
          </div>
          {tab === 'req' && prjId && (
            <ReqPanel api={api} prjId={prjId} rev={rev} />
          )}
          {tab === 'conn' && <ConnPanel api={api} onChange={loadConns} />}
          {tab === 'pv' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-[#1f3a68]">
                  선택 {picked.size}개
                </span>
                {pickedBySubj.length > 0 && (
                  <span className="text-xs text-gray-600">
                    ({pickedBySubj.join(' · ')})
                  </span>
                )}
                <button
                  type="button"
                  className="ml-auto rounded bg-[#1f3a68] px-3 py-1 text-white disabled:opacity-40"
                  disabled={!picked.size || busy}
                  onClick={() => void preview()}
                >
                  DDL 미리보기
                </button>
                <button
                  type="button"
                  className="rounded border px-3 py-1 disabled:opacity-40"
                  disabled={!pv?.ddl}
                  onClick={down}
                >
                  내려받기(.sql)
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  disabled={!picked.size}
                  onClick={() => toggle([...picked], false)}
                >
                  선택 해제
                </button>
              </div>
              {pv && (
                <>
                  <p className="mt-2 text-xs text-gray-600">
                    테이블 {pv.tbl_cnt}개 · 실행 문장 {pv.stmt_cnt}개 · 해시{' '}
                    <span className="font-mono">{pv.hash.slice(0, 8)}</span>
                  </p>
                  {pv.blockers.length > 0 && (
                    <ul
                      className="mt-2 list-disc rounded border border-red-200 bg-red-50 py-1 pl-6 text-xs text-red-800"
                      aria-label="실행 차단 사유"
                    >
                      {pv.blockers.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  )}
                  <div
                    className="mt-2 flex flex-wrap items-center gap-2 rounded border border-[#c7d2e6] bg-[#f4f7fc] p-2"
                    aria-label="DB 실행 요청"
                  >
                    <span className="text-xs font-semibold">
                      DB 에 직접 생성
                    </span>
                    <select
                      value={connId}
                      onChange={(e) => setConnId(e.target.value)}
                      className="rounded border px-2 py-1 text-xs"
                      aria-label="실행할 DB 접속"
                    >
                      <option value="">접속 선택</option>
                      {myConns.map((c) => (
                        <option key={c.conn_id} value={c.conn_id}>
                          {c.conn_nm} (
                          {c.exec_mthd_cd === 'SRV' ? '서버 직접' : '에이전트'})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-40"
                      disabled={
                        !connId ||
                        busy ||
                        pv.blockers.length > 0 ||
                        !pv.stmt_cnt
                      }
                      onClick={() => void request()}
                      title={
                        pv.blockers.length
                          ? '차단 사유를 먼저 해결하십시오'
                          : 'DA 승인 후 실행'
                      }
                    >
                      실행 요청
                    </button>
                    <span className="w-full text-xs font-medium text-red-700">⚠ DDL 이 테이블마다 CREATE 직전 DROP … CASCADE 를 포함합니다 — 대상 DB 의 같은 이름 테이블과 데이터가 삭제되며 되돌릴 수 없습니다.</span>
                    {!myConns.length && (
                      <span className="text-xs text-gray-500">
                        이 DBMS 접속이 없습니다 — 'DB 접속' 탭에서
                        등록(데이터아키텍트)
                      </span>
                    )}
                    <span className="w-full text-xs text-gray-500">
                      요청 → 다른 데이터아키텍트 승인 → 실행(서버 직접은 이
                      화면, 에이전트는 사내 PC 에서 자동)
                    </span>
                  </div>
                  <pre className="mt-2 max-h-[60vh] overflow-auto rounded bg-gray-900 p-3 font-mono text-xs text-gray-100">
                    {pv.ddl}
                  </pre>
                </>
              )}
              {!pv && (
                <p className="mt-3 text-gray-500">
                  테이블을 고른 뒤 'DDL 미리보기'를 누르십시오. 다른
                  주제영역으로 옮겨 가도 선택은 유지됩니다. PK 는 유일 인덱스를
                  먼저 만든 뒤 그 인덱스로 생성하고, FK 는 만들지
                  않습니다(PostgreSQL 은 이름 전부 소문자).
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

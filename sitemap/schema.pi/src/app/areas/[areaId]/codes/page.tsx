'use client'
// 표준코드(공통코드) 화면 — 메인 메뉴 표준코드. 공통코드 = 이름이 ~구분코드·~종류코드·~유형코드 인 확정 표준용어(코드형 도메인)만(마스터 지시 2026-10-20, 노트 4장 p141~147)
//  코드기본 : 코드상세 = 1:N — 위 등록 폼, 아래 조회(표준용어 조회와 같은 표·페이지 단위 조회), 코드기본을 고르면 맨 아래 코드상세(코드값) 표. 그 외 코드는 공통코드 아님 → 별도 기본테이블(기준 엔터티)
//  조회 = 표준 메뉴 권한, 등록·수정·삭제 = 표준 신청 권한. 코드기본은 단어·용어와 같은 승인 절차(신청 → 승인완료 후 사용, 즉시 승인 = SELF_APPROVE), 코드상세는 바로 반영
import { piFetch } from '@pi/auth/client'
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { CD_KIND, cdKind, type CdKind } from '@/lib/std-code-rule'
import { ApvFields, ApvLink, StsCell, StsFilter } from '../words/word-board'
import CodeDtl, { type BasOpt } from './code-dtl'

type Code = { cd_id: string; term_id: string; cd_cls_nm: string | null; cd_desc: string | null; use_yn: 'Y' | 'N'; ver_no: number; std_sts_cd: string; pend_act: string | null; std_term: { term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null } | null }
type Term = { term_id: string; term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null }
type Cond = { kind: CdKind | 'ALL'; kw: string; sts: string; page: number; size: number }

// 코드 구분 배지 색(구분 = 고정 회색, 종류 = 늘어남 파랑, 유형 = 묶음 보라)
const KIND_TONE: Record<CdKind, string> = { DIV: 'bg-slate-100 text-slate-700', KND: 'bg-sky-100 text-sky-800', TYP: 'bg-violet-100 text-violet-800' }
const kindOf = (c: Code) => cdKind(c.std_term?.term_log_nm)

export default function CodesPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const base = `/api/areas/${areaId}/codes`
  const [codes, setCodes] = useState<Code[]>([])
  // 조회 조건(표준용어 화면과 같은 페이지 단위 조회, 2026-10-20) — 구분·검색어·페이지·건수, 건수(cnt) = 서버 집계
  const [cond, setCond] = useState<Cond>({ kind: 'ALL', kw: '', sts: '', page: 1, size: 20 })
  const [q, setQ] = useState('')
  const [total, setTotal] = useState(0)
  const [cnt, setCnt] = useState<Record<string, number>>({})
  const [selId, setSelId] = useState('') // 코드상세 대상 코드기본(목록 코드명 클릭·코드상세 콤보·새 코드기본 등록 시)
  const [opts, setOpts] = useState<BasOpt[]>([]) // 코드상세 콤보 = 전체 코드기본(선택지 조회, 최대 1000)
  const [edit, setEdit] = useState<Code | null>(null)
  // 코드기본 등록 = 마스터코드명 + 코드 구분 콤보(구분코드|종류코드|유형코드) → 이름이 같은 확정 표준용어를 찾아 연결(마스터 지시 2026-10-20)
  const [master, setMaster] = useState('')
  const [kind, setKind] = useState<CdKind>('DIV')
  const [term, setTerm] = useState<Term | null>(null)
  const [look, setLook] = useState<'idle' | 'busy' | 'none' | 'nostd'>('idle') // nostd = 마스터코드명이 표준단어·표준용어 아님
  const [via, setVia] = useState<'TERM' | 'WORD' | null>(null)
  const [cls, setCls] = useState('')
  const [desc, setDesc] = useState('')
  const [useYn, setUseYn] = useState<'Y' | 'N'>('Y')
  const [msg, setMsg] = useState('')
  // 승인 선택 — 즉시 승인(자기 승인)은 SELF_APPROVE 권한(SYS·DA, 요금제4)만, 신청사유는 선택
  const [perms, setPerms] = useState<string[]>([])
  const [selfApv, setSelfApv] = useState(false)
  const [rsn, setRsn] = useState('')
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setPerms(j.perms ?? []))
  }, [areaId])
  const selfApprover = perms.includes('SELF_APPROVE')
  const apvOpt = () => ({ ...(selfApprover && selfApv ? { self_apv: true } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) })

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.kind !== 'ALL' ? { kind: cond.kind } : {}), ...(cond.sts ? { sts: cond.sts } : {}) })
    const [j, o] = await Promise.all([piFetch(`${base}?${sp}`).then((r) => r.json()), piFetch(base).then((r) => r.json())])
    if (o.ok) setOpts(o.items)
    if (!j.ok) return setMsg(j.message)
    setCodes(j.items)
    setTotal(j.total)
    setCnt(j.cnt ?? {})
  }, [base, cond])
  useEffect(() => {
    void load()
  }, [load])

  const codeNm = master.trim().replace(/\s+/g, '') + CD_KIND[kind].nm // 예 남녀 + 구분코드 = 남녀구분코드
  // 마스터코드명·구분이 바뀌면 0.4초 뒤 ① 마스터코드명 = 표준단어(조합)·표준용어인지(아니면 사용 불가) ② 코드명과 같은 이름의 확정 표준용어 조회
  //  (코드형 도메인 여부는 서버가 등록 때 확인, 마스터 지시 2026-10-20)
  useEffect(() => {
    setTerm(null)
    setVia(null)
    if (!master.trim()) return setLook('idle')
    setLook('busy')
    let live = true
    const h = setTimeout(async () => {
      const m = await (await piFetch(`/api/areas/${areaId}/codes/master?nm=${encodeURIComponent(master.trim())}`)).json()
      if (!live) return
      if (!m.ok || !m.std) return setLook('nostd')
      setVia(m.std)
      const j = await (await piFetch(`/api/areas/${areaId}/terms?q=${encodeURIComponent(codeNm)}&sts=CNFM&size=20`)).json()
      if (!live) return
      const hit = j.ok ? ((j.terms as Term[]).find((x) => x.term_log_nm === codeNm) ?? null) : null
      setTerm(hit)
      setLook(hit ? 'idle' : 'none')
    }, 400)
    return () => {
      live = false
      clearTimeout(h)
    }
  }, [areaId, codeNm, master])
  const reset = () => {
    setEdit(null)
    setTerm(null)
    setMaster('')
    setCls('')
    setDesc('')
    setUseYn('Y')
    setRsn('')
  }
  // 결과 문구(단어 화면과 같음) — 승인 신청 접수 / 반려 행 재신청 / 즉시 반영(자기 승인·반려 행 삭제)
  const done = async (j: { ok: boolean; message?: string; requested?: boolean; resubmitted?: boolean; item?: { cd_id?: string } }, ok: string) => {
    setMsg(!j.ok ? (j.message ?? '') : j.resubmitted ? '재신청을 접수했습니다' : j.requested ? '승인 신청을 접수했습니다(승인 후 사용 가능)' : ok)
    if (j.ok) {
      if (j.item?.cd_id && !edit) setSelId(j.item.cd_id) // 새 코드기본 = 바로 코드상세 등록 대상
      reset()
      await load()
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = { cd_cls_nm: cls.trim() || null, cd_desc: desc.trim() || null, use_yn: useYn }
    if (edit) {
      await done(await (await piFetch(`${base}/${encodeURIComponent(edit.cd_id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ver_no: edit.ver_no, ...body, ...apvOpt() }) })).json(), '수정·승인 완료')
      return
    }
    if (!term) return setMsg(`확정 표준용어 '${codeNm}' 가 없습니다 — 표준용어를 먼저 신청·승인하십시오`)
    await done(await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ term_id: term.term_id, ...body, ...apvOpt() }) })).json(), '등록·승인 완료')
  }
  // 반려 행 = 바로 삭제(서버 규칙), 승인완료 행 = 즉시 승인 선택 시 바로 삭제, 그 외 삭제 신청(승인 후 삭제)
  const remove = async (c: Code) => {
    const now = c.std_sts_cd === 'RJCT' || (selfApprover && selfApv)
    if (!confirm(`${c.std_term?.term_log_nm} 코드기본을 ${now ? '바로 삭제' : '삭제 신청(승인 후 삭제)'}합니다`)) return
    const sp = new URLSearchParams({ ver_no: String(c.ver_no), ...(selfApprover && selfApv ? { self_apv: '1' } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) })
    const j = await (await piFetch(`${base}/${encodeURIComponent(c.cd_id)}?${sp}`, { method: 'DELETE' })).json()
    if (j.ok && !j.requested && selId === c.cd_id) setSelId('')
    await done(j, '삭제했습니다')
  }

  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (p: number) => setCond({ ...cond, page: Math.min(Math.max(1, p), pages) })

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">표준코드</h1>

      {/* 공통코드 명명법·설계 원칙(노트 4장 p141·142·145) */}
      <section className="mt-3 grid gap-3 rounded border border-[#d5ddec] bg-[#f6f8fc] p-3 text-sm lg:grid-cols-[2fr_1fr]">
        <div>
          <p className="font-semibold">공통코드는 3가지 이름만 씁니다 — 코드기본 : 코드상세 = 1 : N, 코드기본 주식별자 = 코드 영문 표준용어(예 SEX_DIV_CD)</p>
          <ul className="mt-1 space-y-0.5">
            {(Object.keys(CD_KIND) as CdKind[]).map((k) => (
              <li key={k}>
                <span className={`mr-1 rounded px-1.5 py-0.5 text-xs font-semibold ${KIND_TONE[k]}`}>{CD_KIND[k].nm}</span>
                {CD_KIND[k].desc} <span className="text-gray-500">예) {CD_KIND[k].ex}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-gray-600">그 외 코드(예 : ~상태코드·은행코드)는 공통코드가 아닙니다 — 별도 기본테이블(기준 엔터티)로 관리하십시오.</p>
        </div>
        <div className="text-gray-700">
          <p className="font-semibold">코드상세 설계 원칙</p>
          <p>성격 동일 · 상호 배타(코드값·코드값명 중복 불가) · 전체 합집합 · 상세화 수준 유사</p>
          <p className="mt-1 text-xs text-gray-500">코드값·코드값명 외 속성이 있거나, 외부에서 받거나, 자주 바뀌거나, 이력이 필요하면 개별 엔터티로 관리합니다.</p>
        </div>
      </section>

      <div className="mt-6 space-y-6">
        {/* 코드기본 등록·수정 — 조회 위, 표준용어 등록 폼과 같은 모양(마스터 지시 2026-10-20) */}
        <form onSubmit={submit} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
          <h2 className={`px-5 py-2.5 text-base font-semibold text-white ${edit ? 'bg-gradient-to-r from-[#b45309] to-[#d97706]' : 'bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e]'}`}>{edit ? `코드기본 수정 : ${edit.std_term?.term_log_nm}` : '코드기본 등록'}</h2>
          <div className="flex flex-wrap items-end gap-2 p-5 [&_input]:border-[#b8c6e0] [&_input]:bg-white [&_select]:border-[#b8c6e0] [&_select]:bg-white">
            {!edit && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <input value={master} onChange={(e) => setMaster(e.target.value)} placeholder="마스터코드명(예 : 남녀, 지불수단, 거래)" maxLength={200} className="min-w-48 flex-1 rounded border px-3 py-2" aria-label="마스터코드명" />
                <select value={kind} onChange={(e) => setKind(e.target.value as CdKind)} className="rounded border px-3 py-2" aria-label="코드 구분" title={CD_KIND[kind].desc}>
                  {(Object.keys(CD_KIND) as CdKind[]).map((k) => (
                    <option key={k} value={k} title={`${CD_KIND[k].desc} — 예) ${CD_KIND[k].ex}`}>
                      {CD_KIND[k].nm}
                    </option>
                  ))}
                </select>
                <span>
                  = <strong>{master.trim() ? codeNm : `○○${CD_KIND[kind].nm}`}</strong>
                </span>
                {look === 'busy' && <span className="text-xs text-gray-500">표준 확인 중…</span>}
                {via && <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">마스터코드명 = {via === 'TERM' ? '표준용어' : '표준단어'}</span>}
                {look === 'nostd' && (
                  <span className="text-red-700">
                    마스터코드명 &apos;{master.trim()}&apos; 은(는) 표준단어·표준용어가 아닙니다 —{' '}
                    <Link href={`/areas/${areaId}/words?new=${encodeURIComponent(master.trim().replace(/\s+/g, ''))}`} className="underline">
                      표준단어 신청
                    </Link>
                  </span>
                )}
                {term && (
                  <span className="rounded bg-amber-100 px-2 py-1">
                    확정 표준용어 · 코드ID <span className="font-mono font-semibold">{term.term_phy_nm}</span> · {term.std_dom?.dom_nm}
                  </span>
                )}
                {look === 'none' && (
                  <span className="text-red-700">
                    확정 표준용어 &apos;{codeNm}&apos; 없음 —{' '}
                    <Link href={`/areas/${areaId}/terms?new=${encodeURIComponent(codeNm)}`} className="underline">
                      표준용어 신청
                    </Link>
                  </span>
                )}
                <p className="w-full text-xs text-gray-500">
                  {CD_KIND[kind].nm} : {CD_KIND[kind].desc} (예 {CD_KIND[kind].ex})
                </p>
              </div>
            )}
            <input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="코드분류(예 : 공통·결제)" maxLength={200} className="min-w-40 flex-1 rounded border px-3 py-2" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" maxLength={4000} className="min-w-40 flex-1 rounded border px-3 py-2" />
            <select value={useYn} onChange={(e) => setUseYn(e.target.value as 'Y' | 'N')} className="rounded border px-3 py-2" aria-label="사용여부">
              <option value="Y">사용</option>
              <option value="N">미사용</option>
            </select>
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <button className="btn-3d px-8">{edit ? (edit.std_sts_cd === 'RJCT' ? '수정 후 재신청' : '수정 저장') : '등록'}</button>
            {edit && (
              <button type="button" onClick={reset} className="btn-3d">
                취소
              </button>
            )}
            {msg && (
              <p role="status" className="w-full font-medium text-[#1f3a68]">
                {msg}
              </p>
            )}
          </div>
        </form>

        {/* 코드기본 조회 — 표준용어 조회와 같은 표·페이지 단위 조회 */}
        <section>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setCond({ ...cond, kw: q.trim(), page: 1 })
            }}
            className="flex flex-wrap gap-2"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색명(코드명 또는 코드ID)" className="min-w-[12rem] flex-1 rounded border px-3 py-2 text-sm" />
            <select value={cond.kind} onChange={(e) => setCond({ ...cond, kind: e.target.value as Cond['kind'], page: 1 })} className="rounded border px-2 py-2 text-sm" aria-label="조회 코드 구분">
              <option value="ALL">구분 전체 ({(cnt.ALL ?? 0).toLocaleString()})</option>
              {(Object.keys(CD_KIND) as CdKind[]).map((k) => (
                <option key={k} value={k}>
                  {CD_KIND[k].nm} ({(cnt[k] ?? 0).toLocaleString()})
                </option>
              ))}
            </select>
            <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
            <button className="btn-3d">검색</button>
          </form>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap">
              <thead>
                <tr className="thead-3d text-center">
                  {['#', '코드 구분', '코드분류', '코드명(코드기본)', '코드ID(주식별자)', '도메인', '설명', '사용', '상태', '처리'].map((h) => (
                    <th key={h} className="border px-2 py-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="border px-2 py-4 text-center text-gray-500">
                      등록된 코드기본이 없습니다
                    </td>
                  </tr>
                ) : (
                  codes.map((c, i) => {
                    const k = kindOf(c)
                    return (
                      <tr key={c.cd_id} className={selId === c.cd_id || edit?.cd_id === c.cd_id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                        <td className="border px-2 py-1 text-center">{k ? <span className={`rounded px-1.5 py-0.5 font-semibold ${KIND_TONE[k]}`}>{CD_KIND[k].nm}</span> : <span className="text-red-700">공통코드 아님</span>}</td>
                        <td className="border px-2 py-1">{c.cd_cls_nm}</td>
                        <td className="border px-2 py-1 font-medium">
                          <button onClick={() => setSelId(c.cd_id)} className="text-blue-700 underline" title="코드상세 보기·등록">
                            {c.std_term?.term_log_nm}
                          </button>
                        </td>
                        <td className="border px-2 py-1 font-mono font-semibold">{c.cd_id}</td>
                        <td className="border px-2 py-1">{c.std_term?.std_dom?.dom_nm}</td>
                        <td className="border px-2 py-1">{c.cd_desc}</td>
                        <td className="border px-2 py-1 text-center">{c.use_yn}</td>
                        <StsCell sts={c.std_sts_cd} pend={c.pend_act} apv={`/areas/${areaId}/approvals?tp=CD`} />
                        <td className="border px-2 py-1 text-center">
                          {c.std_sts_cd === 'REQ' || c.pend_act ? (
                            <ApvLink apv={`/areas/${areaId}/approvals?tp=CD`} />
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEdit(c)
                                  setCls(c.cd_cls_nm ?? '')
                                  setDesc(c.cd_desc ?? '')
                                  setUseYn(c.use_yn)
                                  window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}
                                className="mr-2 text-blue-700 underline"
                              >
                                {c.std_sts_cd === 'RJCT' ? '재신청' : '수정'}
                              </button>
                              <button onClick={() => void remove(c)} className="text-red-700 underline">
                                삭제
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* 페이지 이동(표준용어 조회와 같음) */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-600">
              총 {total.toLocaleString()}건 · {cond.page} / {pages} 페이지
            </span>
            <div className="mx-auto flex items-center gap-1">
              <button onClick={() => go(1)} disabled={cond.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                «
              </button>
              <button onClick={() => go(cond.page - 1)} disabled={cond.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                ‹
              </button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => Math.min(Math.max(1, cond.page - 2), Math.max(1, pages - 4)) + i).map((p) => (
                <button key={p} onClick={() => go(p)} aria-current={p === cond.page ? 'page' : undefined} className={`min-w-8 rounded border px-2 py-1 ${p === cond.page ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : ''}`}>
                  {p}
                </button>
              ))}
              <button onClick={() => go(cond.page + 1)} disabled={cond.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
                ›
              </button>
              <button onClick={() => go(pages)} disabled={cond.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
                »
              </button>
            </div>
            <select value={cond.size} onChange={(e) => setCond({ ...cond, size: Number(e.target.value), page: 1 })} className="rounded border px-2 py-1" aria-label="페이지당 건수">
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}건씩
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>

      {/* 코드상세(코드 인스턴스) 등록·조회 — 코드기본 1 : N */}
      <div className="mt-6">
        <CodeDtl areaId={areaId} opts={opts} cdId={selId} onPick={setSelId} />
        {selId && cdKind(opts.find((o) => o.cd_id === selId)?.std_term?.term_log_nm) === 'DIV' && <p className="mt-1 text-xs text-gray-600">구분코드는 값 2~3개로 고정된 코드만 씁니다(최대 3개) — 4개 이상이거나 늘어날 수 있으면 유형코드로 정의하십시오.</p>}
      </div>
    </main>
  )
}

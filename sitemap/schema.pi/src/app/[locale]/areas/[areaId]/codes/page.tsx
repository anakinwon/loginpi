'use client'
// 표준코드(공통코드) 화면 — 메인 메뉴 표준코드. 공통코드 = 이름이 ~구분코드·~종류코드·~유형코드 인 확정 표준용어(코드형 도메인)만(마스터 지시 2026-10-20, 노트 4장 p141~147)
//  코드기본 : 코드상세 = 1:N — 위 등록 폼, 아래 조회(표준용어 조회와 같은 표·페이지 단위 조회), 코드기본을 고르면 맨 아래 코드상세(코드값) 표. 그 외 코드는 공통코드 아님 → 별도 기본테이블(기준 엔터티)
//  조회 = 표준 메뉴 권한, 등록·수정·삭제 = 표준 신청 권한. 코드기본은 단어·용어와 같은 승인 절차(신청 → 승인완료 후 사용, 즉시 승인 = SELF_APPROVE), 코드상세는 바로 반영
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { use, useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { PageHead } from '@/components/page-head'
import { CD_KIND, cdKind, type CdKind } from '@/lib/std-code-rule'
import { ApvFields, ApvLink, StsCell, StsFilter } from '../words/word-board'
import { Pager } from '../terms/term-board'
import CodeDtl, { type BasOpt } from './code-dtl'

type Code = { cd_id: string; term_id: string; cd_cls_nm: string | null; cd_desc: string | null; use_yn: 'Y' | 'N'; ver_no: number; std_sts_cd: string; pend_act: string | null; std_term: { term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null } | null }
type Term = { term_id: string; term_log_nm: string; term_phy_nm: string; std_dom: { dom_nm: string } | null }
type Cond = { kind: CdKind | 'ALL'; kw: string; sts: string; page: number; size: number }

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
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead
        title="표준코드"
        info={
          <div className="space-y-2">
            <p>공통코드는 3가지 이름만 씁니다. 코드기본 : 코드상세 = 1 : N, 코드기본 주식별자 = 코드 영문 표준용어(예 SEX_DIV_CD)</p>
            <ul className="space-y-1">
              {(Object.keys(CD_KIND) as CdKind[]).map((k) => (
                <li key={k}>
                  <span className="badge me-1">{CD_KIND[k].nm}</span>
                  {CD_KIND[k].desc} (예 {CD_KIND[k].ex})
                </li>
              ))}
            </ul>
            <p>그 외 코드(예 : ~상태코드·은행코드)는 공통코드가 아닙니다. 별도 기본테이블(기준 엔터티)로 관리합니다.</p>
            <p>코드상세 설계 원칙 : 성격 동일 · 상호 배타(코드값·코드값명 중복 불가) · 전체 합집합 · 상세화 수준 유사. 코드값·코드값명 외 속성이 있거나, 외부에서 받거나, 자주 바뀌거나, 이력이 필요하면 개별 엔터티로 관리합니다.</p>
          </div>
        }
      />

      <div className="space-y-6">
        {/* 코드기본 등록·수정 — 조회 위, 표준용어 등록 폼과 같은 모양(마스터 지시 2026-10-20) */}
        <form onSubmit={submit} className="panel">
          <h2 className="panel-head" data-mode={edit ? 'edit' : undefined}>
            {edit ? `코드기본 수정 : ${edit.std_term?.term_log_nm}` : '코드기본 등록'}
          </h2>
          <div className="panel-body flex flex-wrap items-center gap-2">
            {!edit && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <input value={master} onChange={(e) => setMaster(e.target.value)} placeholder="마스터코드명" maxLength={200} className="input min-w-48 flex-1" aria-label="마스터코드명" aria-required="true" title="예 : 남녀, 지불수단, 거래" />
                <select value={kind} onChange={(e) => setKind(e.target.value as CdKind)} className="input w-auto" aria-label="코드 구분" title={CD_KIND[kind].desc}>
                  {(Object.keys(CD_KIND) as CdKind[]).map((k) => (
                    <option key={k} value={k} title={`${CD_KIND[k].desc} — 예) ${CD_KIND[k].ex}`}>
                      {CD_KIND[k].nm}
                    </option>
                  ))}
                </select>
                <span className="text-ink-2">
                  = <span className="font-medium text-ink">{master.trim() ? codeNm : `○○${CD_KIND[kind].nm}`}</span>
                </span>
                {look === 'busy' && <span className="text-xs text-ink-3">확인 중</span>}
                {via && (
                  <span className="badge" data-tone="ok">
                    {via === 'TERM' ? '표준용어' : '표준단어'}
                  </span>
                )}
                {look === 'nostd' && (
                  <span className="text-dense text-danger">
                    마스터코드명 &apos;{master.trim()}&apos; 은(는) 표준단어·표준용어가 아닙니다 :{' '}
                    <Link href={`/areas/${areaId}/words?new=${encodeURIComponent(master.trim().replace(/\s+/g, ''))}`} className="underline">
                      표준단어 신청
                    </Link>
                  </span>
                )}
                {term && (
                  <span className="flex items-center gap-2" title="확정 표준용어 · 코드ID">
                    <span className="chip-phy" data-size="lg">
                      {term.term_phy_nm}
                    </span>
                    <span className="text-xs text-ink-3">{term.std_dom?.dom_nm}</span>
                  </span>
                )}
                {look === 'none' && (
                  <span className="text-dense text-danger">
                    확정 표준용어 &apos;{codeNm}&apos; 없음 :{' '}
                    <Link href={`/areas/${areaId}/terms?new=${encodeURIComponent(codeNm)}`} className="underline">
                      표준용어 신청
                    </Link>
                  </span>
                )}
                <p className="hint w-full">
                  {CD_KIND[kind].nm} : {CD_KIND[kind].desc} (예 {CD_KIND[kind].ex})
                </p>
              </div>
            )}
            <input value={cls} onChange={(e) => setCls(e.target.value)} placeholder="코드분류" aria-label="코드분류" title="예 : 공통·결제" maxLength={200} className="input min-w-40 flex-1" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명" aria-label="설명" maxLength={4000} className="input min-w-40 flex-1" />
            <select value={useYn} onChange={(e) => setUseYn(e.target.value as 'Y' | 'N')} className="input w-auto" aria-label="사용여부">
              <option value="Y">사용</option>
              <option value="N">미사용</option>
            </select>
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <div className="ms-auto flex gap-2">
              {edit && (
                <button type="button" onClick={reset} className="btn-key">
                  취소
                </button>
              )}
              <button className="btn-3d">{edit ? (edit.std_sts_cd === 'RJCT' ? '수정 후 재신청' : '수정 저장') : '등록'}</button>
            </div>
            {msg && (
              <p role="status" className="w-full text-dense text-ink-2">
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
            className="flex flex-wrap items-center gap-2"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" aria-label="검색명(코드명 또는 코드ID)" title="코드명 또는 코드ID" className="input min-w-48 flex-1" />
            <select value={cond.kind} onChange={(e) => setCond({ ...cond, kind: e.target.value as Cond['kind'], page: 1 })} className="input w-auto" aria-label="조회 코드 구분">
              <option value="ALL">구분 전체 ({(cnt.ALL ?? 0).toLocaleString()})</option>
              {(Object.keys(CD_KIND) as CdKind[]).map((k) => (
                <option key={k} value={k}>
                  {CD_KIND[k].nm} ({(cnt[k] ?? 0).toLocaleString()})
                </option>
              ))}
            </select>
            <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
            <button className="btn-key">검색</button>
          </form>
          <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
              <thead>
                <tr className="thead-3d text-center">
                  {['#', '코드 구분', '코드분류', '코드명(코드기본)', '코드ID(주식별자)', '도메인', '설명', '사용', '상태', '처리'].map((h) => (
                    <th key={h} className="border-b px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-ink-3">
                      검색 결과 없음
                    </td>
                  </tr>
                ) : (
                  codes.map((c, i) => {
                    const k = kindOf(c)
                    return (
                      <tr key={c.cd_id} aria-selected={selId === c.cd_id || undefined} data-mode={edit?.cd_id === c.cd_id ? 'edit' : undefined}>
                        <td className="border px-3 py-1 text-end font-mono text-xs text-ink-3 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                        <td className="border px-3 py-1 text-center">
                          {k ? (
                            <span className="badge">{CD_KIND[k].nm}</span>
                          ) : (
                            <span className="badge" data-tone="danger">
                              공통코드 아님
                            </span>
                          )}
                        </td>
                        <td className="border px-3 py-1">{c.cd_cls_nm}</td>
                        <td className="border px-3 py-1 font-medium">
                          <button onClick={() => setSelId(c.cd_id)} className="text-accent-ink hover:underline" title="코드상세 보기·등록">
                            {c.std_term?.term_log_nm}
                          </button>
                        </td>
                        <td className="border px-3 py-1">
                          <span className="chip-phy">{c.cd_id}</span>
                        </td>
                        <td className="border px-3 py-1">{c.std_term?.std_dom?.dom_nm}</td>
                        <td className="border px-3 py-1 text-ink-2">{c.cd_desc}</td>
                        <td className="border px-3 py-1 text-center font-mono text-xs text-ink-3">{c.use_yn}</td>
                        <StsCell sts={c.std_sts_cd} pend={c.pend_act} apv={`/areas/${areaId}/approvals?tp=CD`} />
                        <td className="border px-3 py-1 text-center">
                          {c.std_sts_cd === 'REQ' || c.pend_act ? (
                            <ApvLink apv={`/areas/${areaId}/approvals?tp=CD`} />
                          ) : (
                            <span className="inline-flex gap-1">
                              <button
                                onClick={() => {
                                  setEdit(c)
                                  setCls(c.cd_cls_nm ?? '')
                                  setDesc(c.cd_desc ?? '')
                                  setUseYn(c.use_yn)
                                  window.scrollTo({ top: 0, behavior: 'smooth' })
                                }}
                                aria-label={c.std_sts_cd === 'RJCT' ? '재신청' : '수정'}
                                title={c.std_sts_cd === 'RJCT' ? '재신청' : '수정'}
                                className="btn-ghost btn-icon btn-sm"
                              >
                                <Pencil aria-hidden />
                              </button>
                              <button onClick={() => void remove(c)} aria-label="삭제" title="삭제" className="btn-ghost btn-icon btn-sm hover:text-danger">
                                <Trash2 aria-hidden />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager page={cond.page} pages={pages} total={total} size={cond.size} go={go} setSize={(size) => setCond({ ...cond, size, page: 1 })} />
        </section>

        {/* 코드상세(코드 인스턴스) 등록·조회 — 코드기본 1 : N */}
        <div>
          <CodeDtl areaId={areaId} opts={opts} cdId={selId} onPick={setSelId} />
          {selId && cdKind(opts.find((o) => o.cd_id === selId)?.std_term?.term_log_nm) === 'DIV' && <p className="hint">구분코드는 값 2~3개로 고정된 코드만 씁니다(최대 3개). 4개 이상이거나 늘어날 수 있으면 유형코드로 정의하십시오.</p>}
        </div>
      </div>
    </main>
  )
}

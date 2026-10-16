'use client'
import { piFetch } from '@pi/auth/client'
// 표준용어 조회·등록·수정·삭제(클라이언트) — /terms/analyze(분해 후보), /terms(목록 : page·size·상태 필터, 등록), /terms/[termId](도메인·설명 수정, 삭제 : ver_no), /domains(도메인 선택지 : 승인완료만)
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { can, type MbrRole } from '@/lib/roles'
import { ActorCells, ApvFields, ApvLink, StsCell, StsFilter, confirmSave, noEnterSubmit } from '../words/word-board'

interface Term {
  term_id: string
  term_log_nm: string
  term_phy_nm: string
  term_desc: string | null
  nstd_yn: string
  alw_val_txt: string | null
  disp_fmt_txt: string | null
  adm_cd_nm: string | null
  own_org_nm: string | null
  syn_txt: string | null
  std_sts_cd: string
  pend_act?: string | null
  regr_nm?: string | null
  std_reg_dtm?: string
  apv_nm?: string | null
  apv_dtm?: string | null
  ver_no: number
  std_dom: { dom_id: string; dom_nm: string; key_dom_nm: string } | null
}
interface Word {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
}
type Seg = { word: Word } | { unknown: string }
interface Candidate {
  segments: Seg[]
  complete: boolean
  term_log_nm?: string
  term_phy_nm?: string
  dup_log?: boolean
  dup_phy?: boolean
  rule_error?: string | null
}
const RULE_MSG: Record<string, string> = {
  TERM_SINGLE_WORD: '단어 2개 이상으로 구성해야 합니다',
  TERM_FORBIDDEN_WORD: '금칙어가 포함되어 있습니다',
  TERM_LAST_NOT_ATTR: '끝 단어가 속성 분류어가 아닙니다',
}

// 부가 칸(행안부 공통표준 수용) — 허용값·표현형식은 도메인과 다를 때만 입력
const EXT = [
  ['alw_val_txt', '허용값(도메인과 다를 때만)', 4000],
  ['disp_fmt_txt', '표현형식(도메인과 다를 때만)', 200],
  ['adm_cd_nm', '행정표준코드명', 200],
  ['own_org_nm', '소관기관명', 200],
  ['syn_txt', '이음동의어목록(쉼표 구분)', 4000],
] as const
type Ext = Record<(typeof EXT)[number][0], string>
const EMPTY_EXT: Ext = { alw_val_txt: '', disp_fmt_txt: '', adm_cd_nm: '', own_org_nm: '', syn_txt: '' }
// 목록 열 너비(#·논리 용어명·상태·물리 용어명·도메인·설명·작업) — 설명은 남는 폭
// 설명 = 표 폭의 30%, 나머지 열 = 값에 맞춰 자동(table-auto + 줄바꿈 없음)
const COL_W = ['', '', '', '', 'w-[30%]', '', '', '', '', '', '']
const INPUT = 'w-full rounded border px-3 py-2'

export default function TermBoard({ areaId }: { areaId: string }) {
  const base = `/api/areas/${areaId}/terms`
  const [terms, setTerms] = useState<Term[]>([])
  const [domains, setDomains] = useState<{ dom_id: string; dom_nm: string; key_dom_nm: string }[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  // 다른 화면(개념 모델 속성 추천 등)에서 ?new=용어명 으로 들어오면 등록 폼 용어명에 채움(분석 → 단어 조합·도메인 선택은 사용자가)
  useEffect(() => {
    const nm = new URLSearchParams(window.location.search).get('new')?.trim()
    if (nm) setName(nm.slice(0, 400))
  }, [])
  const [cands, setCands] = useState<Candidate[]>([])
  const [pick, setPick] = useState(0)
  const [domId, setDomId] = useState('')
  const [desc, setDesc] = useState('')
  const [ext, setExt] = useState<Ext>(EMPTY_EXT)
  const [msg, setMsg] = useState('')
  const [edit, setEdit] = useState<Term | null>(null)
  // 현재 사용자 역할(분류체계 조회 응답) — 승인권자 = 자기 승인 선택, 신청 권한 없음 = 조회 전용
  const [role, setRole] = useState<MbrRole | null>(null)
  const [selfApv, setSelfApv] = useState(false)
  const [rsn, setRsn] = useState('')
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setRole(j.role))
  }, [areaId])
  const selfApprover = !!role && can(role, 'SELF_APPROVE')
  const requester = !!role && can(role, 'REQUEST')
  // 승인 신청 선택 항목 — 자기 승인은 승인권자만, 신청사유는 입력했을 때만
  const apvOpt = () => ({ ...(selfApprover && selfApv ? { self_apv: true } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) })
  const reqMsg = (j: { requested?: boolean; resubmitted?: boolean }, okMsg: string) => (j.resubmitted ? '재신청을 접수했습니다' : j.requested ? '승인 신청을 접수했습니다(승인 후 사용 가능)' : okMsg)

  // 조회 조건(검색어·페이지·페이지 크기) — 바뀌면 서버에서 해당 페이지만 조회
  const [cond, setCond] = useState({ kw: '', sts: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.sts ? { sts: cond.sts } : {}) })
    const j = await (await piFetch(`${base}?${sp}`)).json()
    if (j.ok) {
      setTerms(j.terms)
      setTotal(j.total)
    } else setMsg(j.message)
  }, [base, cond])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    piFetch(`/api/areas/${areaId}/domains`)
      .then((r) => r.json())
      .then((j) => j.ok && setDomains(j.domains.filter((d: { std_sts_cd: string }) => d.std_sts_cd === 'CNFM'))) // 승인완료 도메인만 사용 가능
  }, [areaId])
  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (page: number) => setCond({ ...cond, page: Math.min(Math.max(1, page), pages) })

  // 용어명 분석(0.4초 지연) — 수정 중에는 구성 변경 불가라 분석하지 않음
  useEffect(() => {
    if (edit || !name.trim()) {
      setCands([])
      return
    }
    const t = setTimeout(async () => {
      const j = await (await piFetch(`${base}/analyze?name=${encodeURIComponent(name)}`)).json()
      setCands(j.ok ? j.candidates : [])
      setPick(0)
    }, 400)
    return () => clearTimeout(t)
  }, [name, base, edit])

  const cur = cands[pick]
  // 도메인 선택지 = 대표도메인명이 용어 끝 단어와 같은 도메인만(분류어가 도메인을 결정), 수정 중에는 현재 도메인의 대표도메인명 기준
  const lastSeg = cur?.segments[cur.segments.length - 1]
  const lastWord = edit ? (edit.std_dom?.key_dom_nm ?? null) : lastSeg && 'word' in lastSeg ? lastSeg.word.dic_log_nm : null
  const domChoices = lastWord ? domains.filter((d) => d.key_dom_nm === lastWord) : []
  useEffect(() => {
    if (domId && domains.length && !domChoices.some((d) => d.dom_id === domId)) setDomId('')
  }, [domId, domChoices, domains.length])
  const blocked = edit ? !domId : !cur?.complete || !!cur.rule_error || cur.dup_log || cur.dup_phy || !domId

  const reset = () => {
    setEdit(null)
    setName('')
    setDomId('')
    setDesc('')
    setExt(EMPTY_EXT)
    setCands([])
    setRsn('')
  }
  // 용어 구성(단어 조합)은 변경 불가 — 바꾸려면 삭제 후 재등록, 수정은 도메인·설명·부가 칸만
  const startEdit = (t: Term) => {
    setEdit(t)
    setName(t.term_log_nm)
    setDomId(t.std_dom?.dom_id ?? '')
    setDesc(t.term_desc ?? '')
    setExt(Object.fromEntries(EXT.map(([k]) => [k, t[k] ?? ''])) as Ext)
    setMsg('')
    window.scrollTo({ top: 0, behavior: 'smooth' }) // 등록·수정 영역이 목록 위에 있음
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (blocked) return
    if (!confirmSave(!!edit)) return
    let j
    if (edit) {
      const body = { ver_no: edit.ver_no, ...apvOpt(), dom_id: domId, term_desc: desc || null, ...Object.fromEntries(EXT.map(([k]) => [k, ext[k] || null])) }
      j = await (await piFetch(`${base}/${edit.term_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
      if (j.ok) setMsg(reqMsg(j, `용어 ${edit.term_log_nm} 수정·승인 완료`))
    } else {
      if (!cur) return
      const dic_ids = cur.segments.flatMap((s) => ('word' in s ? [s.word.dic_id] : []))
      const body = { dic_ids, dom_id: domId, ...(desc ? { term_desc: desc } : {}), ...Object.fromEntries(Object.entries(ext).filter(([, v]) => v)), ...apvOpt() }
      j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
      if (j.ok) setMsg(reqMsg(j, `표준용어 ${j.term.term_log_nm} 등록·승인 완료`))
    }
    if (!j.ok) {
      setMsg(j.message)
      return
    }
    reset()
    load()
  }
  const remove = async (t: Term) => {
    // 반려 행 = 즉시 삭제(서버 규칙), 승인권자 자기 승인 = 즉시 삭제, 그 외 삭제 신청
    const now = t.std_sts_cd === 'RJCT' || (selfApprover && selfApv)
    if (!confirm(`${t.term_log_nm} 용어를 ${now ? '즉시 삭제' : '삭제 신청'}합니다`)) return
    const j = await (await piFetch(`${base}/${t.term_id}?ver_no=${t.ver_no}${selfApprover && selfApv ? '&self_apv=1' : ''}`, { method: 'DELETE' })).json()
    setMsg(j.ok ? reqMsg(j, `용어 ${t.term_log_nm} 삭제`) : j.message)
    if (j.ok) {
      if (edit?.term_id === t.term_id) reset()
      load()
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={submit} onKeyDown={noEnterSubmit} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
        <h2 className={`px-5 py-2.5 text-base font-semibold text-white ${edit ? 'bg-gradient-to-r from-[#b45309] to-[#d97706]' : 'bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e]'}`}>
          {edit ? `용어 수정 : ${edit.term_log_nm}` : '용어 등록'}
        </h2>
        <fieldset disabled={!requester} className="p-5 disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 [&_input:not([type=radio])]:border-[#b8c6e0] [&_input:not([type=radio])]:bg-white [&_input:not([type=radio])]:focus:outline-[#3b5f9e] [&_select]:border-[#b8c6e0] [&_select]:bg-white">
            <div className="md:col-span-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="용어명 입력(필수, 예 : 고객번호)"
                className={`${INPUT} read-only:text-gray-500`}
                maxLength={200}
                readOnly={!!edit}
                title={edit ? '용어 구성은 바꿀 수 없습니다(삭제 후 재등록)' : undefined}
              />
              {edit && <p className="mt-1 font-mono text-gray-600">물리 용어명 : {edit.term_phy_nm}</p>}
            </div>
            <div className="md:col-span-2">
              <select value={domId} onChange={(e) => setDomId(e.target.value)} className={INPUT} aria-label="도메인">
                <option value="">{lastWord ? `도메인 선택(필수, 대표도메인명 = ${lastWord})` : '용어 분해 후 도메인 선택'}</option>
                {domChoices.map((d) => (
                  <option key={d.dom_id} value={d.dom_id}>
                    {d.dom_nm}
                  </option>
                ))}
              </select>
              {lastWord && domains.length > 0 && domChoices.length === 0 && (
                <p className="mt-1 text-red-700">
                  대표도메인명이 &apos;{lastWord}&apos;인 도메인이 없습니다 :{' '}
                  <Link href={`/areas/${areaId}/domains`} className="underline">
                    표준도메인 등록
                  </Link>
                </p>
              )}
            </div>
            {(cands.length > 0 || cur) && (
              <div className="space-y-2 rounded border border-[#b8c6e0] bg-white p-3 md:col-span-2 lg:col-span-4">
                <fieldset className="space-y-1">
                  <legend className="text-gray-600">단어 분해 후보</legend>
                  {cands.map((c, i) => (
                    <label key={i} className="flex items-start gap-2">
                      <input type="radio" name="cand" checked={pick === i} onChange={() => setPick(i)} className="mt-1" />
                      <span>
                        {c.segments.map((s, k) =>
                          'word' in s ? (
                            <span key={k} className="mr-1 rounded bg-gray-100 px-1">
                              {s.word.dic_log_nm}
                              <span className="text-gray-500">({s.word.dic_phy_nm})</span>
                            </span>
                          ) : (
                            <span key={k} className="mr-1 rounded bg-red-50 px-1 text-red-700">
                              {s.unknown}(미등록)
                            </span>
                          ),
                        )}
                      </span>
                    </label>
                  ))}
                </fieldset>
                {cur && !cur.complete && (
                  <p className="text-red-700">
                    미등록 단어가 있습니다 :{' '}
                    <Link href={`/areas/${areaId}/words`} className="underline">
                      표준단어 등록
                    </Link>
                  </p>
                )}
                {cur?.complete && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <p>
                      논리 용어명 : <b>{cur.term_log_nm}</b>
                      {cur.dup_log && <span className="text-red-700"> (이미 있음)</span>}
                    </p>
                    <p>
                      물리 용어명 : <b className="font-mono">{cur.term_phy_nm}</b>
                      {cur.dup_phy && <span className="text-red-700"> (이미 있음)</span>}
                    </p>
                    {cur.rule_error && <p className="text-red-700">{RULE_MSG[cur.rule_error] ?? cur.rule_error}</p>}
                  </div>
                )}
              </div>
            )}
            <div className="md:col-span-2">
              <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="용어 설명" className={INPUT} maxLength={4000} />
            </div>
            {EXT.map(([k, label, max], i) => (
              <div key={k} className={i === 0 ? 'md:col-span-2' : undefined}>
                <input value={ext[k]} onChange={(e) => setExt({ ...ext, [k]: e.target.value })} placeholder={label} className={INPUT} maxLength={max} />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            <p className="text-xs text-gray-500">용어는 표준단어 2개 이상으로 구성하고 끝 단어는 속성 분류어여야 합니다. 등록 후 구성은 바꿀 수 없습니다(도메인·설명·부가 칸만 수정)</p>
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <div className="ml-auto flex gap-2">
              {edit && (
                <button type="button" onClick={reset} className="rounded border bg-white px-5 py-2">
                  취소
                </button>
              )}
              <button disabled={blocked} className="btn-3d px-8 disabled:opacity-40">
                {edit ? (edit.std_sts_cd === 'RJCT' ? '수정 후 재신청' : '수정 저장') : '등록'}
              </button>
            </div>
          </div>
          {role && !requester && <p className="mt-2 font-medium text-gray-600">조회 권한 : 등록·수정·삭제는 신청 권한(데이터아키텍트·표준담당자·모델러)만 가능합니다</p>}
          {msg && (
            <p role="status" className="mt-2 font-medium text-[#1f3a68]">
              {msg}
            </p>
          )}
        </fieldset>
      </form>

      <section>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setCond({ ...cond, kw: q.trim(), page: 1 })
          }}
          className="flex gap-2"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색명(논리·물리 용어명)" className="flex-1 rounded border px-3 py-2 text-sm" />
          <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
          <button className="btn-3d">검색</button>
          <a href={`/api/areas/${areaId}/export/terms${cond.kw ? `?q=${encodeURIComponent(cond.kw)}` : ''}`} className="btn-3d btn-3d-green" download>
            엑셀 다운로드
          </a>
        </form>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse [&_td]:whitespace-nowrap text-[0.7rem] [&_.text-xs]:text-[0.6rem]">
            <colgroup>
              {COL_W.map((w, i) => (
                <col key={i} className={w} />
              ))}
            </colgroup>
            <thead>
              <tr className="thead-3d text-center">
                {['#', '논리 용어명', '물리 용어명', '도메인', '설명', '등록자', '등록일시', '상태', '승인자', '승인일시', '처리'].map((h, i) => (
                  <th key={i} className="whitespace-nowrap border px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {terms.length === 0 ? (
                <tr>
                  <td colSpan={11} className="border px-2 py-4 text-center text-gray-500">
                    등록된 용어가 없습니다
                  </td>
                </tr>
              ) : (
                terms.map((t, i) => (
                  <tr key={t.term_id} className={edit?.term_id === t.term_id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                    <td className="border px-2 py-1 font-medium">
                      {t.term_log_nm}
                      {t.nstd_yn === 'Y' && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-normal text-amber-800" title="표준 규칙 예외로 수용한 용어">비표준</span>}
                    </td>
                    <td className="border px-2 py-1 font-mono break-all">{t.term_phy_nm}</td>
                    <td className="border px-2 py-1 break-all">{t.std_dom?.dom_nm}</td>
                    <td className="border px-2 py-1 !whitespace-normal">
                      {t.term_desc}
                      {EXT.filter(([k]) => t[k]).map(([k, label]) => (
                        <div key={k} className="text-xs text-gray-500">
                          {label.replace(/\(.*\)/, '')} : {t[k]}
                        </div>
                      ))}
                    </td>
                    <ActorCells nm={t.regr_nm} d={t.std_reg_dtm} />
                    <StsCell sts={t.std_sts_cd} pend={t.pend_act} apv={`/areas/${areaId}/approvals?tp=TERM`} />
                    <ActorCells nm={t.apv_nm} d={t.apv_dtm} />
                    <td className="whitespace-nowrap border px-2 py-1 text-center">
                      {t.std_sts_cd === 'REQ' || t.pend_act ? (
                        <ApvLink apv={`/areas/${areaId}/approvals?tp=TERM`} />
                      ) : (
                        requester && (
                          <>
                            <button onClick={() => startEdit(t)} className="mr-2 text-blue-700 underline">
                              수정
                            </button>
                            <button onClick={() => remove(t)} className="text-red-700 underline">
                              삭제
                            </button>
                          </>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-600">
            총 {total.toLocaleString()}건 · {cond.page} / {pages} 페이지
          </span>
          <div className="mx-auto flex items-center gap-1">
            {[
              ['«', 1],
              ['‹', cond.page - 1],
            ].map(([l, p]) => (
              <button key={l} onClick={() => go(p as number)} disabled={cond.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                {l}
              </button>
            ))}
            {Array.from({ length: Math.min(5, pages) }, (_, i) => Math.min(Math.max(1, cond.page - 2), Math.max(1, pages - 4)) + i).map((p) => (
              <button key={p} onClick={() => go(p)} aria-current={p === cond.page ? 'page' : undefined} className={`min-w-8 rounded border px-2 py-1 ${p === cond.page ? 'border-[#1f3a68] bg-[#1f3a68] text-white' : ''}`}>
                {p}
              </button>
            ))}
            {[
              ['›', cond.page + 1],
              ['»', pages],
            ].map(([l, p]) => (
              <button key={l} onClick={() => go(p as number)} disabled={cond.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
                {l}
              </button>
            ))}
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
  )
}

'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 분류어 관리 화면 — 단어에 엔터티 분류어 지정·테이블 접미어 지정·변경·해제 신청(단어 수정 승인 절차, sql/017), 목록 조회
// 기준 : 정의서 §8.4 데이터 성격 접미어 + 기관 확장(2026-10-16 마스터 확정), 단어 물리명(컬럼용)과 테이블 접미어(테이블명용)는 별도
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { can, type MbrRole } from '@/lib/roles'
import { ActorCells, ApvFields, ApvLink, StsCell, StsFilter, noEnterSubmit } from '../words/word-board'

interface Item {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_desc: string | null
  ent_clss_yn: string
  tbl_sfx_txt: string | null
  std_sts_cd: string
  ver_no: number
  regr_nm?: string | null
  std_reg_dtm?: string
  apv_nm?: string | null
  apv_dtm?: string | null
  pend: { req_id: string; ent: string | null; sfx?: string | null } | null
}
interface Cand {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_desc: string | null
  forbid_yn: string
  ent_clss_yn: string
  ver_no: number
}
const SFX_RE = /^_[A-Z0-9]{1,4}$/
const norm = (s: string) => (s.trim() ? `_${s.trim().replace(/^_+/, '').toUpperCase()}` : '')
// 설명 = 표 폭의 30%, 나머지 열 = 값에 맞춰 자동
const COL_W = ['', '', '', '', '', 'w-[30%]', '', '', '', '', '', '']

export default function EntityClassPage({ params }: { params: Promise<{ areaId: string }> }) {
  const { areaId } = use(params)
  const [items, setItems] = useState<Item[]>([])
  const [cands, setCands] = useState<Cand[]>([])
  const [pick, setPick] = useState('')
  const [sfx, setSfx] = useState('')
  const [edit, setEdit] = useState<{ id: string; sfx: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [role, setRole] = useState<MbrRole | null>(null)
  const [selfApv, setSelfApv] = useState(false)
  const [rsn, setRsn] = useState('')
  const [q, setQ] = useState('')
  const [cond, setCond] = useState({ kw: '', sts: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  const [used, setUsed] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setRole(j.role))
  }, [areaId])
  const selfApprover = !!role && can(role, 'SELF_APPROVE')
  const requester = !!role && can(role, 'REQUEST')

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.sts ? { sts: cond.sts } : {}) })
    const [l, all] = await Promise.all([piFetch(`/api/areas/${areaId}/entity-classes?${sp}`).then((r) => r.json()), piFetch(`/api/areas/${areaId}/entity-classes?size=100`).then((r) => r.json())])
    if (l.ok) {
      setItems(l.items)
      setTotal(l.total)
    } else setMsg(l.message)
    // 사용 중인 접미어(중복 안내용)
    if (all.ok) setUsed(new Map((all.items as Item[]).filter((x) => x.tbl_sfx_txt).map((x) => [x.tbl_sfx_txt as string, x.dic_log_nm])))
  }, [areaId, cond])
  useEffect(() => {
    load()
  }, [load])
  // 지정 후보 검색(승인완료·금칙어 아님·아직 엔터티 분류어 아님)
  useEffect(() => {
    const nm = pick.trim()
    if (!nm) return
    const t = setTimeout(async () => {
      const j = await (await piFetch(`/api/areas/${areaId}/words?${new URLSearchParams({ q: nm, sts: 'CNFM', size: '20' })}`)).json()
      if (j.ok) setCands((j.words as Cand[]).filter((w) => w.forbid_yn !== 'Y' && w.ent_clss_yn !== 'Y'))
    }, 300)
    return () => clearTimeout(t)
  }, [pick, areaId])
  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (p: number) => setCond({ ...cond, page: Math.min(Math.max(1, p), pages) })
  const cur = cands.find((w) => w.dic_log_nm === pick.trim())
  const sfxErr = (v: string, self?: string) => {
    const n = norm(v)
    if (!n) return ''
    if (!SFX_RE.test(n)) return '형식 : _ + 영문 대문자·숫자 1~4자'
    const who = used.get(n)
    return who && who !== self ? `이미 '${who}'이(가) 사용 중` : ''
  }

  // 단어 수정 신청(202 = 승인대기, 200 = DA 즉시 승인)
  const send = async (w: { dic_id: string; dic_log_nm: string; ver_no: number }, body: Record<string, unknown>, what: string) => {
    const j = await (
      await piFetch(`/api/areas/${areaId}/words/${w.dic_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ver_no: w.ver_no, ...body, ...(selfApprover && selfApv ? { self_apv: true } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) }),
      })
    ).json()
    if (!j.ok) return setMsg(j.message ?? '')
    setMsg(j.requested ? `엔터티 분류어 ${w.dic_log_nm} ${what} 신청을 접수했습니다(승인 후 반영)` : `엔터티 분류어 ${w.dic_log_nm} ${what}·승인 완료`)
    setPick('')
    setSfx('')
    setEdit(null)
    setRsn('')
    load()
  }

  return (
    <main className="w-full px-3 py-3 sm:px-4 lg:px-5">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← 분류체계 목록
      </Link>
      <h1 className="mt-2 text-2xl font-bold">엔터티 분류어</h1>
      <div className="mt-6 space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (cur && !sfxErr(sfx) && confirm(`'${cur.dic_log_nm}'을(를) 엔터티 분류어로 지정${norm(sfx) ? `(접미어 ${norm(sfx)})` : ''} 신청하시겠습니까?`))
              send(cur, { ent_clss_yn: 'Y', ...(norm(sfx) ? { tbl_sfx_txt: norm(sfx) } : {}) }, '지정')
          }}
          onKeyDown={noEnterSubmit}
          className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md"
        >
          <h2 className="bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e] px-5 py-2.5 text-base font-semibold text-white">엔터티 분류어 지정</h2>
          <fieldset disabled={!requester} className="p-5 disabled:opacity-60">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <input list="ent-cands" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="엔터티 분류어(승인완료 단어 검색)" className="w-full rounded border border-[#b8c6e0] bg-white px-3 py-2" aria-label="엔터티 분류어" />
                <datalist id="ent-cands">
                  {cands.map((w) => (
                    <option key={w.dic_id} value={w.dic_log_nm}>
                      {w.dic_phy_nm}
                    </option>
                  ))}
                </datalist>
                {pick.trim() && !cur && <p className="mt-1 text-red-700">승인완료 단어 중 금칙어가 아니고 아직 지정되지 않은 단어를 고르십시오</p>}
              </div>
              <p className="rounded border border-[#d5ddec] bg-white px-3 py-2 font-mono">{cur?.dic_phy_nm ?? '물리명'}</p>
              <div>
                <input value={sfx} onChange={(e) => setSfx(e.target.value)} placeholder="테이블 접미어(예 : _H)" maxLength={5} className="w-full rounded border border-[#b8c6e0] bg-white px-3 py-2 font-mono" aria-label="테이블 접미어" />
                {sfxErr(sfx) && <p className="mt-1 text-red-700">{sfxErr(sfx)}</p>}
              </div>
              <p className="rounded border border-[#d5ddec] bg-white px-3 py-2 text-gray-600">{cur?.dic_desc || '단어 설명'}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
              <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => (setPick(''), setSfx(''))} className="rounded border bg-white px-5 py-2">
                  초기화
                </button>
                <button disabled={!cur || !!sfxErr(sfx)} className="btn-3d px-8 disabled:opacity-40">
                  지정 신청
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">기준 : 정의서 §8.4 데이터 성격 접미어 + 기관 확장(2026-10-16 확정). 단어 물리명(컬럼용)은 그대로 두고, 테이블 이름에는 접미어를 붙입니다(예 : 이력 → TB_○○○_H)</p>
            {role && !requester && <p className="mt-2 font-medium text-gray-600">조회 권한 : 지정·변경·해제는 신청 권한(데이터아키텍트·표준담당자·모델러)만 가능합니다</p>}
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
            className="flex flex-wrap gap-2"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색명(분류어·물리명·접미어)" className="min-w-[12rem] flex-1 rounded border px-3 py-2 text-sm" />
            <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
            <button className="btn-3d">검색</button>
          </form>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[0.7rem] [&_td]:whitespace-nowrap [&_.text-xs]:text-[0.6rem]">
              <colgroup>
                {COL_W.map((w, i) => (
                  <col key={i} className={w} />
                ))}
              </colgroup>
              <thead>
                <tr className="thead-3d text-center">
                  {['#', '엔터티 분류어', '물리명', '테이블 접미어', '테이블명 예', '설명', '등록자', '등록일시', '상태', '승인자', '승인일시', '처리'].map((h) => (
                    <th key={h} className="whitespace-nowrap border px-2 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="border px-2 py-4 text-center text-gray-500">
                      지정된 엔터티 분류어가 없습니다
                    </td>
                  </tr>
                ) : (
                  items.map((w, i) => (
                    <tr key={w.dic_id} className={edit?.id === w.dic_id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                      <td className="border px-2 py-1 font-medium">{w.dic_log_nm}</td>
                      <td className="border px-2 py-1 font-mono">{w.dic_phy_nm}</td>
                      <td className="border px-2 py-1 text-center font-mono font-semibold text-[#1f3a68]">
                        {edit?.id === w.dic_id ? (
                          <span>
                            <input value={edit.sfx} onChange={(e) => setEdit({ ...edit, sfx: e.target.value })} maxLength={5} className="w-16 rounded border px-1" aria-label="새 접미어" />
                            {sfxErr(edit.sfx, w.dic_log_nm) && <span className="ml-1 text-red-700">{sfxErr(edit.sfx, w.dic_log_nm)}</span>}
                          </span>
                        ) : (
                          (w.tbl_sfx_txt ?? <span className="font-normal text-gray-400">미지정</span>)
                        )}
                      </td>
                      <td className="border px-2 py-1 font-mono text-gray-500">{w.tbl_sfx_txt ? `TB_○○○${w.tbl_sfx_txt}` : ''}</td>
                      <td className="border px-2 py-1 !whitespace-normal">{w.dic_desc}</td>
                      <ActorCells nm={w.regr_nm} d={w.std_reg_dtm} />
                      <StsCell sts={w.std_sts_cd} pend={w.pend && (w.pend.ent === 'N' ? 'KEY_N' : w.pend.ent === 'Y' ? 'KEY_Y' : 'SFX')} apv={`/areas/${areaId}/approvals?tp=DIC`} />
                      <ActorCells nm={w.apv_nm} d={w.apv_dtm} />
                      <td className="whitespace-nowrap border px-2 py-1 text-center">
                        {w.pend || w.std_sts_cd === 'REQ' ? (
                          <ApvLink apv={`/areas/${areaId}/approvals?tp=DIC`} />
                        ) : w.std_sts_cd !== 'CNFM' ? (
                          <span className="text-xs text-gray-500">-</span>
                        ) : edit?.id === w.dic_id ? (
                          <>
                            <button
                              disabled={!!sfxErr(edit.sfx, w.dic_log_nm)}
                              onClick={() => confirm(`'${w.dic_log_nm}' 테이블 접미어를 ${norm(edit.sfx) || '미지정'}(으)로 변경 신청하시겠습니까?`) && send(w, { tbl_sfx_txt: norm(edit.sfx) || null }, '접미어 변경')}
                              className="mr-2 text-blue-700 underline disabled:text-gray-400"
                            >
                              저장
                            </button>
                            <button onClick={() => setEdit(null)} className="text-gray-600 underline">
                              취소
                            </button>
                          </>
                        ) : (
                          requester && (
                            <>
                              <button onClick={() => setEdit({ id: w.dic_id, sfx: w.tbl_sfx_txt ?? '' })} className="mr-2 text-blue-700 underline">
                                접미어 변경
                              </button>
                              <button onClick={() => confirm(`'${w.dic_log_nm}' 엔터티 분류어 지정을 해제 신청하시겠습니까?(접미어도 비워집니다)`) && send(w, { ent_clss_yn: 'N' }, '지정 해제')} className="text-red-700 underline">
                                지정 해제
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
              <button onClick={() => go(cond.page - 1)} disabled={cond.page <= 1} className="rounded border px-2 py-1 disabled:opacity-30">
                ‹
              </button>
              <button onClick={() => go(cond.page + 1)} disabled={cond.page >= pages} className="rounded border px-2 py-1 disabled:opacity-30">
                ›
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
    </main>
  )
}

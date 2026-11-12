'use client'
import { piFetch } from '@pi/auth/client'
// 엔터티 분류어 관리 화면 — 단어에 엔터티 분류어 지정·테이블 접미어 지정·변경·해제 신청(단어 수정 승인 절차, sql/017), 목록 조회
// 기준 : 정의서 §8.4 데이터 성격 접미어 + 기관 확장(2026-10-16 마스터 확정), 단어 물리명(컬럼용)과 테이블 접미어(테이블명용)는 별도
import { use, useCallback, useEffect, useState } from 'react'
import { Check, Pencil, Unlink, X } from 'lucide-react'
import { InfoTip, PageHead } from '@/components/page-head'
import { type MbrRole, type Perm } from '@/lib/roles'
import { ActorCells, ApvFields, ApvLink, StsCell, StsFilter, noEnterSubmit } from '../words/word-board'
import { Pager } from '../terms/term-board'

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
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [selfApv, setSelfApv] = useState(false)
  const [rsn, setRsn] = useState('')
  const [q, setQ] = useState('')
  const [cond, setCond] = useState({ kw: '', sts: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  const [used, setUsed] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
  }, [areaId])
  const selfApprover = perms.includes('SELF_APPROVE')
  const requester = perms.includes('STD_REQ')

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
    <main className="w-full px-4 py-4 lg:px-6 lg:py-5">
      <PageHead title="엔터티 분류어" />
      <div className="space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (cur && !sfxErr(sfx) && confirm(`'${cur.dic_log_nm}'을(를) 엔터티 분류어로 지정${norm(sfx) ? `(접미어 ${norm(sfx)})` : ''} 신청하시겠습니까?`))
              send(cur, { ent_clss_yn: 'Y', ...(norm(sfx) ? { tbl_sfx_txt: norm(sfx) } : {}) }, '지정')
          }}
          onKeyDown={noEnterSubmit}
          className="panel"
        >
          <div className="panel-head">
            <h2>엔터티 분류어 지정</h2>
            <InfoTip>기준 : 정의서 §8.4 데이터 성격 접미어 + 기관 확장(2026-10-16 확정). 단어 물리명(컬럼용)은 그대로 두고, 테이블 이름에는 접미어를 붙입니다(예 : 이력 → TB_○○○_H)</InfoTip>
            {role && !requester && (
              <span className="badge ms-auto" title="지정·변경·해제는 신청 권한(역할·요금제)이 있어야 합니다">
                조회 전용
              </span>
            )}
          </div>
          <fieldset disabled={!requester} className="panel-body disabled:opacity-60">
            <div className="grid gap-3 md:grid-cols-4">
              <label>
                <span className="field-label req">엔터티 분류어</span>
                <input list="ent-cands" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="승인완료 단어" className="input" aria-required="true" />
                <datalist id="ent-cands">
                  {cands.map((w) => (
                    <option key={w.dic_id} value={w.dic_log_nm}>
                      {w.dic_phy_nm}
                    </option>
                  ))}
                </datalist>
                {pick.trim() && !cur && <span className="hint block text-danger">승인완료 단어 중 금칙어가 아니고 아직 지정되지 않은 단어를 고르십시오</span>}
              </label>
              <div>
                <span className="field-label">물리명</span>
                <div className="flex h-9 items-center">{cur ? <span className="chip-phy" data-size="lg">{cur.dic_phy_nm}</span> : <span className="text-ink-off">-</span>}</div>
              </div>
              <label>
                <span className="field-label">테이블 접미어</span>
                <input value={sfx} onChange={(e) => setSfx(e.target.value)} placeholder="_H" maxLength={5} className="input font-mono" />
                {sfxErr(sfx) && <span className="hint block text-danger">{sfxErr(sfx)}</span>}
              </label>
              <div>
                <span className="field-label">단어 설명</span>
                <p className="flex min-h-9 items-center text-dense text-ink-2">{cur?.dic_desc || <span className="text-ink-off">-</span>}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
              <div className="ms-auto flex gap-2">
                <button type="button" onClick={() => (setPick(''), setSfx(''))} className="btn-key">
                  초기화
                </button>
                <button disabled={!cur || !!sfxErr(sfx)} className="btn-3d">
                  지정 신청
                </button>
              </div>
            </div>
            {msg && (
              <p role="status" className="mt-3 text-dense text-ink-2">
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
            className="flex flex-wrap items-center gap-2"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" aria-label="검색명(분류어·물리명·접미어)" title="분류어·물리명·접미어" className="input min-w-48 flex-1" />
            <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
            <button className="btn-key">검색</button>
          </form>
          <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
              <colgroup>
                {COL_W.map((w, i) => (
                  <col key={i} className={w} />
                ))}
              </colgroup>
              <thead>
                <tr className="thead-3d text-center">
                  {['#', '엔터티 분류어', '물리명', '테이블 접미어', '테이블명 예', '설명', '등록자', '등록일시', '상태', '승인자', '승인일시', '처리'].map((h) => (
                    <th key={h} className="border-b px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-6 text-center text-ink-3">
                      검색 결과 없음
                    </td>
                  </tr>
                ) : (
                  items.map((w, i) => (
                    <tr key={w.dic_id} data-mode={edit?.id === w.dic_id ? 'edit' : undefined}>
                      <td className="border px-3 py-1 text-end font-mono text-xs text-ink-3 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                      <td className="border px-3 py-1 font-medium">{w.dic_log_nm}</td>
                      <td className="border px-3 py-1">
                        <span className="chip-phy">{w.dic_phy_nm}</span>
                      </td>
                      <td className="border px-3 py-1 text-center">
                        {edit?.id === w.dic_id ? (
                          <span className="inline-flex items-center gap-1">
                            <input value={edit.sfx} onChange={(e) => setEdit({ ...edit, sfx: e.target.value })} maxLength={5} className="input-sm w-16 font-mono" aria-label="새 접미어" />
                            {sfxErr(edit.sfx, w.dic_log_nm) && <span className="text-xs text-danger">{sfxErr(edit.sfx, w.dic_log_nm)}</span>}
                          </span>
                        ) : w.tbl_sfx_txt ? (
                          <span className="chip-phy">{w.tbl_sfx_txt}</span>
                        ) : (
                          <span className="text-xs text-ink-3">미지정</span>
                        )}
                      </td>
                      <td className="border px-3 py-1 font-mono text-xs text-ink-3">{w.tbl_sfx_txt ? `TB_○○○${w.tbl_sfx_txt}` : ''}</td>
                      <td className="border px-3 py-1 text-ink-2 !whitespace-normal">{w.dic_desc}</td>
                      <ActorCells nm={w.regr_nm} d={w.std_reg_dtm} />
                      <StsCell sts={w.std_sts_cd} pend={w.pend && (w.pend.ent === 'N' ? 'KEY_N' : w.pend.ent === 'Y' ? 'KEY_Y' : 'SFX')} apv={`/areas/${areaId}/approvals?tp=DIC`} />
                      <ActorCells nm={w.apv_nm} d={w.apv_dtm} />
                      <td className="whitespace-nowrap border px-3 py-1 text-center">
                        {w.pend || w.std_sts_cd === 'REQ' ? (
                          <ApvLink apv={`/areas/${areaId}/approvals?tp=DIC`} />
                        ) : w.std_sts_cd !== 'CNFM' ? (
                          <span className="text-xs text-ink-3">-</span>
                        ) : edit?.id === w.dic_id ? (
                          <span className="inline-flex gap-1">
                            <button
                              disabled={!!sfxErr(edit.sfx, w.dic_log_nm)}
                              onClick={() => confirm(`'${w.dic_log_nm}' 테이블 접미어를 ${norm(edit.sfx) || '미지정'}(으)로 변경 신청하시겠습니까?`) && send(w, { tbl_sfx_txt: norm(edit.sfx) || null }, '접미어 변경')}
                              aria-label="저장"
                              title="저장"
                              className="btn-ghost btn-icon btn-sm"
                            >
                              <Check aria-hidden />
                            </button>
                            <button onClick={() => setEdit(null)} aria-label="취소" title="취소" className="btn-ghost btn-icon btn-sm">
                              <X aria-hidden />
                            </button>
                          </span>
                        ) : (
                          requester && (
                            <span className="inline-flex gap-1">
                              <button onClick={() => setEdit({ id: w.dic_id, sfx: w.tbl_sfx_txt ?? '' })} aria-label="접미어 변경" title="접미어 변경" className="btn-ghost btn-icon btn-sm">
                                <Pencil aria-hidden />
                              </button>
                              <button onClick={() => confirm(`'${w.dic_log_nm}' 엔터티 분류어 지정을 해제 신청하시겠습니까?(접미어도 비워집니다)`) && send(w, { ent_clss_yn: 'N' }, '지정 해제')} aria-label="지정 해제" title="지정 해제" className="btn-ghost btn-icon btn-sm hover:text-danger">
                                <Unlink aria-hidden />
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pager page={cond.page} pages={pages} total={total} size={cond.size} go={go} setSize={(size) => setCond({ ...cond, size, page: 1 })} />
        </section>
      </div>
    </main>
  )
}

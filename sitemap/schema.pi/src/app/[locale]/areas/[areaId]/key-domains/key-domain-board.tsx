'use client'
import { piFetch } from '@pi/auth/client'
// 대표도메인 관리(클라이언트) — 지정 = 승인완료 속성 분류어 단어에 key_dom_yn Y 수정 신청, 해제 = N 수정 신청(사용 도메인 0건만)
// 목록 /api/areas/[areaId]/key-domains, 신청 PATCH /api/areas/[areaId]/words/[dicId] (승인 절차·DA 즉시 승인 공용, sql/013)
import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/i18n/navigation'
import { type MbrRole, type Perm } from '@/lib/roles'
import { Unlink } from 'lucide-react'
import { InfoTip } from '@/components/page-head'
import { ActorCells, ApvFields, ApvLink, Pager, StsCell, StsFilter, TD, noEnterSubmit } from '../words/word-board'

interface Item {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_desc: string | null
  key_dom_yn: string
  std_sts_cd: string
  ver_no: number
  dom_cnt: number
  pend: { req_id: string; to: string | null } | null
  regr_nm?: string | null
  std_reg_dtm?: string
  apv_nm?: string | null
  apv_dtm?: string | null
}
interface Cand {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_desc: string | null
  forbid_yn: string
  key_dom_yn: string
  ver_no: number
}
// 설명 = 표 폭의 30%, 나머지 열 = 값에 맞춰 자동(table-auto + 줄바꿈 없음)
const COL_W = ['', '', '', '', 'w-[30%]', '', '', '', '', '', '']

export default function KeyDomainBoard({ areaId }: { areaId: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [attrWords, setAttrWords] = useState<Cand[]>([])
  const [candErr, setCandErr] = useState('') // 후보 목록 조회 실패 사유(빈 목록과 구분 — 실패를 "속성 분류어 아님"으로 오인하지 않게)
  const [pick, setPick] = useState('')
  const [msg, setMsg] = useState('')
  const [role, setRole] = useState<MbrRole | null>(null)
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [selfApv, setSelfApv] = useState(false)
  const [rsn, setRsn] = useState('')
  const [q, setQ] = useState('')
  const [cond, setCond] = useState({ kw: '', sts: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
  }, [areaId])
  const selfApprover = perms.includes('SELF_APPROVE')
  const requester = perms.includes('STD_REQ')

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.sts ? { sts: cond.sts } : {}) })
    const [l, c] = await Promise.all([piFetch(`/api/areas/${areaId}/key-domains?${sp}`).then((r) => r.json()), piFetch(`/api/areas/${areaId}/words?attr=Y`).then((r) => r.json())])
    if (l.ok) {
      setItems(l.items)
      setTotal(l.total)
    } else setMsg(l.message)
    if (c.ok) setAttrWords(c.words)
    setCandErr(c.ok ? '' : (c.message ?? '오류'))
  }, [areaId, cond])
  useEffect(() => {
    load()
  }, [load])
  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (p: number) => setCond({ ...cond, page: Math.min(Math.max(1, p), pages) })
  // 지정 후보 = 승인완료 속성 분류어 중 미지정·금칙어 아님. 입력한 단어가 후보가 아니면 사유를 하나로 특정
  const cands = attrWords.filter((w) => w.key_dom_yn !== 'Y' && w.forbid_yn !== 'Y')
  const hit = attrWords.find((w) => w.dic_log_nm === pick.trim())
  const cur = hit && cands.includes(hit) ? hit : undefined
  const why = !pick.trim() || cur ? '' : candErr ? `대표도메인 후보 목록을 불러오지 못했습니다(${candErr}) — 새로고침 후 다시 시도하십시오` : !hit ? '승인완료된 속성 분류어 단어가 아닙니다(표준단어에서 속성 분류어 지정 후 승인 필요)' : hit.key_dom_yn === 'Y' ? '이미 지정된 대표도메인입니다(아래 목록에서 확인)' : '금칙어는 대표도메인으로 지정할 수 없습니다'

  // 지정·해제 신청 — 단어 수정 신청(202 = 승인대기, 200 = DA 즉시 승인)
  const send = async (w: { dic_id: string; dic_log_nm: string; ver_no: number }, to: 'Y' | 'N') => {
    const body = { ver_no: w.ver_no, key_dom_yn: to, ...(selfApprover && selfApv ? { self_apv: true } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) }
    const j = await (await piFetch(`/api/areas/${areaId}/words/${w.dic_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    if (!j.ok) return setMsg(j.message ?? '')
    const act = to === 'Y' ? '지정' : '지정 해제'
    setMsg(j.requested ? `대표도메인 ${w.dic_log_nm} ${act} 신청을 접수했습니다(승인 후 사용 가능)` : `대표도메인 ${w.dic_log_nm} ${act}·승인 완료`)
    setPick('')
    setRsn('')
    load()
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (cur && confirm(`대표도메인 ${cur.dic_log_nm} 지정을 신청하시겠습니까?`)) send(cur, 'Y')
        }}
        onKeyDown={noEnterSubmit}
        className="panel text-sm"
      >
        <div className="panel-head">
          <h2 className="truncate">대표도메인 지정</h2>
          <div className="ms-auto flex items-center gap-2">
            {role && !requester && (
              <span className="badge" title="지정·해제는 신청 권한(역할·요금제)이 있어야 합니다">
                조회 전용
              </span>
            )}
            <InfoTip align="end">
              목록에 없는 단어는{' '}
              <Link href={`/areas/${areaId}/words`} className="text-accent-ink hover:underline">
                표준단어 등록
              </Link>
              (속성 분류어 선택) 후 승인되면 나타납니다. 도메인 등록의 대표도메인명은 지정된 대표도메인만 고를 수 있습니다
            </InfoTip>
          </div>
        </div>
        <fieldset disabled={!requester} className="panel-body disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="block">
                <span className="field-label req">대표도메인명</span>
                <input list="key-cands" value={pick} onChange={(e) => setPick(e.target.value)} placeholder="속성 분류어 단어" className="input" aria-required />
              </label>
              <datalist id="key-cands">
                {cands.map((w) => (
                  <option key={w.dic_id} value={w.dic_log_nm}>
                    {w.dic_phy_nm}
                  </option>
                ))}
              </datalist>
              {why && <p className="mt-1 text-xs text-danger">{why}</p>}
            </div>
            <div>
              <span className="field-label">물리명</span>
              {cur ? (
                <span className="chip-phy" data-size="lg">
                  {cur.dic_phy_nm}
                </span>
              ) : (
                <p className="flex min-h-8 items-center text-ink-off">—</p>
              )}
            </div>
            <div className="md:col-span-2">
              <span className="field-label">설명</span>
              <p className="flex min-h-8 items-center text-ink-2">{cur?.dic_desc || '—'}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <div className="ms-auto flex gap-2">
              <button type="button" onClick={() => setPick('')} className="btn-key">
                초기화
              </button>
              <button disabled={!cur} className="btn-3d">
                지정 신청
              </button>
            </div>
          </div>
          {msg && (
            <p role="status" className="mt-3 text-dense font-medium text-ink">
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="대표도메인명·물리명" aria-label="검색어(대표도메인명·물리명)" className="input min-w-48 flex-1" />
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
              <tr className="thead-3d text-start">
                {['#', '대표도메인명', '물리명', '사용 도메인', '설명', '등록자', '등록일시', '상태', '승인자', '승인일시', '처리'].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-ink-3">
                    지정된 대표도메인이 없습니다
                  </td>
                </tr>
              ) : (
                items.map((w, i) => (
                  <tr key={w.dic_id}>
                    <td className={`${TD} text-right font-mono text-xs text-ink-3 tabular-nums`}>{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                    <td className={`${TD} font-medium`}>{w.dic_log_nm}</td>
                    <td className={TD}>
                      <span className="chip-phy">{w.dic_phy_nm}</span>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{w.dom_cnt.toLocaleString()}</td>
                    <td className={`${TD} min-w-60 !whitespace-normal text-ink-2`}>{w.dic_desc}</td>
                    <ActorCells nm={w.regr_nm} d={w.std_reg_dtm} />
                    <StsCell sts={w.std_sts_cd} pend={w.pend && (w.pend.to === 'N' ? 'KEY_N' : 'KEY_Y')} apv={`/areas/${areaId}/approvals?tp=DIC`} />
                    <ActorCells nm={w.apv_nm} d={w.apv_dtm} />
                    <td className={TD}>
                      {w.pend || w.std_sts_cd === 'REQ' ? (
                        <ApvLink apv={`/areas/${areaId}/approvals?tp=DIC`} />
                      ) : w.std_sts_cd !== 'CNFM' ? (
                        <span className="text-xs text-ink-off">-</span>
                      ) : (
                        requester && (
                          <button
                            type="button"
                            onClick={() => confirm(`${w.dic_log_nm} 대표도메인 지정을 해제${selfApprover && selfApv ? '' : ' 신청'}합니다`) && send(w, 'N')}
                            disabled={w.dom_cnt > 0}
                            title={w.dom_cnt > 0 ? `사용 중인 도메인 ${w.dom_cnt}건` : '지정 해제'}
                            className="btn-ghost btn-sm enabled:hover:text-danger"
                          >
                            <Unlink aria-hidden />
                            해제
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={cond.page} size={cond.size} go={go} setSize={(size) => setCond({ ...cond, size, page: 1 })} />
      </section>
    </div>
  )
}

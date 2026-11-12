'use client'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
// 표준단어 조회·등록·수정·삭제(클라이언트) — /api/areas/[areaId]/words(목록·등록·상태 필터), /words/[dicId](수정·삭제, ver_no 낙관적 잠금), /check(입력 중 중복 검사), /suggest(논리명 입력 시 물리명·영문풀네임·한자·설명 자동 채움, 저장 안 함)
// 승인 절차 : 등록·수정·삭제는 승인 신청, 즉시 승인 선택은 SYS·DA(요금제4)만(기본 끔), 조회 전용 역할은 등록 영역 비활성
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { InfoTip } from '@/components/page-head'
import { STS_NM, type MbrRole, type Perm } from '@/lib/roles'

interface Word {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_eng_nm: string | null
  dic_chn_nm: string | null
  ent_clss_yn: string
  tbl_sfx_txt?: string | null
  attr_clss_yn: string
  forbid_yn: string
  dic_desc: string | null
  std_se_cd?: string
  std_sts_cd: string
  pend_act?: string | null
  regr_nm?: string | null
  std_reg_dtm?: string
  apv_nm?: string | null
  apv_dtm?: string | null
  ver_no: number
}
// 중복 검사 결과 — 동음이의어(논리명)·이음동의어(물리명·이음동의어 표기) = 등록 불가, 영문풀네임 중복 = 경고
interface Check {
  logical_dup: boolean
  physical_dup: { dic_log_nm: string }[]
  syn_of: string | null
  eng_dup: { dic_log_nm: string; dic_phy_nm: string }[]
}
const EMPTY = { dic_log_nm: '', dic_phy_nm: '', dic_eng_nm: '', dic_chn_nm: '', ent_clss_yn: 'N', attr_clss_yn: 'N', forbid_yn: 'N', dic_desc: '', std_se_cd: 'STD' }
type Field = keyof typeof EMPTY
// 목록 열 너비(#·논리명·상태·물리명·영문풀네임·분류어·금칙·설명·작업) — 설명은 남는 폭
// 설명 = 표 폭의 30%, 나머지 열 = 값에 맞춰 자동(table-auto + 줄바꿈 없음)
const COL_W = ['', '', '', '', '', '', 'w-[30%]', '', '', '', '', '', '', '']
const NULLABLE: Field[] = ['dic_eng_nm', 'dic_chn_nm', 'dic_desc']

export default function WordBoard({ areaId }: { areaId: string }) {
  const base = `/api/areas/${areaId}/words`
  const [words, setWords] = useState<Word[]>([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [edit, setEdit] = useState<Word | null>(null)
  const [chk, setChk] = useState<Check | null>(null)
  // 자동 채움 출처·진행 상태, 마지막으로 채운 값(입력자가 고친 칸은 다시 덮어쓰지 않음)
  const [sug, setSug] = useState<{ busy: boolean; src: string[]; alts: string[] }>({ busy: false, src: [], alts: [] })
  const lastFill = useRef<Record<string, string>>({})
  const [msg, setMsg] = useState('')
  // 현재 사용자 역할(분류체계 조회 응답) — 승인권자 = 자기 승인 선택, 신청 권한 없음 = 조회 전용
  const [role, setRole] = useState<MbrRole | null>(null)
  const [perms, setPerms] = useState<Perm[]>([]) // 실제 권한 = 역할 ∩ 요금제(서버 계산)
  const [selfApv, setSelfApv] = useState(false)
  const [rsn, setRsn] = useState('')
  useEffect(() => {
    piFetch(`/api/areas/${areaId}`)
      .then((r) => r.json())
      .then((j) => j.ok && (setRole(j.role), setPerms(j.perms ?? [])))
  }, [areaId])
  const selfApprover = perms.includes('SELF_APPROVE')
  const requester = perms.includes('STD_REQ')

  // 조회 조건(검색어·상태·페이지·페이지 크기) — 바뀌면 서버에서 해당 페이지만 조회
  const [cond, setCond] = useState({ kw: '', sts: '', se: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.sts ? { sts: cond.sts } : {}), ...(cond.se ? { se: cond.se } : {}) })
    const j = await (await piFetch(`${base}?${sp}`)).json()
    if (j.ok) {
      setWords(j.words)
      setTotal(j.total)
    } else setMsg(j.message)
  }, [base, cond])
  useEffect(() => {
    load()
  }, [load])
  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (page: number) => setCond({ ...cond, page: Math.min(Math.max(1, page), pages) })

  // 논리명 입력 시 자동 채움(0.6초 지연, 등록 모드만) — 빈 칸과 직전에 자동으로 채운 그대로인 칸만 바꿈. 저장은 입력자가 등록 버튼으로
  useEffect(() => {
    const nm = form.dic_log_nm.trim()
    if (edit || !nm) return setSug({ busy: false, src: [], alts: [] })
    let live = true
    const t = setTimeout(async () => {
      setSug({ busy: true, src: [], alts: [] })
      const j = await (await piFetch(`${base}/suggest?${new URLSearchParams({ log_nm: nm })}`)).json().catch(() => null)
      if (!live) return
      if (!j?.ok) return setSug({ busy: false, src: [], alts: [] })
      const fill = j.fill as Record<string, string>
      const prev = lastFill.current // 갱신 함수는 나중에 실행되므로 직전 값을 먼저 잡아 둠
      lastFill.current = fill
      setForm((f) => {
        const next = { ...f }
        for (const k of ['dic_phy_nm', 'dic_eng_nm', 'dic_chn_nm', 'dic_desc'] as const) {
          if (f[k] === '' || f[k] === prev[k]) next[k] = fill[k] ?? ''
        }
        return next
      })
      setSug({ busy: false, src: j.src, alts: j.phy_alts ?? [] })
    }, 600)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [form.dic_log_nm, base, edit])

  // 입력 중 중복 검사(0.3초 지연) — 수정 중에는 자기 자신 제외
  useEffect(() => {
    if (!form.dic_log_nm && !form.dic_phy_nm) {
      setChk(null)
      return
    }
    const t = setTimeout(async () => {
      const sp = new URLSearchParams({ log_nm: form.dic_log_nm, phy_nm: form.dic_phy_nm, eng_nm: form.dic_eng_nm })
      const j = await (await piFetch(`${base}/check?${sp}`)).json()
      if (!j.ok) return
      if (edit) {
        j.logical_dup = j.logical_dup && form.dic_log_nm !== edit.dic_log_nm
        j.physical_dup = j.physical_dup.filter((d: { dic_log_nm: string }) => d.dic_log_nm !== edit.dic_log_nm)
        j.eng_dup = j.eng_dup.filter((d: { dic_log_nm: string }) => d.dic_log_nm !== edit.dic_log_nm)
      }
      setChk(j)
    }, 300)
    return () => clearTimeout(t)
  }, [form.dic_log_nm, form.dic_phy_nm, form.dic_eng_nm, base, edit])

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? (e.target.checked ? 'Y' : 'N') : e.target.value })

  // 다른 화면(개념 모델 등)에서 ?new=이름 으로 들어오면 등록 폼 논리명에 채움
  useEffect(() => {
    const nm = new URLSearchParams(window.location.search).get('new')?.trim()
    if (nm) setForm((f) => ({ ...f, dic_log_nm: nm.slice(0, 200) }))
  }, [])

  const reset = () => {
    lastFill.current = {}
    setForm(EMPTY)
    setEdit(null)
    setChk(null)
    setRsn('')
  }
  const startEdit = (w: Word) => {
    setEdit(w)
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (w[k as keyof Word] as string | null) ?? ''])) as typeof EMPTY)
    setMsg('')
    ;(document.getElementById('area-scroll') ?? window).scrollTo({ top: 0, behavior: 'smooth' }) // 등록·수정 영역이 목록 위에 있음
  }
  const done = (j: { ok: boolean; message?: string; requested?: boolean; resubmitted?: boolean }, okMsg: string) => {
    if (!j.ok) {
      setMsg(j.message ?? '')
      return
    }
    setMsg(j.resubmitted ? '재신청을 접수했습니다' : j.requested ? '승인 신청을 접수했습니다(승인 후 사용 가능)' : okMsg)
    reset()
    load()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmSave(!!edit)) return
    if (edit) {
      // 빈 선택 항목은 비움(null)으로 전송, 서버가 바뀐 항목만 반영
      const body = { ver_no: edit.ver_no, ...apvOpt(), ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' && NULLABLE.includes(k as Field) ? null : v])) }
      const j = await (await piFetch(`${base}/${edit.dic_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
      return done(j, `표준단어 ${form.dic_log_nm} 수정·승인 완료`)
    }
    const body = { ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')), ...apvOpt() }
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    done(j, `표준단어 ${form.dic_log_nm} 등록·승인 완료`)
  }
  // 승인 신청 선택 항목 — 자기 승인은 승인권자만, 신청사유는 입력했을 때만
  const apvOpt = () => ({ ...(selfApprover && selfApv ? { self_apv: true } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) })

  // 반려 행 = 즉시 삭제(서버 규칙), 승인완료 행 = 승인권자 자기 승인 시 즉시 삭제, 그 외 삭제 신청
  const remove = async (w: Word) => {
    const now = w.std_sts_cd === 'RJCT' || (selfApprover && selfApv)
    if (!confirm(`${w.dic_log_nm} 단어를 ${now ? '즉시 삭제' : '삭제 신청'}합니다`)) return
    const j = await (await piFetch(`${base}/${w.dic_id}?ver_no=${w.ver_no}${selfApprover && selfApv ? '&self_apv=1' : ''}`, { method: 'DELETE' })).json()
    done(j, `표준단어 ${w.dic_log_nm} 삭제`)
  }

  // 입력칸 = 라벨(필수면 남색 점) + 입력. extra.className 을 주면 기본 'input' 을 대체
  const text = (k: Field, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={`field-label ${extra.required ? 'req' : ''}`}>{label}</span>
      <input value={form[k]} onChange={set(k)} className="input" aria-required={extra.required || undefined} {...extra} />
    </label>
  )
  const flag = (k: Field, label: string) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" checked={form[k] === 'Y'} onChange={set(k)} /> {label}
    </label>
  )

  return (
    <div className="space-y-6">
      <form onSubmit={submit} onKeyDown={noEnterSubmit} className="panel text-sm">
        <div className="panel-head" data-mode={edit ? 'edit' : undefined}>
          <h2 className="truncate">{edit ? `단어 수정 : ${edit.dic_log_nm}` : '단어 등록'}</h2>
          <div className="ms-auto flex items-center gap-2">
            {role && !requester && (
              <span className="badge" title="등록·수정·삭제는 신청 권한(역할·요금제)이 있어야 합니다">
                조회 전용
              </span>
            )}
            <InfoTip align="end">
              도메인의 대표도메인명(예 : 금액·번호·명)으로 쓰려면 속성 분류어를 선택합니다. 용어의 끝 단어도 속성 분류어여야 합니다. 금칙어·이음동의어(이 단어 대신 쓰지 않는 표기)는{' '}
              <Link href={`/areas/${areaId}/forbidden`} className="text-accent-ink hover:underline">
                금칙어 관리
              </Link>
              에서 등록합니다
            </InfoTip>
          </div>
        </div>
        <fieldset disabled={!requester} className="panel-body disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              {text('dic_log_nm', '논리명', { required: true, maxLength: 200 })}
              {chk?.logical_dup && <p className="mt-1 text-xs text-danger">같은 논리명의 단어가 이미 있습니다 : 복합어로 구분하십시오(동음이의어 금지)</p>}
              {chk?.syn_of && <p className="mt-1 text-xs text-danger">표준단어 &apos;{chk.syn_of}&apos;의 이음동의어입니다 : 표준단어를 쓰십시오</p>}
              {!edit && sug.busy && <p className="hint">자동 채움 조회 중</p>}
              {!edit && !sug.busy && form.dic_log_nm.trim() && <p className="hint">{sug.src.length ? `자동 채움 : ${sug.src.join(' / ')}` : '자동 채움 근거 없음'}</p>}
            </div>
            <div>
              {text('dic_phy_nm', '물리명', { required: true, pattern: '[A-Za-z][A-Za-z0-9]*', maxLength: 200, className: 'input font-mono', title: '영문 약어' })}
              {chk && chk.physical_dup.length > 0 && <p className="mt-1 text-xs text-danger">같은 물리명 사용 중 : {chk.physical_dup.map((d) => d.dic_log_nm).join(', ')} : 약어를 달리 정의하십시오</p>}
              {/* 물리명 다른 후보(지침서 2~3자 규칙·공식 약어) — 의미 전달이 약하면 입력자가 골라 바꿈 */}
              {!edit && sug.alts.length > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-3">
                  다른 후보
                  {sug.alts.map((a) => (
                    <button key={a} type="button" onClick={() => setForm((f) => ({ ...f, dic_phy_nm: a }))} className="chip-phy transition-colors hover:bg-accent-soft">
                      {a}
                    </button>
                  ))}
                </p>
              )}
            </div>
            <div>
              {text('dic_eng_nm', '영문풀네임', { maxLength: 500 })}
              {chk && chk.eng_dup.length > 0 && <p className="mt-1 text-xs text-warn">같은 영문풀네임 : {chk.eng_dup.map((d) => `${d.dic_log_nm}(${d.dic_phy_nm})`).join(', ')} : 이음동의어인지 확인하십시오</p>}
            </div>
            {text('dic_chn_nm', '한자', { maxLength: 200 })}
            <div className="md:col-span-2 lg:col-span-4">{text('dic_desc', '설명', { maxLength: 4000 })}</div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2">
              {flag('ent_clss_yn', '엔터티 분류어')}
              <Link href={`/areas/${areaId}/entity-classes`} className="text-xs text-accent-ink hover:underline" title="테이블 접미어는 엔터티 분류어 화면에서 지정">
                접미어 지정
              </Link>
            </span>
            {flag('attr_clss_yn', '속성 분류어(도메인 사용)')}
            {flag('forbid_yn', '금칙어')}
            <SeSelect value={form.std_se_cd} onChange={(v) => setForm({ ...form, std_se_cd: v })} />
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <div className="ms-auto flex gap-2">
              {edit && (
                <button type="button" onClick={reset} className="btn-key">
                  취소
                </button>
              )}
              <button disabled={!!chk && (chk.logical_dup || !!chk.syn_of || chk.physical_dup.length > 0)} className="btn-3d">
                {edit ? (edit.std_sts_cd === 'RJCT' ? '재신청' : '저장') : '등록'}
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="논리명·물리명" aria-label="검색어(논리명·물리명)" className="input min-w-48 flex-1" />
          <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
          <SeFilter value={cond.se} onChange={(se) => setCond({ ...cond, se, page: 1 })} />
          <button className="btn-key">검색</button>
          <a href={`/api/areas/${areaId}/export/words?${new URLSearchParams({ ...(cond.kw ? { q: cond.kw } : {}), ...(cond.se ? { se: cond.se } : {}) })}`} className="btn-key" download>
            <Download aria-hidden />
            엑셀
          </a>
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
                {['#', '논리명', '물리명', '영문풀네임', '분류어', '금칙', '설명', '구분', '등록자', '등록일시', '상태', '승인자', '승인일시', '처리'].map((h, i) => (
                  <th key={i} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {words.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-6 text-center text-ink-3">
                    등록된 단어가 없습니다
                  </td>
                </tr>
              ) : (
                words.map((w, i) => (
                  <tr key={w.dic_id} data-mode={edit?.dic_id === w.dic_id ? 'edit' : undefined}>
                    <td className={`${TD} text-right font-mono text-xs text-ink-3 tabular-nums`}>{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                    <td className={`${TD} font-medium`}>{w.dic_log_nm}</td>
                    <td className={TD}>
                      <span className="chip-phy">{w.dic_phy_nm}</span>
                    </td>
                    <td className={`${TD} text-ink-2`}>{w.dic_eng_nm}</td>
                    <td className={`${TD} text-ink-2`}>{[w.ent_clss_yn === 'Y' && `엔터티${w.tbl_sfx_txt ? `(${w.tbl_sfx_txt})` : ''}`, w.attr_clss_yn === 'Y' && '속성(도메인 사용)'].filter(Boolean).join('·')}</td>
                    <td className={TD}>
                      {w.forbid_yn === 'Y' && (
                        <span className="badge" data-tone="danger">
                          금칙어
                        </span>
                      )}
                    </td>
                    <td className={`${TD} min-w-60 !whitespace-normal text-ink-2`}>{w.dic_desc}</td>
                    <SeCell se={w.std_se_cd} />
                    <ActorCells nm={w.regr_nm} d={w.std_reg_dtm} />
                    <StsCell sts={w.std_sts_cd} pend={w.pend_act} apv={`/areas/${areaId}/approvals?tp=DIC`} />
                    <ActorCells nm={w.apv_nm} d={w.apv_dtm} />
                    <td className={TD}>
                      {w.std_sts_cd === 'REQ' || w.pend_act ? <ApvLink apv={`/areas/${areaId}/approvals?tp=DIC`} /> : requester && <RowActions onEdit={() => startEdit(w)} onRemove={() => remove(w)} />}
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

// 목록 표 칸 공용 — 행 헤어라인만(세로선 없음), 동작 칸이 있는 행 높이 36 (도메인·용어·대표도메인 화면 공용)
export const TD = 'border-b px-3 py-1'

// 상태 열 — 승인대기(변경 신청 대기 포함) = warn 배지 + 승인 요청 화면(대기 목록) 링크, 반려 = danger 배지 + 승인 요청 화면(반려사유) 링크,
// 승인완료 = 회색 작은 글자, 폐기 = 기본 배지. apv = 승인 요청 화면 주소(대상 유형까지, 상태는 여기서 붙임) (도메인·용어·대표도메인 화면 공용)
// 승인완료 행의 대기 중인 변경 신청 동작(수정·삭제 = 목록 API pend_act, 지정·해제 = 대표도메인 관리)
export const PEND_NM: Record<string, string> = { UPD: '수정', DEL: '삭제', KEY_Y: '지정', KEY_N: '해제', SFX: '변경' }
const TONE: Record<string, string> = { REQ: 'warn', RJCT: 'danger' }
export function StsCell({ sts, apv, pend }: { sts: string; apv: string; pend?: string | null }) {
  return (
    <td className={`whitespace-nowrap ${TD}`}>
      {pend || sts === 'REQ' ? (
        <a href={`${apv}&sts=REQ`} title="승인 요청 화면에서 보기" className="badge" data-tone="warn">
          {pend ? `승인대기(${PEND_NM[pend] ?? pend})` : STS_NM.REQ}
        </a>
      ) : sts === 'CNFM' ? (
        <span className="text-xs text-ink-3">승인</span>
      ) : (
        <span className="badge" data-tone={TONE[sts]}>
          {STS_NM[sts] ?? sts}
        </span>
      )}
      {sts === 'RJCT' && (
        <a href={`${apv}&sts=RJCT`} className="ms-1 text-xs text-accent-ink hover:underline">
          사유 보기
        </a>
      )}
    </td>
  )
}

// 등록 폼 공용 — 입력칸에서 엔터로 바로 제출되지 않게 막고(버튼 클릭만), 제출 전 확인 대화상자 (단어·도메인·용어·대표도메인 화면)
export function noEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
  const t = e.target as HTMLElement
  if (e.key === 'Enter' && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) e.preventDefault()
}
export const confirmSave = (edit: boolean, what = '') => confirm(edit ? `${what}수정 내용을 저장하시겠습니까?` : `${what}등록하시겠습니까?`)

// 등록자·등록일시 / 승인자·승인일시 열(한국 시간 분 단위) — 이관 데이터는 승인 요청이 없어 승인자 빈칸 (도메인·용어·대표도메인 화면 공용)
export function ActorCells({ nm, d }: { nm?: string | null; d?: string | null }) {
  const c = `whitespace-nowrap ${TD} text-xs text-ink-3`
  return (
    <>
      <td className={c}>{nm}</td>
      <td className={`${c} font-mono tabular-nums`}>{d ? new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16) : ''}</td>
    </>
  )
}

// 처리 열의 승인대기 — 승인 요청 화면(해당 유형 대기 목록)으로 이동, 승인·반려·취소는 그 화면에서 (도메인·용어·대표도메인 화면 공용)
export function ApvLink({ apv }: { apv: string }) {
  return (
    <a href={`${apv}&sts=REQ`} title="승인 요청 화면에서 승인·반려·취소" className="text-xs text-accent-ink hover:underline">
      승인대기
    </a>
  )
}

// 처리 열의 수정·삭제 아이콘 버튼 (단어·도메인 화면 공용)
export function RowActions({ onEdit, onRemove }: { onEdit: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={onEdit} aria-label="수정" title="수정" className="btn-ghost btn-icon btn-sm">
        <Pencil aria-hidden />
      </button>
      <button type="button" onClick={onRemove} aria-label="삭제" title="삭제" className="btn-ghost btn-icon btn-sm hover:text-danger">
        <Trash2 aria-hidden />
      </button>
    </span>
  )
}

// 페이지 이동 줄 — 왼쪽 건수, 가운데 번호(최대 5개)·처음·이전·다음·끝, 오른쪽 페이지당 건수. go 는 호출 화면이 범위를 맞춤 (단어·도메인·대표도메인 화면 공용)
export function Pager({ total, page, size, go, setSize }: { total: number; page: number; size: number; go: (p: number) => void; setSize: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  const nav = (p: number, label: string, Icon: LucideIcon, off: boolean) => (
    <button type="button" onClick={() => go(p)} disabled={off} aria-label={label} title={label} className="btn-ghost btn-icon btn-sm">
      <Icon className="rtl:rotate-180" aria-hidden />
    </button>
  )
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <span className="font-mono text-xs text-ink-3 tabular-nums">
        총 {total.toLocaleString()}건 · {page} / {pages}
      </span>
      <div className="mx-auto flex items-center gap-1">
        {nav(1, '처음', ChevronsLeft, page <= 1)}
        {nav(page - 1, '이전', ChevronLeft, page <= 1)}
        {Array.from({ length: Math.min(5, pages) }, (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i).map((p) => (
          <button key={p} type="button" onClick={() => go(p)} aria-current={p === page ? 'page' : undefined} className="btn-ghost btn-sm min-w-8 tabular-nums">
            {p}
          </button>
        ))}
        {nav(page + 1, '다음', ChevronRight, page >= pages)}
        {nav(pages, '끝', ChevronsRight, page >= pages)}
      </div>
      <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="input-sm w-auto" aria-label="페이지당 건수">
        {[10, 20, 50, 100].map((n) => (
          <option key={n} value={n}>
            {n}건씩
          </option>
        ))}
      </select>
    </div>
  )
}

// 표준구분코드(sql/033, 마스터 지시 2026-10-17) — STD 표준 / NSTD 비표준. 검색줄 조건·목록 열·등록 폼 공용
export const SE_NM: Record<string, string> = { STD: '표준', NSTD: '비표준' }
export function SeFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto" aria-label="표준구분">
      <option value="">전체 구분</option>
      {Object.entries(SE_NM).map(([c, n]) => (
        <option key={c} value={c}>
          {n}
        </option>
      ))}
    </select>
  )
}
export function SeCell({ se }: { se?: string | null }) {
  const n = se === 'NSTD'
  return (
    <td className={`whitespace-nowrap ${TD}`}>
      {n ? (
        <span className="badge" data-tone="warn" title="표준 규칙 예외로 수용">
          {SE_NM.NSTD}
        </span>
      ) : (
        <span className="text-xs text-ink-3">{SE_NM[se ?? 'STD'] ?? se}</span>
      )}
    </td>
  )
}
export function SeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-ink-2">표준구분</span>
      <select value={value || 'STD'} onChange={(e) => onChange(e.target.value)} className="input w-auto" aria-label="표준구분 선택">
        {Object.entries(SE_NM).map(([c, n]) => (
          <option key={c} value={c}>
            {n}
          </option>
        ))}
      </select>
    </label>
  )
}

// 검색줄 상태 필터(빈 값 = 전체)
export function StsFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input w-auto" aria-label="상태">
      <option value="">전체 상태</option>
      {['REQ', 'CNFM', 'RJCT'].map((c) => (
        <option key={c} value={c}>
          {STS_NM[c]}
        </option>
      ))}
    </select>
  )
}

// 등록·수정 폼의 승인 선택 항목 — SYS·DA(요금제4)만 즉시 승인 체크(기본 끔), 신청사유는 모든 신청자(선택)
export function ApvFields(p: { approver: boolean; selfApv: boolean; setSelfApv: (v: boolean) => void; rsn: string; setRsn: (v: string) => void }) {
  return (
    <>
      {p.approver && (
        <label className="inline-flex items-center gap-2 text-sm text-ink" title="등록 즉시 승인(자기 승인)">
          <input type="checkbox" checked={p.selfApv} onChange={(e) => p.setSelfApv(e.target.checked)} /> 즉시 승인
        </label>
      )}
      <input value={p.rsn} onChange={(e) => p.setRsn(e.target.value)} placeholder="신청사유" aria-label="신청사유(선택)" maxLength={2000} className="input w-64" />
    </>
  )
}

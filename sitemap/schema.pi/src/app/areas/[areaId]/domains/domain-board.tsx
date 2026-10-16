'use client'
import { piFetch } from '@pi/auth/client'
// 표준도메인 조회·등록·수정·삭제(클라이언트) — /api/areas/[areaId]/domains(목록·등록·상태 필터), /domains/[domId](수정·삭제, ver_no), /name-preview, /api/types
import { useCallback, useEffect, useState } from 'react'
import { can, type MbrRole } from '@/lib/roles'
import { ActorCells, ApvFields, ApvLink, StsCell, StsFilter, confirmSave, noEnterSubmit } from '../words/word-board'

interface Domain {
  dom_id: string
  key_dom_nm: string
  dom_nm: string
  dom_tp_cd: string
  dom_grp_id: string | null
  lgc_tp_cd: string
  data_len: number | null
  data_scale: number | null
  min_val_txt: string | null
  max_val_txt: string | null
  fmt_txt: string | null
  unit_nm: string | null
  alw_val_txt: string | null
  disp_fmt_txt: string | null
  dom_desc: string | null
  std_sts_cd: string
  pend_act?: string | null
  regr_nm?: string | null
  std_reg_dtm?: string
  apv_nm?: string | null
  apv_dtm?: string | null
  ver_no: number
  std_lgc_tp: { lgc_tp_nm: string } | null
  std_dom_grp: { dom_grp_nm: string } | null
}
interface LgcType {
  lgc_tp_cd: string
  lgc_tp_nm: string
  lgc_tp_abbr_nm: string
}
const TP_NM: Record<string, string> = { CD: '코드', NO: '번호', GNRL: '일반' }
const EMPTY = { key_dom_nm: '', dom_tp_cd: 'GNRL', dom_grp_id: '', lgc_tp_cd: '', data_len: '', data_scale: '', min_val_txt: '', max_val_txt: '', fmt_txt: '', disp_fmt_txt: '', unit_nm: '', alw_val_txt: '', dom_desc: '' }
type Field = keyof typeof EMPTY
// 목록 열 너비(#·도메인명·상태·대표도메인명·유형·그룹·논리타입·길이·설명·작업) 설명은 남는 폭
// 설명 = 표 폭의 30%, 나머지 열 = 값에 맞춰 자동(table-auto + 줄바꿈 없음)
const COL_W = ['', '', '', '', '', '', '', 'w-[30%]', '', '', '', '', '', '']

export default function DomainBoard({ areaId }: { areaId: string }) {
  const base = `/api/areas/${areaId}/domains`
  const [domains, setDomains] = useState<Domain[]>([])
  const [types, setTypes] = useState<LgcType[]>([])
  const [groups, setGroups] = useState<{ dom_grp_id: string; dom_grp_nm: string }[]>([])
  // 대표도메인명 선택지 = 속성 분류어(도메인 사용) 표준단어
  const [keyWords, setKeyWords] = useState<{ dic_id: string; dic_log_nm: string; dic_phy_nm: string }[]>([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [edit, setEdit] = useState<Domain | null>(null)
  const [preview, setPreview] = useState<{ dom_nm: string; dup: boolean } | null>(null)
  const [msg, setMsg] = useState('')

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

  // 조회 조건(검색어·상태·페이지·페이지 크기) — 바뀌면 서버에서 해당 페이지만 조회
  const [cond, setCond] = useState({ kw: '', sts: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.sts ? { sts: cond.sts } : {}) })
    const j = await (await piFetch(`${base}?${sp}`)).json()
    if (j.ok) {
      setDomains(j.domains)
      setTotal(j.total)
    } else setMsg(j.message)
  }, [base, cond])
  useEffect(() => {
    load()
  }, [load])
  const pages = Math.max(1, Math.ceil(total / cond.size))
  const go = (page: number) => setCond({ ...cond, page: Math.min(Math.max(1, page), pages) })

  // 선택지(논리타입·도메인그룹·대표도메인명 후보)는 화면 진입 시 1회
  useEffect(() => {
    piFetch('/api/types')
      .then((r) => r.json())
      .then((j) => j.ok && setTypes(j.types))
    piFetch(`/api/areas/${areaId}/domain-groups`)
      .then((r) => r.json())
      .then((j) => j.ok && setGroups(j.items))
    piFetch(`/api/areas/${areaId}/words?key=Y`)
      .then((r) => r.json())
      .then((j) => j.ok && setKeyWords(j.words.filter((w: { key_dom_yn: string }) => w.key_dom_yn === 'Y')))
  }, [areaId])

  // 도메인명 미리보기(0.3초 지연) — 수정 중 자기 이름과 같으면 중복 아님
  useEffect(() => {
    if (!form.key_dom_nm || !form.lgc_tp_cd) {
      setPreview(null)
      return
    }
    const t = setTimeout(async () => {
      const sp = new URLSearchParams({ key: form.key_dom_nm, lgc: form.lgc_tp_cd, len: form.data_len, scale: form.data_scale })
      const j = await (await piFetch(`${base}/name-preview?${sp}`)).json()
      setPreview(j.ok ? { dom_nm: j.dom_nm, dup: j.dup && j.dom_nm !== edit?.dom_nm } : null)
    }, 300)
    return () => clearTimeout(t)
  }, [form.key_dom_nm, form.lgc_tp_cd, form.data_len, form.data_scale, base, edit])

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })
  const reset = () => {
    setRsn('')
    setForm(EMPTY)
    setEdit(null)
    setPreview(null)
  }
  const startEdit = (d: Domain) => {
    setEdit(d)
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, String(d[k as keyof Domain] ?? '')])) as typeof EMPTY)
    setMsg('')
    window.scrollTo({ top: 0, behavior: 'smooth' }) // 등록·수정 영역이 목록 위에 있음
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
    const num = (v: string) => (v === '' ? null : Number(v))
    const vals = { ...form, data_len: num(form.data_len), data_scale: num(form.data_scale) }
    if (edit) {
      const body = { ver_no: edit.ver_no, ...apvOpt(), ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v === '' ? null : v])) }
      const j = await (await piFetch(`${base}/${edit.dom_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
      return done(j, `표준도메인 ${preview?.dom_nm ?? edit.dom_nm} 수정·승인 완료`)
    }
    const body = { ...Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== '' && v !== null)), ...apvOpt() }
    const j = await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    done(j, `표준도메인 ${j.domain?.dom_nm ?? ''} 등록·승인 완료`)
  }

  const remove = async (d: Domain) => {
    const now = d.std_sts_cd === 'RJCT' || (selfApprover && selfApv)
    if (!confirm(`${d.dom_nm} 도메인을 ${now ? '즉시 삭제' : '삭제 신청'}합니다`)) return
    const j = await (await piFetch(`${base}/${d.dom_id}?ver_no=${d.ver_no}${selfApprover && selfApv ? '&self_apv=1' : ''}`, { method: 'DELETE' })).json()
    done(j, `표준도메인 ${d.dom_nm} 삭제`)
  }

  const input = (k: Field, ph: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={form[k]} onChange={set(k)} placeholder={ph} className="w-full rounded border px-3 py-2" {...extra} />
  )

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={submit} onKeyDown={noEnterSubmit} className="overflow-hidden rounded-xl border border-[#c7d2e6] bg-gradient-to-b from-[#f4f7fc] to-[#e9eff9] text-sm shadow-md">
        <h2 className={`px-5 py-2.5 text-base font-semibold text-white ${edit ? 'bg-gradient-to-r from-[#b45309] to-[#d97706]' : 'bg-gradient-to-r from-[#1f3a68] to-[#3b5f9e]'}`}>
          {edit ? `도메인 수정 : ${edit.dom_nm}` : '도메인 등록'}
        </h2>
        <fieldset disabled={!requester} className="p-5 disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 [&_input]:border-[#b8c6e0] [&_input]:bg-white [&_input]:focus:outline-[#3b5f9e] [&_select]:border-[#b8c6e0] [&_select]:bg-white [&_select]:focus:outline-[#3b5f9e]">
            <select value={form.key_dom_nm} onChange={set('key_dom_nm')} className="w-full rounded border px-3 py-2" required aria-label="대표도메인명">
              <option value="">대표도메인명 선택(필수, 지정된 대표도메인)</option>
              {edit && !keyWords.some((w) => w.dic_log_nm === edit.key_dom_nm) && <option value={edit.key_dom_nm}>{edit.key_dom_nm} (지정된 대표도메인 아님)</option>}
              {keyWords.map((w) => (
                <option key={w.dic_id} value={w.dic_log_nm}>
                  {w.dic_log_nm} ({w.dic_phy_nm})
                </option>
              ))}
            </select>
            <select value={form.dom_tp_cd} onChange={set('dom_tp_cd')} className="w-full rounded border px-3 py-2" aria-label="도메인 유형">
              {Object.entries(TP_NM).map(([v, n]) => (
                <option key={v} value={v}>
                  유형 : {n}
                </option>
              ))}
            </select>
            <select value={form.dom_grp_id} onChange={set('dom_grp_id')} className="w-full rounded border px-3 py-2" required aria-label="도메인그룹">
              <option value="">도메인그룹 선택(필수)</option>
              {groups.map((g) => (
                <option key={g.dom_grp_id} value={g.dom_grp_id}>
                  그룹 : {g.dom_grp_nm}
                </option>
              ))}
            </select>
            <select value={form.lgc_tp_cd} onChange={set('lgc_tp_cd')} className="w-full rounded border px-3 py-2" required aria-label="논리 데이터타입">
              <option value="">논리 데이터타입 선택(필수)</option>
              {types.map((t) => (
                <option key={t.lgc_tp_cd} value={t.lgc_tp_cd}>
                  {t.lgc_tp_nm} ({t.lgc_tp_abbr_nm})
                </option>
              ))}
            </select>
            {input('data_len', '길이', { type: 'number', min: 1 })}
            {input('data_scale', '소수점', { type: 'number', min: 0, disabled: !form.data_len })}
            {input('min_val_txt', '최소값', { maxLength: 40 })}
            {input('max_val_txt', '최대값', { maxLength: 40 })}
            {input('fmt_txt', '저장형식(예 : 9999999.99)', { maxLength: 4000 })}
            {input('disp_fmt_txt', '표현형식(예 : 9,999,999.99)', { maxLength: 200 })}
            {input('unit_nm', '단위(예 : 원·%)', { maxLength: 50 })}
            {input('alw_val_txt', '허용값(범위·코드값)', { maxLength: 4000 })}
            <div className="md:col-span-2 lg:col-span-4">{input('dom_desc', '설명', { maxLength: 4000 })}</div>
          </div>
          {keyWords.length === 0 && (
            <p className="mt-2 text-red-700">
              속성 분류어로 지정된 표준단어가 없습니다 :{' '}
              <a href={`/areas/${areaId}/words`} className="underline">
                표준단어 등록
              </a>
              에서 &apos;속성 분류어 (도메인 사용)&apos;을 선택해 먼저 등록하십시오
            </p>
          )}
          {groups.length === 0 && <p className="mt-2 text-red-700">등록된 도메인그룹이 없습니다 : 설정 화면에서 먼저 등록하십시오</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            {preview && (
              <p className={preview.dup ? 'text-red-700' : 'text-gray-700'}>
                도메인명 : <b>{preview.dom_nm}</b>
                {preview.dup && ' (이미 있음)'}
              </p>
            )}
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <div className="ml-auto flex gap-2">
              {edit && (
                <button type="button" onClick={reset} className="rounded border bg-white px-5 py-2">
                  취소
                </button>
              )}
              <button disabled={preview?.dup} className="btn-3d px-8 disabled:opacity-40">
                {edit ? (edit.std_sts_cd === 'RJCT' ? '수정 후 재신청' : '수정 저장') : '등록'}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            대표도메인명은 지정된 대표도메인만 고를 수 있습니다 :{' '}
            <a href={`/areas/${areaId}/key-domains`} className="text-blue-700 underline">
              대표도메인 관리
            </a>
          </p>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색명(대표도메인명·도메인명)" className="flex-1 rounded border px-3 py-2 text-sm" />
          <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
          <button className="btn-3d">검색</button>
          <a href={`/api/areas/${areaId}/export/domains${cond.kw ? `?q=${encodeURIComponent(cond.kw)}` : ''}`} className="btn-3d btn-3d-green" download>
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
                {['#', '도메인명', '대표도메인명', '유형', '그룹', '논리타입', '길이', '설명', '등록자', '등록일시', '상태', '승인자', '승인일시', '처리'].map((h, i) => (
                  <th key={i} className="whitespace-nowrap border px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 ? (
                <tr>
                  <td colSpan={14} className="border px-2 py-4 text-center text-gray-500">
                    등록된 도메인이 없습니다
                  </td>
                </tr>
              ) : (
                domains.map((d, i) => (
                  <tr key={d.dom_id} className={edit?.dom_id === d.dom_id ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                    <td className="border px-2 py-1 text-center text-gray-500 tabular-nums">{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                    <td className="border px-2 py-1 font-medium">{d.dom_nm}</td>
                    <td className="border px-2 py-1">{d.key_dom_nm}</td>
                    <td className="border px-2 py-1 text-center">{TP_NM[d.dom_tp_cd] ?? d.dom_tp_cd}</td>
                    <td className="border px-2 py-1">{d.std_dom_grp?.dom_grp_nm}</td>
                    <td className="border px-2 py-1">{d.std_lgc_tp?.lgc_tp_nm}</td>
                    <td className="border px-2 py-1">{d.data_len ? `${d.data_len}${d.data_scale ? `,${d.data_scale}` : ''}` : ''}{d.unit_nm ? ` (${d.unit_nm})` : ''}</td>
                    <td className="border px-2 py-1 !whitespace-normal">{d.dom_desc}</td>
                    <ActorCells nm={d.regr_nm} d={d.std_reg_dtm} />
                    <StsCell sts={d.std_sts_cd} pend={d.pend_act} apv={`/areas/${areaId}/approvals?tp=DOM`} />
                    <ActorCells nm={d.apv_nm} d={d.apv_dtm} />
                    <td className="whitespace-nowrap border px-2 py-1 text-center">
                      {d.std_sts_cd === 'REQ' || d.pend_act ? (
                        <ApvLink apv={`/areas/${areaId}/approvals?tp=DOM`} />
                      ) : (
                        requester && (
                          <>
                            <button onClick={() => startEdit(d)} className="mr-2 text-blue-700 underline">
                              수정
                            </button>
                            <button onClick={() => remove(d)} className="text-red-700 underline">
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

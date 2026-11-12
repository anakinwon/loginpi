'use client'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
// 표준도메인 조회·등록·수정·삭제(클라이언트) — /api/areas/[areaId]/domains(목록·등록·상태 필터), /domains/[domId](수정·삭제, ver_no), /name-preview, /api/types
import { useCallback, useEffect, useState } from 'react'
import { type MbrRole, type Perm } from '@/lib/roles'
import { domTpByGrp, guessDomGroup } from '@/lib/bulk'
import { Download, TriangleAlert } from 'lucide-react'
import { InfoTip } from '@/components/page-head'
import { ActorCells, ApvFields, ApvLink, Pager, RowActions, SeCell, SeFilter, SeSelect, StsCell, StsFilter, TD, confirmSave, noEnterSubmit } from '../words/word-board'

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
  std_se_cd?: string
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
// 유형 = "값을 무엇으로 통제하느냐"(마스터 지시 2026-10-18) — 통제 대상·관리 항목·해당 분류 예
const TP_DESC: Record<string, { ctl: string; mng: string; ex: string }> = {
  CD: { ctl: '값의 집합', mng: '허용값 목록, 코드표(행정표준코드) 연계', ex: '코드, 여부, 구분' },
  NO: { ctl: '값의 생성 규칙', mng: '채번 규칙, 자릿수 구성, 체크디지트, 형식', ex: '번호, 일련번호, 등록번호' },
  GNRL: { ctl: '값의 형식만', mng: '타입, 길이, 저장·표현형식, 단위, 범위', ex: '명, 내용, 금액, 수량, 율, 연월일' },
}
const tpTitle = (c: string) => (TP_DESC[c] ? `${TP_NM[c]} : ${TP_DESC[c].ctl} 통제 — ${TP_DESC[c].mng} (예 : ${TP_DESC[c].ex})` : c)
const EMPTY = { key_dom_nm: '', dom_tp_cd: 'GNRL', dom_grp_id: '', lgc_tp_cd: '', data_len: '', data_scale: '', min_val_txt: '', max_val_txt: '', fmt_txt: '', disp_fmt_txt: '', unit_nm: '', alw_val_txt: '', dom_desc: '', std_se_cd: 'STD' }
type Field = keyof typeof EMPTY
// 목록 열 너비(#·도메인명·상태·대표도메인명·유형·그룹·논리타입·길이·설명·작업) 설명은 남는 폭
// 설명 = 표 폭의 30%, 나머지 열 = 값에 맞춰 자동(table-auto + 줄바꿈 없음)
const COL_W = ['', '', '', '', '', '', '', 'w-[30%]', '', '', '', '', '', '', '']

export default function DomainBoard({ areaId }: { areaId: string }) {
  const base = `/api/areas/${areaId}/domains`
  const [domains, setDomains] = useState<Domain[]>([])
  const [types, setTypes] = useState<LgcType[]>([])
  const [groups, setGroups] = useState<{ dom_grp_id: string; dom_grp_nm: string; dom_grp_desc?: string | null }[]>([])
  const [autoMsg, setAutoMsg] = useState('') // 대표도메인 선택 시 자동 선택 결과 안내
  // 대표도메인명 선택지 = 속성 분류어(도메인 사용) 표준단어
  const [keyWords, setKeyWords] = useState<{ dic_id: string; dic_log_nm: string; dic_phy_nm: string }[]>([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [edit, setEdit] = useState<Domain | null>(null)
  const [preview, setPreview] = useState<{ dom_nm: string; dup: boolean } | null>(null)
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
  // 승인 신청 선택 항목 — 자기 승인은 승인권자만, 신청사유는 입력했을 때만
  const apvOpt = () => ({ ...(selfApprover && selfApv ? { self_apv: true } : {}), ...(rsn.trim() ? { req_rsn: rsn.trim() } : {}) })

  // 조회 조건(검색어·상태·페이지·페이지 크기) — 바뀌면 서버에서 해당 페이지만 조회
  const [cond, setCond] = useState({ kw: '', sts: '', se: '', page: 1, size: 10 })
  const [total, setTotal] = useState(0)
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(cond.page), size: String(cond.size), ...(cond.kw ? { q: cond.kw } : {}), ...(cond.sts ? { sts: cond.sts } : {}), ...(cond.se ? { se: cond.se } : {}) })
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
  // 대표도메인 선택 → 도메인그룹·유형 자동 선택(마스터 지시 2026-10-18). 그룹 = ① 같은 대표도메인의 기존 도메인에서 가장 많이 쓴 그룹
  // ② 없으면 그룹명·그룹 설명 구성 목록으로 추정(guessDomGroup). 유형 = 그룹명 기준(번호 → 번호, 코드 → 코드, 그 외 일반 : '세 유형의 의미'). 못 찾으면 그대로 두고 사용자가 고름
  const pickKey = async (key: string) => {
    setForm((f) => ({ ...f, key_dom_nm: key }))
    setAutoMsg('')
    if (!key) return
    const j = await (await piFetch(`${base}?${new URLSearchParams({ q: key, size: '100' })}`)).json()
    const same: Domain[] = j.ok ? j.domains.filter((d: Domain) => d.key_dom_nm === key && d.dom_grp_id) : []
    const cnt = new Map<string, number>()
    for (const d of same) cnt.set(d.dom_grp_id as string, (cnt.get(d.dom_grp_id as string) ?? 0) + 1)
    const top = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0]
    const g = (top && groups.find((x) => x.dom_grp_id === top)) || guessDomGroup(key, groups)
    if (!g) return setAutoMsg('도메인그룹을 찾지 못했습니다 : 직접 고르십시오')
    const tp = domTpByGrp(g.dom_grp_nm)
    setForm((f) => (f.key_dom_nm === key ? { ...f, dom_grp_id: g.dom_grp_id, dom_tp_cd: tp } : f))
    setAutoMsg(`자동 선택 : 그룹 ${g.dom_grp_nm} · 유형 ${TP_NM[tp] ?? tp}${g.dom_grp_id === top ? ` (같은 대표도메인 도메인 ${cnt.get(top)}건 기준)` : ' (그룹 이름 기준)'} — 바꿀 수 있습니다`)
  }
  const reset = () => {
    setRsn('')
    setForm(EMPTY)
    setEdit(null)
    setAutoMsg('')
    setPreview(null)
  }
  const startEdit = (d: Domain) => {
    setEdit(d)
    setAutoMsg('')
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, String(d[k as keyof Domain] ?? '')])) as typeof EMPTY)
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

  // 입력칸 = 라벨 + 입력(placeholder 는 예시 값만)
  const input = (k: Field, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="field-label">{label}</span>
      <input value={form[k]} onChange={set(k)} className="input" {...extra} />
    </label>
  )

  return (
    <div className="space-y-6">
      <form onSubmit={submit} onKeyDown={noEnterSubmit} className="panel text-sm">
        <div className="panel-head" data-mode={edit ? 'edit' : undefined}>
          <h2 className="truncate">{edit ? `도메인 수정 : ${edit.dom_nm}` : '도메인 등록'}</h2>
          <div className="ms-auto flex items-center gap-2">
            {role && !requester && (
              <span className="badge" title="등록·수정·삭제는 신청 권한(역할·요금제)이 있어야 합니다">
                조회 전용
              </span>
            )}
            <InfoTip label="유형의 의미" align="end">
              <p className="mb-2 font-medium text-ink">유형 = 값을 무엇으로 통제하느냐</p>
              <dl className="space-y-1.5">
                {Object.entries(TP_DESC).map(([c, d]) => (
                  <div key={c}>
                    <dt className="font-medium text-ink">
                      {TP_NM[c]} · {d.ctl}
                    </dt>
                    <dd>
                      {d.mng} (예 : {d.ex})
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2">
                대표도메인명은 지정된 대표도메인만 고를 수 있습니다 :{' '}
                <Link href={`/areas/${areaId}/key-domains`} className="text-accent-ink hover:underline">
                  대표도메인 관리
                </Link>
              </p>
            </InfoTip>
          </div>
        </div>
        <fieldset disabled={!requester} className="panel-body disabled:opacity-60">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block">
                <span className="field-label req">유형</span>
                <select value={form.dom_tp_cd} onChange={set('dom_tp_cd')} className="input" aria-required title={tpTitle(form.dom_tp_cd)}>
                  {Object.entries(TP_NM).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n} — {TP_DESC[v].ctl}
                    </option>
                  ))}
                </select>
              </label>
              {TP_DESC[form.dom_tp_cd] && <p className="hint truncate">{TP_DESC[form.dom_tp_cd].mng}</p>}
            </div>
            <label className="block">
              <span className="field-label req">도메인그룹</span>
              <select value={form.dom_grp_id} onChange={set('dom_grp_id')} className="input" required aria-required>
                <option value="">선택</option>
                {groups.map((g) => (
                  <option key={g.dom_grp_id} value={g.dom_grp_id}>
                    {g.dom_grp_nm}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label className="block">
                <span className="field-label req">대표도메인명</span>
                <select value={form.key_dom_nm} onChange={(e) => void pickKey(e.target.value)} className="input" required aria-required>
                  <option value="">선택</option>
                  {edit && !keyWords.some((w) => w.dic_log_nm === edit.key_dom_nm) && <option value={edit.key_dom_nm}>{edit.key_dom_nm} (지정된 대표도메인 아님)</option>}
                  {keyWords.map((w) => (
                    <option key={w.dic_id} value={w.dic_log_nm}>
                      {w.dic_log_nm} ({w.dic_phy_nm})
                    </option>
                  ))}
                </select>
              </label>
              {autoMsg && <p className="hint">{autoMsg}</p>}
            </div>
            <label className="block">
              <span className="field-label req">논리 데이터타입</span>
              <select value={form.lgc_tp_cd} onChange={set('lgc_tp_cd')} className="input" required aria-required>
                <option value="">선택</option>
                {types.map((t) => (
                  <option key={t.lgc_tp_cd} value={t.lgc_tp_cd}>
                    {t.lgc_tp_nm} ({t.lgc_tp_abbr_nm})
                  </option>
                ))}
              </select>
            </label>
            {input('data_len', '길이', { type: 'number', min: 1 })}
            {input('data_scale', '소수점', { type: 'number', min: 0, disabled: !form.data_len })}
            {input('min_val_txt', '최소값', { maxLength: 40 })}
            {input('max_val_txt', '최대값', { maxLength: 40 })}
            {input('fmt_txt', '저장형식', { maxLength: 4000, placeholder: '9999999.99' })}
            {input('disp_fmt_txt', '표현형식', { maxLength: 200, placeholder: '9,999,999.99' })}
            {input('unit_nm', '단위', { maxLength: 50, placeholder: '원·%' })}
            {input('alw_val_txt', '허용값', { maxLength: 4000, placeholder: '범위·코드값' })}
            <div className="md:col-span-2 lg:col-span-4">{input('dom_desc', '설명', { maxLength: 4000 })}</div>
          </div>
          {keyWords.length === 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-danger">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                속성 분류어 표준단어가 없습니다 :{' '}
                <Link href={`/areas/${areaId}/words`} className="underline">
                  표준단어 등록
                </Link>
                에서 &apos;속성 분류어(도메인 사용)&apos;을 선택해 먼저 등록하십시오
              </span>
            </p>
          )}
          {groups.length === 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-danger">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              등록된 도메인그룹이 없습니다 : 설정 화면에서 먼저 등록하십시오
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {preview && (
              <span className="inline-flex items-center gap-2" title="도메인명(자동 생성)">
                <span className="chip-phy" data-size="lg">
                  {preview.dom_nm}
                </span>
                {preview.dup && (
                  <span className="badge" data-tone="danger">
                    이미 있음
                  </span>
                )}
              </span>
            )}
            <SeSelect value={form.std_se_cd} onChange={(v) => setForm({ ...form, std_se_cd: v })} />
            <ApvFields approver={selfApprover} selfApv={selfApv} setSelfApv={setSelfApv} rsn={rsn} setRsn={setRsn} />
            <div className="ms-auto flex gap-2">
              {edit && (
                <button type="button" onClick={reset} className="btn-key">
                  취소
                </button>
              )}
              <button disabled={preview?.dup} className="btn-3d">
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="대표도메인명·도메인명" aria-label="검색어(대표도메인명·도메인명)" className="input min-w-48 flex-1" />
          <StsFilter value={cond.sts} onChange={(sts) => setCond({ ...cond, sts, page: 1 })} />
          <SeFilter value={cond.se} onChange={(se) => setCond({ ...cond, se, page: 1 })} />
          <button className="btn-key">검색</button>
          <a href={`/api/areas/${areaId}/export/domains?${new URLSearchParams({ ...(cond.kw ? { q: cond.kw } : {}), ...(cond.se ? { se: cond.se } : {}) })}`} className="btn-key" download>
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
                {['#', '도메인명', '대표도메인명', '유형', '그룹', '논리타입', '길이', '설명', '등록자', '등록일시', '구분', '상태', '승인자', '승인일시', '처리'].map((h, i) => (
                  <th key={i} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {domains.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-3 py-6 text-center text-ink-3">
                    등록된 도메인이 없습니다
                  </td>
                </tr>
              ) : (
                domains.map((d, i) => (
                  <tr key={d.dom_id} data-mode={edit?.dom_id === d.dom_id ? 'edit' : undefined}>
                    <td className={`${TD} text-right font-mono text-xs text-ink-3 tabular-nums`}>{((cond.page - 1) * cond.size + i + 1).toLocaleString()}</td>
                    <td className={`${TD} font-medium`}>{d.dom_nm}</td>
                    <td className={TD}>{d.key_dom_nm}</td>
                    <td className={TD} title={tpTitle(d.dom_tp_cd)}>
                      <span className="badge">{TP_NM[d.dom_tp_cd] ?? d.dom_tp_cd}</span>
                    </td>
                    <td className={`${TD} text-ink-2`}>{d.std_dom_grp?.dom_grp_nm}</td>
                    <td className={`${TD} text-ink-2`}>{d.std_lgc_tp?.lgc_tp_nm}</td>
                    <td className={`${TD} text-right tabular-nums`}>{d.data_len ? `${d.data_len}${d.data_scale ? `,${d.data_scale}` : ''}` : ''}{d.unit_nm ? ` (${d.unit_nm})` : ''}</td>
                    <td className={`${TD} min-w-60 !whitespace-normal text-ink-2`}>{d.dom_desc}</td>
                    <ActorCells nm={d.regr_nm} d={d.std_reg_dtm} />
                    <SeCell se={d.std_se_cd} />
                    <StsCell sts={d.std_sts_cd} pend={d.pend_act} apv={`/areas/${areaId}/approvals?tp=DOM`} />
                    <ActorCells nm={d.apv_nm} d={d.apv_dtm} />
                    <td className={TD}>
                      {d.std_sts_cd === 'REQ' || d.pend_act ? <ApvLink apv={`/areas/${areaId}/approvals?tp=DOM`} /> : requester && <RowActions onEdit={() => startEdit(d)} onRemove={() => remove(d)} />}
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

'use client'
import { piFetch } from '@pi/auth/client'
// 분류체계 설정 폼 — GET/PATCH /api/areas/[areaId] : 바뀐 항목만 전송, 설정 권한자(SYS·DA) 외 읽기 전용
import { useCallback, useEffect, useState } from 'react'

type Area = Record<string, string | null>
const FLAGS = [
  ['word_use_yn', '표준단어'],
  ['term_use_yn', '용어'],
  ['dom_use_yn', '도메인'],
  ['combi_use_yn', '어휘구성'],
  ['cd_use_yn', '코드'],
  ['cd_dom_map_yn', '코드-도메인 매핑'],
] as const
const SEPS = [
  ['_', '밑줄( _ ) : CUST_NO'],
  ['-', '하이픈( - ) : CUST-NO'],
  ['', '없음 : CUSTNO'],
] as const

export default function AreaForm({ areaId }: { areaId: string }) {
  const base = `/api/areas/${areaId}`
  const [orig, setOrig] = useState<Area | null>(null)
  const [form, setForm] = useState<Area>({})
  const [admin, setAdmin] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const j = await (await piFetch(base)).json()
    if (!j.ok) {
      setMsg(j.message)
      return
    }
    setOrig(j.area)
    setForm(j.area)
    setAdmin((j.perms ?? []).includes('SETTINGS')) // 역할 ∩ 요금제
  }, [base])
  useEffect(() => {
    load()
  }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orig) return
    const body = Object.fromEntries(Object.entries(form).filter(([k, v]) => k !== 'area_id' && (v ?? '') !== (orig[k] ?? '')).map(([k, v]) => [k, k === 'area_desc' && v === '' ? null : v]))
    const j = await (await piFetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
    setMsg(j.ok ? '저장했습니다' : j.message)
    if (j.ok) load()
  }

  if (!orig) return <p className="text-sm text-ink-3">{msg || '불러오는 중'}</p>
  return (
    <form onSubmit={save} className="panel text-sm">
      <div className="panel-head">
        <h2 className="truncate">분류체계 설정</h2>
        {!admin && (
          <span className="badge ms-auto" title="분류체계 관리자만 변경할 수 있습니다">
            조회 전용
          </span>
        )}
      </div>
      <fieldset disabled={!admin} className="panel-body space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="field-label req">분류체계명</span>
            <input value={form.area_nm ?? ''} onChange={(e) => setForm({ ...form, area_nm: e.target.value })} className="input" aria-required="true" required maxLength={200} />
          </label>
          <label className="block">
            <span className="field-label">설명</span>
            <input value={form.area_desc ?? ''} onChange={(e) => setForm({ ...form, area_desc: e.target.value })} className="input" maxLength={4000} />
          </label>
        </div>
        <fieldset>
          <legend className="field-label">용어 물리명 구분자</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {SEPS.map(([v, n]) => (
              <label key={v} className="inline-flex items-center gap-2 text-sm">
                <input type="radio" name="sep" checked={(form.term_sep_txt ?? '') === v} onChange={() => setForm({ ...form, term_sep_txt: v })} /> {n}
              </label>
            ))}
          </div>
          <p className="hint">등록된 용어가 있으면 바꿀 수 없습니다</p>
        </fieldset>
        <fieldset>
          <legend className="field-label">사용여부</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {FLAGS.map(([k, n]) => (
              <label key={k} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form[k] === 'Y'} onChange={(e) => setForm({ ...form, [k]: e.target.checked ? 'Y' : 'N' })} /> {n}
              </label>
            ))}
          </div>
        </fieldset>
        {admin && (
          <div className="flex justify-end">
            <button className="btn-3d">저장</button>
          </div>
        )}
        {msg && (
          <p role="status" className="text-dense text-ink">
            {msg}
          </p>
        )}
      </fieldset>
    </form>
  )
}

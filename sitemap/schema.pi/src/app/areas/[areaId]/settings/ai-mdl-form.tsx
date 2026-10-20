'use client'
// 설정 > AI 분석 모델(2026-10-21, sql/070) — 모니터링 AI 원인 분석에 쓰는 제공사·모델·요금제·계정 등록, 기본 모델 1개 지정. 전역 관리자만(schema.pi 전체 설정)
// API 키는 등록하지 않음(서버 환경변수) — 제공사별 키 설정 여부만 표시
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'

type Prvd = 'CLAUDE' | 'GEMINI' | 'OPENAI'
interface Mdl {
  mdl_id: string
  prvd_cd: Prvd
  mdl_nm: string
  dsp_nm: string
  plan_nm: string
  acct_nm: string
  dflt_yn: 'Y' | 'N'
  ver_no: number
}
const PRVD_NM: Record<Prvd, string> = { CLAUDE: 'Claude(Anthropic)', GEMINI: 'Gemini(Google)', OPENAI: 'ChatGPT(OpenAI)' }
// 모델명 예시(제공사 API 의 모델 이름 그대로) — 입력 칸 안내용
const EX: Record<Prvd, string> = { CLAUDE: 'claude-opus-5-5', GEMINI: 'gemini-3.1-pro-preview', OPENAI: '모델 이름(OpenAI 콘솔 기준)' }
const API = '/api/mon/ai-mdl'
const EMPTY = { prvd_cd: 'CLAUDE' as Prvd, mdl_nm: '', dsp_nm: '', plan_nm: '', acct_nm: '', dflt_yn: 'N' as 'Y' | 'N' }

export default function AiMdlForm() {
  const [items, setItems] = useState<Mdl[]>([])
  const [keys, setKeys] = useState<Record<Prvd, { env: string; on: boolean }> | null>(null)
  const [deny, setDeny] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [edit, setEdit] = useState<Mdl | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const j = await (await piFetch(API)).json().catch(() => ({ ok: false, message: '불러오지 못했습니다' }))
    if (!j.ok) return setDeny(j.message ?? '불러오지 못했습니다')
    setItems(j.items)
    setKeys(j.keys)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const done = (j: { ok: boolean; message?: string }, ok: string) => {
    setMsg(j.ok ? ok : (j.message ?? '실패했습니다'))
    if (j.ok) {
      setForm(EMPTY)
      setEdit(null)
      void load()
    }
  }
  const send = async (method: string, body?: unknown, qs = '') =>
    (await piFetch(API + qs, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })).json()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    done(edit ? await send('PUT', { ...form, mdl_id: edit.mdl_id, ver_no: edit.ver_no }) : await send('POST', form), edit ? '수정했습니다' : '등록했습니다')
  }
  const remove = async (m: Mdl) => {
    if (!confirm(`${m.dsp_nm} 모델을 삭제합니다`)) return
    done(await send('DELETE', undefined, `?mdl=${m.mdl_id}&ver_no=${m.ver_no}`), '삭제했습니다')
  }
  const setDflt = async (m: Mdl) => done(await send('PUT', { ...m, dflt_yn: 'Y' }), `${m.dsp_nm} 을(를) 기본 모델로 지정했습니다`)

  if (deny) return <p className="text-sm text-gray-600">{deny}</p>
  const inp = 'min-w-40 flex-1 rounded border px-3 py-2'
  return (
    <section className="text-sm">
      <p className="mb-3 text-[#5b6578]">
        모니터링 &gt; 애플리케이션의 <b>AI 원인 분석</b>에 쓰는 모델입니다. 분석 결과에 여기 등록한 모델·요금제·계정이 함께 표시됩니다. API 키는 이 화면에 저장하지 않고 서버 환경변수로 둡니다.
      </p>
      {keys && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(PRVD_NM) as Prvd[]).map((p) => (
            <li key={p} className={`rounded border px-2 py-1 text-xs ${keys[p].on ? 'border-green-300 bg-green-50 text-green-800' : 'border-gray-300 bg-gray-50 text-gray-600'}`}>
              {PRVD_NM[p]} · <span className="font-mono">{keys[p].env}</span> {keys[p].on ? '설정됨' : '없음'}
            </li>
          ))}
        </ul>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left whitespace-nowrap">
              {['기본', '제공사', '표시명', '모델명(API)', '요금제(결제 모델)', '계정', ''].map((h, i) => (
                <th key={i} className="border px-2 py-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="border px-2 py-4 text-center text-gray-500">
                  등록된 모델이 없습니다 — 분석은 Claude Opus 5.5(요금제 미등록)로 진행됩니다
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.mdl_id} className={edit?.mdl_id === m.mdl_id ? 'bg-amber-50' : ''}>
                  <td className="border px-2 py-1 text-center">
                    {m.dflt_yn === 'Y' ? (
                      <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-white">기본</span>
                    ) : (
                      <button onClick={() => void setDflt(m)} className="text-xs text-blue-700 underline">
                        기본으로
                      </button>
                    )}
                  </td>
                  <td className="border px-2 py-1 whitespace-nowrap">
                    {PRVD_NM[m.prvd_cd]}
                    {keys && !keys[m.prvd_cd].on && <span className="ml-1 text-xs text-red-700">(키 없음)</span>}
                  </td>
                  <td className="border px-2 py-1">{m.dsp_nm}</td>
                  <td className="border px-2 py-1 font-mono text-xs">{m.mdl_nm}</td>
                  <td className="border px-2 py-1">{!m.plan_nm || m.plan_nm.startsWith('[') ? <span className="text-red-700">{m.plan_nm || '[미입력]'}</span> : m.plan_nm}</td>
                  <td className="border px-2 py-1">{m.acct_nm || <span className="text-gray-400">-</span>}</td>
                  <td className="border px-2 py-1 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEdit(m)
                        setForm({ prvd_cd: m.prvd_cd, mdl_nm: m.mdl_nm, dsp_nm: m.dsp_nm, plan_nm: m.plan_nm, acct_nm: m.acct_nm, dflt_yn: m.dflt_yn })
                      }}
                      className="mr-1 text-blue-700 underline"
                    >
                      수정
                    </button>
                    <button onClick={() => void remove(m)} className="text-red-700 underline">
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded border p-3">
        <span className="w-full font-semibold">{edit ? 'AI 분석 모델 수정' : 'AI 분석 모델 등록'}</span>
        <select aria-label="제공사" value={form.prvd_cd} onChange={(e) => setForm({ ...form, prvd_cd: e.target.value as Prvd })} className="rounded border px-3 py-2">
          {(Object.keys(PRVD_NM) as Prvd[]).map((p) => (
            <option key={p} value={p}>
              {PRVD_NM[p]}
            </option>
          ))}
        </select>
        <input aria-label="모델명" value={form.mdl_nm} onChange={(e) => setForm({ ...form, mdl_nm: e.target.value })} placeholder={`모델명(필수) 예 ${EX[form.prvd_cd]}`} required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._\-]*" className={inp} />
        <input aria-label="표시명" value={form.dsp_nm} onChange={(e) => setForm({ ...form, dsp_nm: e.target.value })} placeholder="표시명(필수) 예 Claude Opus 5.5" required maxLength={100} className={inp} />
        <input aria-label="요금제" value={form.plan_nm} onChange={(e) => setForm({ ...form, plan_nm: e.target.value })} placeholder="요금제(결제 모델) 예 API 종량제·무료 등급" maxLength={100} className={inp} />
        <input aria-label="계정" value={form.acct_nm} onChange={(e) => setForm({ ...form, acct_nm: e.target.value })} placeholder="계정(키 발급 조직·계정 표시명)" maxLength={100} className={inp} />
        <label className="flex items-center gap-1 py-2">
          <input type="checkbox" checked={form.dflt_yn === 'Y'} onChange={(e) => setForm({ ...form, dflt_yn: e.target.checked ? 'Y' : 'N' })} /> 기본 모델
        </label>
        <button className="rounded bg-gray-800 px-4 py-2 text-white">{edit ? '수정 저장' : '등록'}</button>
        {edit && (
          <button
            type="button"
            onClick={() => {
              setEdit(null)
              setForm(EMPTY)
            }}
            className="rounded border px-4 py-2"
          >
            취소
          </button>
        )}
      </form>
      {msg && (
        <p role="status" className="mt-2 text-gray-700">
          {msg}
        </p>
      )}
    </section>
  )
}

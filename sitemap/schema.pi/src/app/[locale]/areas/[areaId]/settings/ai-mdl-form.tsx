'use client'
// 설정 > AI 분석 모델(2026-10-21, sql/070) — 모니터링 AI 원인 분석에 쓰는 제공사·모델·요금제·계정 등록, 기본 모델 1개 지정. 전역 관리자만(schema.pi 전체 설정)
// API 키는 등록하지 않음(서버 환경변수) — 제공사별 키 설정 여부만 표시
import { piFetch } from '@pi/auth/client'
import { useCallback, useEffect, useState } from 'react'
import { InfoTip } from '@/components/page-head'
import { RowActions, TD } from '../words/word-board'

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

  if (deny) return <p className="text-sm text-ink-2">{deny}</p>
  // 입력칸 = 라벨 + 입력(라벨 = 접근성 이름)
  const field = (label: string, req: boolean, el: React.ReactNode) => (
    <label className="block">
      <span className={`field-label ${req ? 'req' : ''}`}>{label}</span>
      {el}
    </label>
  )
  return (
    <section className="space-y-6 text-sm">
      <form onSubmit={submit} className="panel">
        <div className="panel-head" data-mode={edit ? 'edit' : undefined}>
          <h2 className="truncate">{edit ? 'AI 분석 모델 수정' : 'AI 분석 모델 등록'}</h2>
          <InfoTip align="end">모니터링 &gt; 애플리케이션의 AI 원인 분석에 쓰는 모델입니다. 분석 결과에 여기 등록한 모델·요금제·계정이 함께 표시됩니다. API 키는 이 화면에 저장하지 않고 서버 환경변수로 둡니다.</InfoTip>
          {keys && (
            <ul className="ms-auto flex flex-wrap justify-end gap-1">
              {(Object.keys(PRVD_NM) as Prvd[]).map((p) => (
                <li key={p} className="badge" data-tone={keys[p].on ? 'ok' : undefined} title={`${keys[p].env} ${keys[p].on ? '설정됨' : '없음'}`}>
                  <span className="font-mono">{keys[p].env}</span> {keys[p].on ? '설정됨' : '없음'}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel-body">
          <div className="grid items-end gap-3 md:grid-cols-2 lg:grid-cols-5">
            {field(
              '제공사',
              true,
              <select value={form.prvd_cd} onChange={(e) => setForm({ ...form, prvd_cd: e.target.value as Prvd })} className="input">
                {(Object.keys(PRVD_NM) as Prvd[]).map((p) => (
                  <option key={p} value={p}>
                    {PRVD_NM[p]}
                  </option>
                ))}
              </select>,
            )}
            {field('모델명', true, <input value={form.mdl_nm} onChange={(e) => setForm({ ...form, mdl_nm: e.target.value })} placeholder={EX[form.prvd_cd]} aria-required="true" required maxLength={100} pattern="[A-Za-z0-9][A-Za-z0-9._\-]*" className="input font-mono" />)}
            {field('표시명', true, <input value={form.dsp_nm} onChange={(e) => setForm({ ...form, dsp_nm: e.target.value })} placeholder="Claude Opus 5.5" aria-required="true" required maxLength={100} className="input" />)}
            {field('요금제', false, <input value={form.plan_nm} onChange={(e) => setForm({ ...form, plan_nm: e.target.value })} placeholder="API 종량제" maxLength={100} className="input" />)}
            {field('계정', false, <input value={form.acct_nm} onChange={(e) => setForm({ ...form, acct_nm: e.target.value })} placeholder="계정 표시명" maxLength={100} className="input" />)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.dflt_yn === 'Y'} onChange={(e) => setForm({ ...form, dflt_yn: e.target.checked ? 'Y' : 'N' })} /> 기본 모델
            </label>
            <div className="ms-auto flex gap-2">
              {edit && (
                <button
                  type="button"
                  onClick={() => {
                    setEdit(null)
                    setForm(EMPTY)
                  }}
                  className="btn-key"
                >
                  취소
                </button>
              )}
              <button className="btn-3d">{edit ? '저장' : '등록'}</button>
            </div>
          </div>
          {msg && (
            <p role="status" className="mt-3 text-dense text-ink">
              {msg}
            </p>
          )}
        </div>
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-dense [&_td]:whitespace-nowrap">
          <thead>
            <tr className="thead-3d text-start">
              {['기본', '제공사', '표시명', '모델명(API)', '요금제', '계정', '처리'].map((h, i) => (
                <th key={i} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-ink-3">
                  등록된 모델 없음 · 기본 분석 = Claude Opus 5.5
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.mdl_id} data-mode={edit?.mdl_id === m.mdl_id ? 'edit' : undefined}>
                  <td className={TD}>
                    {m.dflt_yn === 'Y' ? (
                      <span className="badge" data-tone="accent">
                        기본
                      </span>
                    ) : (
                      <button type="button" onClick={() => void setDflt(m)} className="text-xs text-accent-ink hover:underline">
                        기본으로
                      </button>
                    )}
                  </td>
                  <td className={TD}>
                    {PRVD_NM[m.prvd_cd]}
                    {keys && !keys[m.prvd_cd].on && (
                      <span className="badge ms-1" data-tone="danger">
                        키 없음
                      </span>
                    )}
                  </td>
                  <td className={`${TD} font-medium`}>{m.dsp_nm}</td>
                  <td className={TD}>
                    <span className="chip-phy">{m.mdl_nm}</span>
                  </td>
                  <td className={TD}>{!m.plan_nm || m.plan_nm.startsWith('[') ? <span className="text-danger">{m.plan_nm || '[미입력]'}</span> : m.plan_nm}</td>
                  <td className={`${TD} text-ink-2`}>{m.acct_nm || <span className="text-ink-off">-</span>}</td>
                  <td className={`${TD} w-px`}>
                    <RowActions
                      onEdit={() => {
                        setEdit(m)
                        setForm({ prvd_cd: m.prvd_cd, mdl_nm: m.mdl_nm, dsp_nm: m.dsp_nm, plan_nm: m.plan_nm, acct_nm: m.acct_nm, dflt_yn: m.dflt_yn })
                      }}
                      onRemove={() => void remove(m)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

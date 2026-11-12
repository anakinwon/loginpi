'use client'
import { piFetch } from '@pi/auth/client'
// 설정 항목 목록·등록·수정·삭제(도메인그룹·약어 공용) — /api/areas/[areaId]/{path}, /{path}/[id](ver_no 낙관적 잠금)
import { useCallback, useEffect, useState } from 'react'
import { RowActions, TD } from '../words/word-board'

export interface ItemCfg {
  path: string
  pk: string
  title: string
  fields: { key: string; label: string; required?: boolean; max: number; pattern?: string }[]
}
type Item = Record<string, string | number | null>

// 도메인그룹 — 설정 화면 탭·표준도메인 › 도메인그룹 화면(2026-10-18) 공용
export const GRP_CFG: ItemCfg = {
  path: 'domain-groups',
  pk: 'dom_grp_id',
  title: '도메인그룹',
  fields: [
    { key: 'dom_grp_nm', label: '도메인그룹명', required: true, max: 200 },
    { key: 'dom_grp_desc', label: '설명', max: 4000 },
  ],
}

// parent = 상위 항목 조건(예 표준코드값 { cd_id }) : 목록 쿼리에 붙이고 등록 본문에 넣음
export default function ItemTable({ areaId, cfg, parent }: { areaId: string; cfg: ItemCfg; parent?: Record<string, string> }) {
  const base = `/api/areas/${areaId}/${cfg.path}`
  const qs = parent ? `?${new URLSearchParams(parent)}` : ''
  const empty = Object.fromEntries(cfg.fields.map((f) => [f.key, '']))
  const [items, setItems] = useState<Item[]>([])
  const [form, setForm] = useState<Record<string, string>>(empty)
  const [edit, setEdit] = useState<Item | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const j = await (await piFetch(base + qs)).json()
    if (j.ok) setItems(j.items)
    else setMsg(j.message)
  }, [base, qs])
  useEffect(() => {
    load()
  }, [load])

  const reset = () => {
    setForm(empty)
    setEdit(null)
  }
  const after = (j: { ok: boolean; message?: string }, ok: string) => {
    setMsg(j.ok ? ok : (j.message ?? ''))
    if (j.ok) {
      reset()
      load()
    }
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (edit) {
      const body = { ver_no: edit.ver_no, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) }
      after(await (await piFetch(`${base}/${encodeURIComponent(String(edit[cfg.pk]))}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), '수정했습니다')
      return
    }
    const body = { ...parent, ...Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '')) }
    after(await (await piFetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(), '등록했습니다')
  }
  const remove = async (it: Item) => {
    if (!confirm(`${it[cfg.fields[0].key]} 항목을 삭제합니다`)) return
    after(await (await piFetch(`${base}/${encodeURIComponent(String(it[cfg.pk]))}?ver_no=${it.ver_no}`, { method: 'DELETE' })).json(), '삭제했습니다')
  }

  return (
    <section className="space-y-6 text-sm">
      <form onSubmit={submit} className="panel">
        <div className="panel-head" data-mode={edit ? 'edit' : undefined}>
          <h2 className="truncate">{edit ? `${cfg.title} 수정` : `${cfg.title} 등록`}</h2>
        </div>
        <div className="panel-body">
          <div className="grid items-end gap-3 md:grid-cols-2 lg:grid-cols-4">
            {cfg.fields.map((f) => (
              <label key={f.key} className="block">
                <span className={`field-label ${f.required ? 'req' : ''}`}>{f.label}</span>
                <input
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  aria-required={f.required || undefined}
                  required={f.required}
                  maxLength={f.max}
                  pattern={f.pattern}
                  className="input"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 md:col-span-2 lg:col-span-4">
              {edit && (
                <button type="button" onClick={reset} className="btn-key">
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
        <table className="w-full border-collapse text-dense">
          <thead>
            <tr className="thead-3d text-start">
              {[...cfg.fields.map((f) => f.label), '처리'].map((h, i) => (
                <th key={i} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={cfg.fields.length + 1} className="px-3 py-6 text-center text-ink-3">
                  등록된 {cfg.title}이(가) 없습니다
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={String(it[cfg.pk])} data-mode={edit?.[cfg.pk] === it[cfg.pk] ? 'edit' : undefined}>
                  {cfg.fields.map((f, i) => (
                    <td key={f.key} className={`${TD} ${i === 0 ? 'font-medium' : 'text-ink-2'}`}>
                      {it[f.key]}
                    </td>
                  ))}
                  <td className={`${TD} w-px whitespace-nowrap`}>
                    <RowActions
                      onEdit={() => {
                        setEdit(it)
                        setForm(Object.fromEntries(cfg.fields.map((f) => [f.key, String(it[f.key] ?? '')])))
                      }}
                      onRemove={() => remove(it)}
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

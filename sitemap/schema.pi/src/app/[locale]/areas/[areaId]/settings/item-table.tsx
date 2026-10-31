'use client'
import { piFetch } from '@pi/auth/client'
// 설정 항목 목록·등록·수정·삭제(도메인그룹·약어 공용) — /api/areas/[areaId]/{path}, /{path}/[id](ver_no 낙관적 잠금)
import { useCallback, useEffect, useState } from 'react'

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
    <section className="text-sm">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            {[...cfg.fields.map((f) => f.label), ''].map((h, i) => (
              <th key={i} className="border px-2 py-1">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={cfg.fields.length + 1} className="border px-2 py-4 text-center text-gray-500">
                등록된 {cfg.title}이(가) 없습니다
              </td>
            </tr>
          ) : (
            items.map((it) => (
              <tr key={String(it[cfg.pk])} className={edit?.[cfg.pk] === it[cfg.pk] ? 'bg-amber-50' : ''}>
                {cfg.fields.map((f) => (
                  <td key={f.key} className="border px-2 py-1">
                    {it[f.key]}
                  </td>
                ))}
                <td className="whitespace-nowrap border px-2 py-1">
                  <button
                    onClick={() => {
                      setEdit(it)
                      setForm(Object.fromEntries(cfg.fields.map((f) => [f.key, String(it[f.key] ?? '')])))
                    }}
                    className="mr-1 text-blue-700 underline"
                  >
                    수정
                  </button>
                  <button onClick={() => remove(it)} className="text-red-700 underline">
                    삭제
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2 rounded border p-3">
        <span className="w-full font-semibold">{edit ? `${cfg.title} 수정` : `${cfg.title} 등록`}</span>
        {cfg.fields.map((f) => (
          <input
            key={f.key}
            value={form[f.key] ?? ''}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            placeholder={f.label + (f.required ? '(필수)' : '')}
            required={f.required}
            maxLength={f.max}
            pattern={f.pattern}
            className="min-w-40 flex-1 rounded border px-3 py-2"
          />
        ))}
        <button className="rounded bg-gray-800 px-4 py-2 text-white">{edit ? '수정 저장' : '등록'}</button>
        {edit && (
          <button type="button" onClick={reset} className="rounded border px-4 py-2">
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

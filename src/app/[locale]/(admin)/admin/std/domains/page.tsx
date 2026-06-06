'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DomainRow {
  dom_id: string
  dom_nm: string
  key_dom_nm: string
  key_dom_phy_nm: string
  dom_type_cd: string
  data_type_cd: string
  data_len: number | null
  data_scale: number | null
  dom_desc: string | null
  synced_at: string
}

const DOM_TYPE: Record<string, string> = {
  '0001': '코드',
  '0002': '식별자',
  '0003': '일반',
}
const DOM_TYPE_COLOR: Record<string, string> = {
  '0001': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  '0002': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '0003': 'bg-muted text-muted-foreground',
}
const DATA_TYPE: Record<string, string> = {
  '0003': 'VARCHAR/TEXT',
  '0013': 'INTEGER',
  '0015': 'NUMERIC',
  '0018': 'DATE',
  '0020': 'TIMESTAMP',
}

function fmtDataType(typeCd: string, len: number | null, scale: number | null): string {
  const base = DATA_TYPE[typeCd] ?? typeCd
  if (!len) return base
  if (scale) return `${base}(${len},${scale})`
  return `${base}(${len})`
}

const EMPTY_FORM = {
  dom_nm: '',
  key_dom_nm: '',
  key_dom_phy_nm: '',
  dom_type_cd: '0003',
  data_type_cd: '0003',
  data_len: '',
  data_scale: '',
  dom_desc: '',
}

export default function StdDomainsPage() {
  const [domains, setDomains] = useState<DomainRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<DomainRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (typeFilter) params.set('type', typeFilter)
    fetch(`/api/admin/std/domains?${params}`)
      .then((r) => r.json())
      .then((d: { domains: DomainRow[] }) => setDomains(d.domains ?? []))
      .finally(() => setLoading(false))
  }, [search, typeFilter])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(d: DomainRow) {
    setEditing(d)
    setForm({
      dom_nm: d.dom_nm,
      key_dom_nm: d.key_dom_nm,
      key_dom_phy_nm: d.key_dom_phy_nm,
      dom_type_cd: d.dom_type_cd,
      data_type_cd: d.data_type_cd,
      data_len: d.data_len?.toString() ?? '',
      data_scale: d.data_scale?.toString() ?? '',
      dom_desc: d.dom_desc ?? '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.dom_nm.trim() || !form.key_dom_nm.trim() || !form.key_dom_phy_nm.trim()) {
      toast.error('도메인명, 키도메인명, 키도메인물리명은 필수입니다')
      return
    }
    setSaving(true)
    try {
      const payload = {
        dom_nm: form.dom_nm,
        key_dom_nm: form.key_dom_nm,
        key_dom_phy_nm: form.key_dom_phy_nm,
        dom_type_cd: form.dom_type_cd,
        data_type_cd: form.data_type_cd,
        data_len: form.data_len ? parseInt(form.data_len) : null,
        data_scale: form.data_scale ? parseInt(form.data_scale) : null,
        dom_desc: form.dom_desc || null,
      }
      const url = editing ? `/api/admin/std/domains/${editing.dom_id}` : '/api/admin/std/domains'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '저장 실패')
      }
      toast.success(editing ? '수정됐습니다' : '등록됐습니다')
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string, nm: string) {
    if (!confirm(`"${nm}"을(를) 삭제하시겠습니까?`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/std/domains/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '삭제 실패')
      }
      toast.success('삭제됐습니다')
      setDomains((prev) => prev.filter((d) => d.dom_id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '오류 발생')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>표준도메인 관리</h1>
          <p className='text-muted-foreground mt-1 text-sm'>전체 {domains.length}건</p>
        </div>
        <Button onClick={openNew} size='sm'>+ 신규 등록</Button>
      </div>

      {/* 검색 + 필터 */}
      <div className='flex gap-2'>
        <Input
          placeholder='도메인명 / 키도메인명 검색…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='max-w-64'
        />
        <div className='flex gap-1'>
          {([['', '전체'], ['0001', '코드'], ['0002', '식별자'], ['0003', '일반']] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTypeFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                typeFilter === val
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 등록/수정 폼 */}
      {showForm && (
        <div className='rounded-lg border bg-muted/30 p-4 space-y-3'>
          <h2 className='font-semibold text-sm'>
            {editing ? '도메인 수정' : '신규 도메인 등록'}
          </h2>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>도메인명 *</span>
              <Input value={form.dom_nm} onChange={(e) => setForm((f) => ({ ...f, dom_nm: e.target.value }))} placeholder='예: 가격도메인' />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>키도메인명 *</span>
              <Input value={form.key_dom_nm} onChange={(e) => setForm((f) => ({ ...f, key_dom_nm: e.target.value }))} placeholder='예: 가격' />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>키도메인물리명 *</span>
              <Input value={form.key_dom_phy_nm} onChange={(e) => setForm((f) => ({ ...f, key_dom_phy_nm: e.target.value }))} placeholder='예: PRICE' />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>도메인 구분</span>
              <select
                value={form.dom_type_cd}
                onChange={(e) => setForm((f) => ({ ...f, dom_type_cd: e.target.value }))}
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
              >
                <option value='0001'>코드</option>
                <option value='0002'>식별자</option>
                <option value='0003'>일반</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>데이터 타입</span>
              <select
                value={form.data_type_cd}
                onChange={(e) => setForm((f) => ({ ...f, data_type_cd: e.target.value }))}
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
              >
                <option value='0003'>VARCHAR / TEXT</option>
                <option value='0013'>INTEGER</option>
                <option value='0015'>NUMERIC</option>
                <option value='0018'>DATE</option>
                <option value='0020'>TIMESTAMP</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>길이</span>
              <Input type='number' value={form.data_len} onChange={(e) => setForm((f) => ({ ...f, data_len: e.target.value }))} placeholder='예: 100' />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>소수점 자리</span>
              <Input type='number' value={form.data_scale} onChange={(e) => setForm((f) => ({ ...f, data_scale: e.target.value }))} placeholder='예: 2' />
            </label>
            <label className='col-span-2 space-y-1'>
              <span className='text-xs text-muted-foreground'>설명</span>
              <Input value={form.dom_desc} onChange={(e) => setForm((f) => ({ ...f, dom_desc: e.target.value }))} placeholder='도메인 설명 (선택)' />
            </label>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</Button>
            <Button size='sm' variant='outline' onClick={() => setShowForm(false)}>취소</Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : domains.length === 0 ? (
        <p className='text-muted-foreground text-sm'>도메인이 없습니다.</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>도메인명</th>
                <th className='text-left px-4 py-2 font-medium'>키도메인명</th>
                <th className='text-left px-4 py-2 font-medium'>물리명</th>
                <th className='text-left px-4 py-2 font-medium'>구분</th>
                <th className='text-left px-4 py-2 font-medium'>데이터 타입</th>
                <th className='text-left px-4 py-2 font-medium'>설명</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {domains.map((d) => (
                <tr key={d.dom_id} className='hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-3 font-medium'>{d.dom_nm}</td>
                  <td className='px-4 py-3'>{d.key_dom_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs'>{d.key_dom_phy_nm}</td>
                  <td className='px-4 py-3'>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOM_TYPE_COLOR[d.dom_type_cd] ?? ''}`}>
                      {DOM_TYPE[d.dom_type_cd] ?? d.dom_type_cd}
                    </span>
                  </td>
                  <td className='px-4 py-3 font-mono text-xs'>
                    {fmtDataType(d.data_type_cd, d.data_len, d.data_scale)}
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs max-w-52 truncate'>
                    {d.dom_desc ?? '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex gap-1'>
                      <Button variant='outline' size='sm' className='h-6 px-2 text-xs' onClick={() => openEdit(d)}>수정</Button>
                      <Button
                        variant='outline' size='sm' className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                        disabled={deleting === d.dom_id}
                        onClick={() => remove(d.dom_id, d.dom_nm)}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

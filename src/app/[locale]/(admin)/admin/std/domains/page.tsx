'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('admin.std.domains')
  const tc = useTranslations('common')
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
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
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
      toast.error(t('validationRequired'))
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
        throw new Error(d.error ?? t('saveFail'))
      }
      toast.success(editing ? t('editSuccess') : t('saveSuccess'))
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string, nm: string) {
    if (!confirm(t('deleteConfirm', { name: nm }))) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/std/domains/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('deleteFail'))
      }
      toast.success(t('deleteSuccess'))
      setDomains((prev) => prev.filter((d) => d.dom_id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>{t('title')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{t('totalCount', { count: domains.length })}</p>
        </div>
        <Button onClick={openNew} size='sm'>{tc('newRegister')}</Button>
      </div>

      <div className='flex gap-2'>
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='max-w-64'
        />
        <div className='flex gap-1'>
          {([['', t('typeFilter.all')], ['0001', t('typeFilter.code')], ['0002', t('typeFilter.id')], ['0003', t('typeFilter.general')]] as [string, string][]).map(([val, label]) => (
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

      {showForm && (
        <div className='rounded-lg border bg-muted/30 p-4 space-y-3'>
          <h2 className='font-semibold text-sm'>
            {editing ? t('formTitleEdit') : t('formTitleNew')}
          </h2>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.domNm')}</span>
              <Input value={form.dom_nm} onChange={(e) => setForm((f) => ({ ...f, dom_nm: e.target.value }))} placeholder={t('placeholder.domNm')} />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.keyDomNm')}</span>
              <Input value={form.key_dom_nm} onChange={(e) => setForm((f) => ({ ...f, key_dom_nm: e.target.value }))} placeholder={t('placeholder.keyDomNm')} />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.keyDomPhyNm')}</span>
              <Input value={form.key_dom_phy_nm} onChange={(e) => setForm((f) => ({ ...f, key_dom_phy_nm: e.target.value }))} placeholder={t('placeholder.keyDomPhyNm')} />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.domType')}</span>
              <select
                value={form.dom_type_cd}
                onChange={(e) => setForm((f) => ({ ...f, dom_type_cd: e.target.value }))}
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
              >
                <option value='0001'>{t('selectDomType.code')}</option>
                <option value='0002'>{t('selectDomType.id')}</option>
                <option value='0003'>{t('selectDomType.general')}</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.dataType')}</span>
              <select
                value={form.data_type_cd}
                onChange={(e) => setForm((f) => ({ ...f, data_type_cd: e.target.value }))}
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
              >
                <option value='0003'>{t('selectDataType.varchar')}</option>
                <option value='0013'>{t('selectDataType.integer')}</option>
                <option value='0015'>{t('selectDataType.numeric')}</option>
                <option value='0018'>{t('selectDataType.date')}</option>
                <option value='0020'>{t('selectDataType.timestamp')}</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.dataLen')}</span>
              <Input type='number' value={form.data_len} onChange={(e) => setForm((f) => ({ ...f, data_len: e.target.value }))} placeholder={t('placeholder.dataLen')} />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.dataScale')}</span>
              <Input type='number' value={form.data_scale} onChange={(e) => setForm((f) => ({ ...f, data_scale: e.target.value }))} placeholder={t('placeholder.dataScale')} />
            </label>
            <label className='col-span-2 space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.desc')}</span>
              <Input value={form.dom_desc} onChange={(e) => setForm((f) => ({ ...f, dom_desc: e.target.value }))} placeholder={t('placeholder.desc')} />
            </label>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' onClick={save} disabled={saving}>{saving ? tc('saving') : tc('save')}</Button>
            <Button size='sm' variant='outline' onClick={() => setShowForm(false)}>{tc('cancel')}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : domains.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('noData')}</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>{t('col.domNm')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.keyDomNm')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.phyNm')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.type')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.dataType')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.desc')}</th>
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
                      <Button variant='outline' size='sm' className='h-6 px-2 text-xs' onClick={() => openEdit(d)}>{tc('edit')}</Button>
                      <Button
                        variant='outline' size='sm' className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                        disabled={deleting === d.dom_id}
                        onClick={() => remove(d.dom_id, d.dom_nm)}
                      >
                        {tc('delete')}
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

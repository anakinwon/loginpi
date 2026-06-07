'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'

// p-6(48) + 제목+설명(56) + gap(16) + 검색입력(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지네이션(36)
const CHROME_PX = 257

interface WordRow {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_phy_fll_nm: string | null
  dic_desc: string | null
  data_type: string | null
  data_len: number | null
  apv_status: string
}

const STATUS_COLOR: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const EMPTY_FORM = {
  dic_log_nm: '',
  dic_phy_nm: '',
  dic_phy_fll_nm: '',
  dic_desc: '',
  data_type: '',
  data_len: '',
}

export default function StdWordsPage() {
  const t = useTranslations('admin.std.words')
  const tc = useTranslations('common')
  const [words, setWords] = useState<WordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WordRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // limit 또는 검색어 변경 시 첫 페이지로 리셋
  useEffect(() => { setPage(1) }, [limit, search])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    fetch(`/api/admin/std/words?${params}`)
      .then((r) => r.json())
      .then((d: { words: WordRow[] }) => setWords(d.words ?? []))
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(w: WordRow) {
    setEditing(w)
    setForm({
      dic_log_nm: w.dic_log_nm,
      dic_phy_nm: w.dic_phy_nm,
      dic_phy_fll_nm: w.dic_phy_fll_nm ?? '',
      dic_desc: w.dic_desc ?? '',
      data_type: w.data_type ?? '',
      data_len: w.data_len?.toString() ?? '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.dic_log_nm.trim() || !form.dic_phy_nm.trim()) {
      toast.error(t('validationRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        dic_log_nm: form.dic_log_nm,
        dic_phy_nm: form.dic_phy_nm,
        dic_phy_fll_nm: form.dic_phy_fll_nm || null,
        dic_desc: form.dic_desc || null,
        data_type: form.data_type || null,
        data_len: form.data_len ? parseInt(form.data_len) : null,
      }
      const url = editing ? `/api/admin/std/words/${editing.dic_id}` : '/api/admin/std/words'
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
      const res = await fetch(`/api/admin/std/words/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('deleteFail'))
      }
      toast.success(t('deleteSuccess'))
      setWords((prev) => prev.filter((w) => w.dic_id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setDeleting(null)
    }
  }

  const totalPages = Math.ceil(words.length / limit)
  const displayedWords = words.slice((page - 1) * limit, page * limit)

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>{t('title')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>{t('totalCount', { count: words.length })}</p>
        </div>
        <Button onClick={openNew} size='sm'>{tc('newRegister')}</Button>
      </div>

      <Input
        placeholder={t('searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className='max-w-64'
      />

      {showForm && (
        <div className='rounded-lg border bg-muted/30 p-4 space-y-3'>
          <h2 className='font-semibold text-sm'>{editing ? t('formTitleEdit') : t('formTitleNew')}</h2>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.logNm')}</span>
              <Input
                value={form.dic_log_nm}
                onChange={(e) => setForm((f) => ({ ...f, dic_log_nm: e.target.value }))}
                placeholder={t('placeholder.logNm')}
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.phyNmAbbr')}</span>
              <Input
                value={form.dic_phy_nm}
                onChange={(e) => setForm((f) => ({ ...f, dic_phy_nm: e.target.value }))}
                placeholder={t('placeholder.phyNmAbbr')}
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.phyNmFull')}</span>
              <Input
                value={form.dic_phy_fll_nm}
                onChange={(e) => setForm((f) => ({ ...f, dic_phy_fll_nm: e.target.value }))}
                placeholder={t('placeholder.phyNmFull')}
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.dataType')}</span>
              <Input
                value={form.data_type}
                onChange={(e) => setForm((f) => ({ ...f, data_type: e.target.value }))}
                placeholder={t('placeholder.dataType')}
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>{t('field.dataLen')}</span>
              <Input
                type='number'
                value={form.data_len}
                onChange={(e) => setForm((f) => ({ ...f, data_len: e.target.value }))}
                placeholder={t('placeholder.dataLen')}
              />
            </label>
            <label className='col-span-2 space-y-1 sm:col-span-3'>
              <span className='text-xs text-muted-foreground'>{t('field.desc')}</span>
              <Input
                value={form.dic_desc}
                onChange={(e) => setForm((f) => ({ ...f, dic_desc: e.target.value }))}
                placeholder={t('placeholder.desc')}
              />
            </label>
          </div>
          <div className='flex gap-2'>
            <Button size='sm' onClick={save} disabled={saving}>
              {saving ? tc('saving') : tc('save')}
            </Button>
            <Button size='sm' variant='outline' onClick={() => setShowForm(false)}>
              {tc('cancel')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className='text-muted-foreground text-sm'>{tc('loading')}</p>
      ) : words.length === 0 ? (
        <p className='text-muted-foreground text-sm'>{t('noData')}</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>{t('col.logNm')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.phyNmAbbr')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.phyNmFull')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.typeLen')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.status')}</th>
                <th className='text-left px-4 py-2 font-medium'>{t('col.desc')}</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {displayedWords.map((w) => (
                <tr key={w.dic_id} className='hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-3 font-medium'>{w.dic_log_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs'>{w.dic_phy_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {w.dic_phy_fll_nm ?? '—'}
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs'>
                    {w.data_type ? `${w.data_type}${w.data_len ? `(${w.data_len})` : ''}` : '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[w.apv_status] ?? ''}`}>
                      {w.apv_status}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs max-w-48 truncate'>
                    {w.dic_desc ?? '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex gap-1'>
                      <Button variant='outline' size='sm' className='h-6 px-2 text-xs' onClick={() => openEdit(w)}>
                        {tc('edit')}
                      </Button>
                      <Button
                        variant='outline' size='sm' className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                        disabled={deleting === w.dic_id}
                        onClick={() => remove(w.dic_id, w.dic_log_nm)}
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

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}

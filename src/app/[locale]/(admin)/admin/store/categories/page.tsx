'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { piFetch } from '@/lib/pi-fetch'

interface CtgrRow {
  ctgr_id: string
  parent_ctgr_id: string | null
  parent_nm: string | null
  ctgr_nm: string
  ctgr_desc: string | null
  sort_ord: number
  use_yn: 'Y' | 'N'
}

const EMPTY_FORM = {
  parent_ctgr_id: '',
  ctgr_nm: '',
  ctgr_desc: '',
  sort_ord: '',
  use_yn: 'Y',
}

export default function StoreCategoriesPage() {
  const t = useTranslations('admin.store.categories')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<CtgrRow[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CtgrRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    piFetch('/api/admin/store/categories')
      .then((r) => r.json())
      .then((d: { categories: CtgrRow[] }) => setRows(d.categories ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 대분류만 부모 후보 (2단계 제한)
  const parents = rows.filter((c) => !c.parent_ctgr_id)
  const childrenOf = (id: string) => rows.filter((c) => c.parent_ctgr_id === id)

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(c: CtgrRow) {
    setEditing(c)
    setForm({
      parent_ctgr_id: c.parent_ctgr_id ?? '',
      ctgr_nm: c.ctgr_nm,
      ctgr_desc: c.ctgr_desc ?? '',
      sort_ord: c.sort_ord.toString(),
      use_yn: c.use_yn,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.ctgr_nm.trim()) {
      toast.error(t('validationRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        parent_ctgr_id: form.parent_ctgr_id || null,
        ctgr_nm: form.ctgr_nm,
        ctgr_desc: form.ctgr_desc || null,
        sort_ord: form.sort_ord ? parseInt(form.sort_ord) : 0,
        use_yn: form.use_yn,
      }
      const url = editing
        ? `/api/admin/store/categories/${editing.ctgr_id}`
        : '/api/admin/store/categories'
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

  async function remove(c: CtgrRow) {
    if (!confirm(t('deleteConfirm', { name: c.ctgr_nm }))) return
    setDeleting(c.ctgr_id)
    try {
      const res = await piFetch(`/api/admin/store/categories/${c.ctgr_id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('deleteFail'))
      }
      toast.success(t('deleteSuccess'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setDeleting(null)
    }
  }

  function CtgrActions({ c }: { c: CtgrRow }) {
    return (
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => openEdit(c)}
        >
          {tc('edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive h-6 px-2 text-xs"
          disabled={deleting === c.ctgr_id}
          onClick={() => remove(c)}
        >
          {tc('delete')}
        </Button>
      </div>
    )
  }

  function Row({ c, child }: { c: CtgrRow; child?: boolean }) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
          child ? 'bg-background ml-6' : 'bg-muted/30 font-medium'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {child ? '↳ ' : ''}
            {c.ctgr_nm}
          </span>
          {c.use_yn === 'N' && (
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {t('disabled')}
            </span>
          )}
          {c.ctgr_desc && (
            <span className="text-muted-foreground hidden truncate text-xs sm:inline">
              {c.ctgr_desc}
            </span>
          )}
          <span className="text-muted-foreground shrink-0 text-xs">
            #{c.sort_ord}
          </span>
        </div>
        <CtgrActions c={c} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('totalCount', { count: rows.length })}
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          {tc('newRegister')}
        </Button>
      </div>

      {showForm && (
        <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            {editing ? t('formTitleEdit') : t('formTitleNew')}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.parent')}
              </span>
              <select
                value={form.parent_ctgr_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, parent_ctgr_id: e.target.value }))
                }
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">{t('rootOption')}</option>
                {parents
                  .filter((p) => p.ctgr_id !== editing?.ctgr_id)
                  .map((p) => (
                    <option key={p.ctgr_id} value={p.ctgr_id}>
                      {p.ctgr_nm}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.name')}
              </span>
              <Input
                value={form.ctgr_nm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ctgr_nm: e.target.value }))
                }
                placeholder={t('placeholder.name')}
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.sortOrd')}
              </span>
              <Input
                type="number"
                value={form.sort_ord}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_ord: e.target.value }))
                }
                placeholder="0"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.useYn')}
              </span>
              <select
                value={form.use_yn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, use_yn: e.target.value }))
                }
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="Y">{t('useY')}</option>
                <option value="N">{t('useN')}</option>
              </select>
            </label>
            <label className="col-span-2 space-y-1 sm:col-span-4">
              <span className="text-muted-foreground text-xs">
                {t('field.desc')}
              </span>
              <Input
                value={form.ctgr_desc}
                onChange={(e) =>
                  setForm((f) => ({ ...f, ctgr_desc: e.target.value }))
                }
                placeholder={t('placeholder.desc')}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? tc('saving') : tc('save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              {tc('cancel')}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
      ) : (
        <div className="space-y-2">
          {parents.map((p) => (
            <div key={p.ctgr_id} className="space-y-1.5">
              <Row c={p} />
              {childrenOf(p.ctgr_id).map((ch) => (
                <Row key={ch.ctgr_id} c={ch} child />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

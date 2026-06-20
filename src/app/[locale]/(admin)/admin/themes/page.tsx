'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'

// p-6 + 제목/설명 + 검색·필터 + 테이블헤더 + 페이지네이션 (domains와 동일 기준)
const CHROME_PX = 257

interface ThemeRow {
  theme_cd: string
  theme_nm: string
  theme_emoji: string
  theme_desc: string | null
  theme_tp_cd: 'BASIC' | 'PREMIUM'
  sort_ord: number
  use_yn: 'Y' | 'N'
}

const TP_LABEL: Record<string, string> = {
  BASIC: '일반',
  PREMIUM: '프리미엄',
}
const TP_COLOR: Record<string, string> = {
  BASIC: 'bg-muted text-muted-foreground',
  PREMIUM:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
}

const EMPTY_FORM = {
  theme_cd: '',
  theme_nm: '',
  theme_emoji: '',
  theme_tp_cd: 'BASIC',
  sort_ord: '',
  theme_desc: '',
  use_yn: 'Y',
}

export default function AdminThemesPage() {
  const t = useTranslations('admin.themes')
  const tc = useTranslations('common')
  const [themes, setThemes] = useState<ThemeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tpFilter, setTpFilter] = useState('')

  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<ThemeRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
  }, [limit, search, tpFilter])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (tpFilter) params.set('tp', tpFilter)
    fetch(`/api/admin/themes?${params}`)
      .then((r) => r.json())
      .then((d: { themes: ThemeRow[] }) => setThemes(d.themes ?? []))
      .finally(() => setLoading(false))
  }, [search, tpFilter])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(th: ThemeRow) {
    setEditing(th)
    setForm({
      theme_cd: th.theme_cd,
      theme_nm: th.theme_nm,
      theme_emoji: th.theme_emoji,
      theme_tp_cd: th.theme_tp_cd,
      sort_ord: th.sort_ord?.toString() ?? '',
      theme_desc: th.theme_desc ?? '',
      use_yn: th.use_yn,
    })
    setShowForm(true)
  }

  async function save() {
    if (!editing && !/^[A-Z0-9_]{1,20}$/.test(form.theme_cd.trim())) {
      toast.error(t('validationCd'))
      return
    }
    if (!form.theme_nm.trim() || !form.theme_emoji.trim()) {
      toast.error(t('validationRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = {
        theme_nm: form.theme_nm,
        theme_emoji: form.theme_emoji,
        theme_tp_cd: form.theme_tp_cd,
        sort_ord: form.sort_ord ? parseInt(form.sort_ord) : 0,
        theme_desc: form.theme_desc || null,
        use_yn: form.use_yn,
        ...(editing ? {} : { theme_cd: form.theme_cd.trim().toUpperCase() }),
      }
      const url = editing
        ? `/api/admin/themes/${editing.theme_cd}`
        : '/api/admin/themes'
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

  async function remove(themeCd: string, nm: string) {
    if (!confirm(t('deleteConfirm', { name: nm }))) return
    setDeleting(themeCd)
    try {
      const res = await fetch(`/api/admin/themes/${themeCd}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('deleteFail'))
      }
      toast.success(t('deleteSuccess'))
      setThemes((prev) => prev.filter((th) => th.theme_cd !== themeCd))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setDeleting(null)
    }
  }

  const totalPages = Math.ceil(themes.length / limit)
  const displayed = themes.slice((page - 1) * limit, page * limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('totalCount', { count: themes.length })}
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          {tc('newRegister')}
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-64"
        />
        <div className="flex gap-1">
          {(
            [
              ['', t('tpFilter.all')],
              ['BASIC', t('tpFilter.basic')],
              ['PREMIUM', t('tpFilter.premium')],
            ] as [string, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTpFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tpFilter === val
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
        <div className="bg-muted/30 space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            {editing ? t('formTitleEdit') : t('formTitleNew')}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.cd')}
              </span>
              <Input
                value={form.theme_cd}
                disabled={!!editing}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    theme_cd: e.target.value.toUpperCase(),
                  }))
                }
                placeholder={t('placeholder.cd')}
                className="font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.nm')}
              </span>
              <Input
                value={form.theme_nm}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_nm: e.target.value }))
                }
                placeholder={t('placeholder.nm')}
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.emoji')}
              </span>
              <Input
                value={form.theme_emoji}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_emoji: e.target.value }))
                }
                placeholder="⚽"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">
                {t('field.tp')}
              </span>
              <select
                value={form.theme_tp_cd}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_tp_cd: e.target.value }))
                }
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="BASIC">{t('selectTp.basic')}</option>
                <option value="PREMIUM">{t('selectTp.premium')}</option>
              </select>
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
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="Y">{t('useYnOn')}</option>
                <option value="N">{t('useYnOff')}</option>
              </select>
            </label>
            <label className="col-span-2 space-y-1 sm:col-span-3">
              <span className="text-muted-foreground text-xs">
                {t('field.desc')}
              </span>
              <Input
                value={form.theme_desc}
                onChange={(e) =>
                  setForm((f) => ({ ...f, theme_desc: e.target.value }))
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
      ) : themes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.theme')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.cd')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.tp')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.sortOrd')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.useYn')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.desc')}
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((th) => (
                <tr
                  key={th.theme_cd}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="mr-1.5">{th.theme_emoji}</span>
                    {th.theme_nm}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{th.theme_cd}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${TP_COLOR[th.theme_tp_cd] ?? ''}`}
                    >
                      {TP_LABEL[th.theme_tp_cd] ?? th.theme_tp_cd}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{th.sort_ord}</td>
                  <td className="px-4 py-3">
                    {th.use_yn === 'Y' ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {t('useYnOn')}
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                        {t('useYnOff')}
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground max-w-52 truncate px-4 py-3 text-xs">
                    {th.theme_desc ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => openEdit(th)}
                      >
                        {tc('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive h-6 px-2 text-xs"
                        disabled={deleting === th.theme_cd}
                        onClick={() => remove(th.theme_cd, th.theme_nm)}
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

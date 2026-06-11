'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'
import { AdminPagination } from '@/components/admin/admin-pagination'

// p-6(48) + 제목+설명(56) + gap(16) + 검색입력(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지네이션(36)
const CHROME_PX = 257

interface TermRow {
  term_id: string
  term_log_nm: string
  term_phy_nm: string
  term_phy_fll_nm: string | null
  term_desc: string | null
  apv_status: string
}

interface WordOption {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
}

interface DomainOption {
  dom_id: string
  dom_nm: string
  key_dom_nm: string
  key_dom_phy_nm: string
}

export default function StdTermsPage() {
  const t = useTranslations('admin.std.terms')
  const tc = useTranslations('common')
  const [terms, setTerms] = useState<TermRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [allWords, setAllWords] = useState<WordOption[]>([])
  const [allDomains, setAllDomains] = useState<DomainOption[]>([])

  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  // limit·검색어 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setPage(1)
  }, [limit, search])

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TermRow | null>(null)
  const [termLogNm, setTermLogNm] = useState('')
  const [selectedWords, setSelectedWords] = useState<WordOption[]>([])
  const [selectedDomain, setSelectedDomain] = useState<DomainOption | null>(
    null,
  )
  const [termDesc, setTermDesc] = useState('')
  const [wordSearch, setWordSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const autoPhyNm = useMemo(() => {
    if (!selectedDomain) return ''
    const parts = [
      ...selectedWords.map((w) => w.dic_phy_nm),
      selectedDomain.key_dom_phy_nm,
    ]
    return parts.join('_').toLowerCase()
  }, [selectedWords, selectedDomain])

  const autoPhyFllNm = useMemo(() => autoPhyNm.toUpperCase(), [autoPhyNm])

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    fetch(`/api/admin/std/terms?${params}`)
      .then((r) => r.json())
      .then((d: { terms: TermRow[] }) => setTerms(d.terms ?? []))
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    fetch('/api/admin/std/words')
      .then((r) => r.json())
      .then((d: { words: WordOption[] }) => setAllWords(d.words ?? []))
    fetch('/api/admin/std/domains')
      .then((r) => r.json())
      .then((d: { domains: DomainOption[] }) => setAllDomains(d.domains ?? []))
  }, [])

  const filteredWords = useMemo(() => {
    const q = wordSearch.toLowerCase()
    return allWords.filter(
      (w) =>
        !selectedWords.some((s) => s.dic_id === w.dic_id) &&
        (w.dic_log_nm.includes(q) || w.dic_phy_nm.toLowerCase().includes(q)),
    )
  }, [allWords, selectedWords, wordSearch])

  function openNew() {
    setEditing(null)
    setTermLogNm('')
    setSelectedWords([])
    setSelectedDomain(null)
    setTermDesc('')
    setWordSearch('')
    setShowForm(true)
  }

  function openEdit(term: TermRow) {
    setEditing(term)
    setTermLogNm(term.term_log_nm)
    setSelectedWords([])
    setSelectedDomain(null)
    setTermDesc(term.term_desc ?? '')
    setWordSearch('')
    setShowForm(true)
  }

  function addWord(w: WordOption) {
    setSelectedWords((prev) => [...prev, w])
    setWordSearch('')
  }

  function removeWord(id: string) {
    setSelectedWords((prev) => prev.filter((w) => w.dic_id !== id))
  }

  async function save() {
    if (!termLogNm.trim()) {
      toast.error(t('validationLogNm'))
      return
    }
    if (!editing && (!selectedDomain || selectedWords.length === 0)) {
      toast.error(t('validationWordDomain'))
      return
    }

    const term_phy_nm =
      editing && !selectedDomain ? editing.term_phy_nm : autoPhyNm
    const term_phy_fll_nm =
      editing && !selectedDomain
        ? (editing.term_phy_fll_nm ?? '')
        : autoPhyFllNm

    if (!term_phy_nm) {
      toast.error(t('validationPhyNm'))
      return
    }

    setSaving(true)
    try {
      const payload = {
        term_log_nm: termLogNm,
        term_phy_nm,
        term_phy_fll_nm,
        term_desc: termDesc || null,
      }
      const url = editing
        ? `/api/admin/std/terms/${editing.term_id}`
        : '/api/admin/std/terms'
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
      const res = await fetch(`/api/admin/std/terms/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('deleteFail'))
      }
      toast.success(t('deleteSuccess'))
      setTerms((prev) => prev.filter((term) => term.term_id !== id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tc('error'))
    } finally {
      setDeleting(null)
    }
  }

  const totalPages = Math.ceil(terms.length / limit)
  const displayedTerms = terms.slice((page - 1) * limit, page * limit)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('totalCount', { count: terms.length })}
          </p>
        </div>
        <Button onClick={openNew} size="sm">
          {tc('newRegister')}
        </Button>
      </div>

      <Input
        placeholder={t('searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-64"
      />

      {showForm && (
        <div className="bg-muted/30 space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            {editing ? t('formTitleEdit') : t('formTitleNew')}
          </h2>

          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">
              {t('field.logNm')}
            </span>
            <Input
              value={termLogNm}
              onChange={(e) => setTermLogNm(e.target.value)}
              placeholder={t('placeholder.logNm')}
              className="max-w-64"
            />
          </label>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">
              {t('field.wordSelect')}{' '}
              <span className="text-muted-foreground/60">
                {t('field.wordSelectHint')}
              </span>
            </p>

            {selectedWords.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedWords.map((w, i) => (
                  <span
                    key={w.dic_id}
                    className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  >
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {w.dic_log_nm}
                    <span className="font-mono">({w.dic_phy_nm})</span>
                    <button
                      onClick={() => removeWord(w.dic_id)}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative max-w-64">
              <Input
                value={wordSearch}
                onChange={(e) => setWordSearch(e.target.value)}
                placeholder={t('placeholder.wordSearch')}
              />
              {wordSearch && filteredWords.length > 0 && (
                <div className="bg-background absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border shadow-lg">
                  {filteredWords.slice(0, 10).map((w) => (
                    <button
                      key={w.dic_id}
                      onClick={() => addWord(w)}
                      className="hover:bg-muted flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                    >
                      <span>{w.dic_log_nm}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {w.dic_phy_nm}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs font-medium">
              {t('field.domainSelect')}
            </span>
            <select
              value={selectedDomain?.dom_id ?? ''}
              onChange={(e) => {
                const found =
                  allDomains.find((d) => d.dom_id === e.target.value) ?? null
                setSelectedDomain(found)
              }}
              className="border-input bg-background h-9 w-full max-w-64 rounded-md border px-3 text-sm"
            >
              <option value="">{t('placeholder.domainSelect')}</option>
              {allDomains.map((d) => (
                <option key={d.dom_id} value={d.dom_id}>
                  {d.dom_nm} ({d.key_dom_phy_nm})
                </option>
              ))}
            </select>
          </label>

          {autoPhyNm && (
            <div className="bg-muted space-y-0.5 rounded-md px-3 py-2">
              <p className="text-muted-foreground text-xs">
                {t('field.autoPhyNm')}
              </p>
              <p className="font-mono text-sm">{autoPhyNm}</p>
              <p className="text-muted-foreground font-mono text-xs">
                {autoPhyFllNm}
              </p>
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-muted-foreground text-xs">
              {t('field.desc')}
            </span>
            <Input
              value={termDesc}
              onChange={(e) => setTermDesc(e.target.value)}
              placeholder={t('placeholder.desc')}
              className="max-w-96"
            />
          </label>

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
      ) : terms.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.logNm')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.phyNmLower')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.phyNmUpper')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.desc')}
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayedTerms.map((term) => (
                <tr
                  key={term.term_id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{term.term_log_nm}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {term.term_phy_nm}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
                    {term.term_phy_fll_nm ?? '—'}
                  </td>
                  <td className="text-muted-foreground max-w-56 truncate px-4 py-3 text-xs">
                    {term.term_desc ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => openEdit(term)}
                      >
                        {tc('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive h-6 px-2 text-xs"
                        disabled={deleting === term.term_id}
                        onClick={() => remove(term.term_id, term.term_log_nm)}
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

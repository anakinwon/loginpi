'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

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
  const [terms, setTerms] = useState<TermRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // 단어·도메인 옵션 (신규/수정 폼용)
  const [allWords, setAllWords] = useState<WordOption[]>([])
  const [allDomains, setAllDomains] = useState<DomainOption[]>([])

  // 폼 상태
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TermRow | null>(null)
  const [termLogNm, setTermLogNm] = useState('')
  const [selectedWords, setSelectedWords] = useState<WordOption[]>([])
  const [selectedDomain, setSelectedDomain] = useState<DomainOption | null>(null)
  const [termDesc, setTermDesc] = useState('')
  const [wordSearch, setWordSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // 물리명 자동 생성
  const autoPhyNm = useMemo(() => {
    if (!selectedDomain) return ''
    const parts = [...selectedWords.map((w) => w.dic_phy_nm), selectedDomain.key_dom_phy_nm]
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
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  // 단어·도메인 목록은 한 번만 로드
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
        (w.dic_log_nm.includes(q) || w.dic_phy_nm.toLowerCase().includes(q))
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

  function openEdit(t: TermRow) {
    setEditing(t)
    setTermLogNm(t.term_log_nm)
    setSelectedWords([])
    setSelectedDomain(null)
    setTermDesc(t.term_desc ?? '')
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
      toast.error('논리명은 필수입니다')
      return
    }
    if (!editing && (!selectedDomain || selectedWords.length === 0)) {
      toast.error('구성 단어와 도메인을 선택해야 합니다')
      return
    }

    const term_phy_nm = editing && !selectedDomain ? editing.term_phy_nm : autoPhyNm
    const term_phy_fll_nm = editing && !selectedDomain ? (editing.term_phy_fll_nm ?? '') : autoPhyFllNm

    if (!term_phy_nm) {
      toast.error('물리명을 생성할 수 없습니다')
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
      const url = editing ? `/api/admin/std/terms/${editing.term_id}` : '/api/admin/std/terms'
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
      const res = await fetch(`/api/admin/std/terms/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '삭제 실패')
      }
      toast.success('삭제됐습니다')
      setTerms((prev) => prev.filter((t) => t.term_id !== id))
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
          <h1 className='text-2xl font-bold'>표준용어 관리</h1>
          <p className='text-muted-foreground mt-1 text-sm'>전체 {terms.length}건</p>
        </div>
        <Button onClick={openNew} size='sm'>+ 신규 등록</Button>
      </div>

      <Input
        placeholder='논리명 / 물리명 검색…'
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className='max-w-64'
      />

      {showForm && (
        <div className='rounded-lg border bg-muted/30 p-4 space-y-4'>
          <h2 className='font-semibold text-sm'>{editing ? '용어 수정' : '신규 표준용어 등록'}</h2>

          {/* 논리명 */}
          <label className='block space-y-1'>
            <span className='text-xs text-muted-foreground'>논리명 *</span>
            <Input
              value={termLogNm}
              onChange={(e) => setTermLogNm(e.target.value)}
              placeholder='예: 사원명'
              className='max-w-64'
            />
          </label>

          {/* 구성 단어 선택 */}
          <div className='space-y-2'>
            <p className='text-xs text-muted-foreground font-medium'>
              구성 단어 선택 * <span className='text-muted-foreground/60'>(추가 순서 = 물리명 순서)</span>
            </p>

            {/* 선택된 단어 배지 */}
            {selectedWords.length > 0 && (
              <div className='flex flex-wrap gap-1'>
                {selectedWords.map((w, i) => (
                  <span
                    key={w.dic_id}
                    className='inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                  >
                    <span className='text-muted-foreground'>{i + 1}.</span>
                    {w.dic_log_nm}
                    <span className='font-mono'>({w.dic_phy_nm})</span>
                    <button
                      onClick={() => removeWord(w.dic_id)}
                      className='ml-0.5 text-muted-foreground hover:text-destructive'
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* 단어 검색 + 드롭다운 */}
            <div className='relative max-w-64'>
              <Input
                value={wordSearch}
                onChange={(e) => setWordSearch(e.target.value)}
                placeholder='단어 검색 후 클릭으로 추가…'
              />
              {wordSearch && filteredWords.length > 0 && (
                <div className='absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto'>
                  {filteredWords.slice(0, 10).map((w) => (
                    <button
                      key={w.dic_id}
                      onClick={() => addWord(w)}
                      className='flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted text-left'
                    >
                      <span>{w.dic_log_nm}</span>
                      <span className='font-mono text-xs text-muted-foreground'>{w.dic_phy_nm}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 도메인 선택 */}
          <label className='block space-y-1'>
            <span className='text-xs text-muted-foreground font-medium'>표준도메인 * (물리명 마지막 요소)</span>
            <select
              value={selectedDomain?.dom_id ?? ''}
              onChange={(e) => {
                const found = allDomains.find((d) => d.dom_id === e.target.value) ?? null
                setSelectedDomain(found)
              }}
              className='border-input bg-background h-9 max-w-64 w-full rounded-md border px-3 text-sm'
            >
              <option value=''>도메인 선택…</option>
              {allDomains.map((d) => (
                <option key={d.dom_id} value={d.dom_id}>
                  {d.dom_nm} ({d.key_dom_phy_nm})
                </option>
              ))}
            </select>
          </label>

          {/* 물리명 미리보기 */}
          {autoPhyNm && (
            <div className='rounded-md bg-muted px-3 py-2 space-y-0.5'>
              <p className='text-xs text-muted-foreground'>자동 생성 물리명</p>
              <p className='font-mono text-sm'>{autoPhyNm}</p>
              <p className='font-mono text-xs text-muted-foreground'>{autoPhyFllNm}</p>
            </div>
          )}

          {/* 설명 */}
          <label className='block space-y-1'>
            <span className='text-xs text-muted-foreground'>설명 (선택)</span>
            <Input
              value={termDesc}
              onChange={(e) => setTermDesc(e.target.value)}
              placeholder='용어 설명'
              className='max-w-96'
            />
          </label>

          <div className='flex gap-2'>
            <Button size='sm' onClick={save} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </Button>
            <Button size='sm' variant='outline' onClick={() => setShowForm(false)}>
              취소
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : terms.length === 0 ? (
        <p className='text-muted-foreground text-sm'>용어가 없습니다.</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>논리명</th>
                <th className='text-left px-4 py-2 font-medium'>물리명(소문자)</th>
                <th className='text-left px-4 py-2 font-medium'>물리명(대문자)</th>
                <th className='text-left px-4 py-2 font-medium'>설명</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {terms.map((t) => (
                <tr key={t.term_id} className='hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-3 font-medium'>{t.term_log_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs'>{t.term_phy_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {t.term_phy_fll_nm ?? '—'}
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs max-w-56 truncate'>
                    {t.term_desc ?? '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <div className='flex gap-1'>
                      <Button variant='outline' size='sm' className='h-6 px-2 text-xs' onClick={() => openEdit(t)}>
                        수정
                      </Button>
                      <Button
                        variant='outline' size='sm' className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                        disabled={deleting === t.term_id}
                        onClick={() => remove(t.term_id, t.term_log_nm)}
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

'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WordRow {
  dic_id: string
  dic_log_nm: string
  dic_phy_nm: string
  dic_phy_fll_nm: string | null
  dic_desc: string | null
  dic_gbn_cd: string
  data_type: string | null
  data_len: number | null
  apv_status: string
  synced_at: string
}

const GBN: Record<string, string> = { '0001': '단어', '0002': '복합어' }
const GBN_COLOR: Record<string, string> = {
  '0001': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '0002': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
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
  dic_gbn_cd: '0001',
  data_type: '',
  data_len: '',
}

export default function StdWordsPage() {
  const [words, setWords] = useState<WordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [gbnFilter, setGbnFilter] = useState('')

  // 등록/수정 폼
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<WordRow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (gbnFilter) params.set('gbn', gbnFilter)
    fetch(`/api/admin/std/words?${params}`)
      .then((r) => r.json())
      .then((d: { words: WordRow[] }) => setWords(d.words ?? []))
      .finally(() => setLoading(false))
  }, [search, gbnFilter])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
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
      dic_gbn_cd: w.dic_gbn_cd,
      data_type: w.data_type ?? '',
      data_len: w.data_len?.toString() ?? '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.dic_log_nm.trim() || !form.dic_phy_nm.trim()) {
      toast.error('논리명과 물리명은 필수입니다')
      return
    }
    setSaving(true)
    try {
      const payload = {
        dic_log_nm: form.dic_log_nm,
        dic_phy_nm: form.dic_phy_nm,
        dic_phy_fll_nm: form.dic_phy_fll_nm || null,
        dic_desc: form.dic_desc || null,
        dic_gbn_cd: form.dic_gbn_cd,
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
    if (!confirm(`"${nm}" 단어를 삭제하시겠습니까?`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/std/words/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? '삭제 실패')
      }
      toast.success('삭제됐습니다')
      setWords((prev) => prev.filter((w) => w.dic_id !== id))
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
          <h1 className='text-2xl font-bold'>표준단어 관리</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            전체 {words.length}건
          </p>
        </div>
        <Button onClick={openNew} size='sm'>+ 신규 등록</Button>
      </div>

      {/* 검색 + 필터 */}
      <div className='flex gap-2'>
        <Input
          placeholder='논리명 / 물리명 검색…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='max-w-64'
        />
        <div className='flex gap-1'>
          {[['', '전체'], ['0001', '단어'], ['0002', '복합어']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setGbnFilter(val)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                gbnFilter === val
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
            {editing ? '단어 수정' : '신규 단어 등록'}
          </h2>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>논리명 *</span>
              <Input
                value={form.dic_log_nm}
                onChange={(e) => setForm((f) => ({ ...f, dic_log_nm: e.target.value }))}
                placeholder='예: 사용자'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>물리명(약어) *</span>
              <Input
                value={form.dic_phy_nm}
                onChange={(e) => setForm((f) => ({ ...f, dic_phy_nm: e.target.value }))}
                placeholder='예: USR'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>물리명(전체)</span>
              <Input
                value={form.dic_phy_fll_nm}
                onChange={(e) => setForm((f) => ({ ...f, dic_phy_fll_nm: e.target.value }))}
                placeholder='예: USER'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>구분</span>
              <select
                value={form.dic_gbn_cd}
                onChange={(e) => setForm((f) => ({ ...f, dic_gbn_cd: e.target.value }))}
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
              >
                <option value='0001'>단어</option>
                <option value='0002'>복합어</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>데이터 타입</span>
              <Input
                value={form.data_type}
                onChange={(e) => setForm((f) => ({ ...f, data_type: e.target.value }))}
                placeholder='예: VARCHAR'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs text-muted-foreground'>데이터 길이</span>
              <Input
                type='number'
                value={form.data_len}
                onChange={(e) => setForm((f) => ({ ...f, data_len: e.target.value }))}
                placeholder='예: 100'
              />
            </label>
            <label className='col-span-2 space-y-1 sm:col-span-3'>
              <span className='text-xs text-muted-foreground'>설명</span>
              <Input
                value={form.dic_desc}
                onChange={(e) => setForm((f) => ({ ...f, dic_desc: e.target.value }))}
                placeholder='단어 설명 (선택)'
              />
            </label>
          </div>
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

      {/* 목록 테이블 */}
      {loading ? (
        <p className='text-muted-foreground text-sm'>로딩 중…</p>
      ) : words.length === 0 ? (
        <p className='text-muted-foreground text-sm'>단어가 없습니다.</p>
      ) : (
        <div className='rounded-lg border overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-muted/50 border-b'>
              <tr>
                <th className='text-left px-4 py-2 font-medium'>논리명</th>
                <th className='text-left px-4 py-2 font-medium'>물리명(약어)</th>
                <th className='text-left px-4 py-2 font-medium'>물리명(전체)</th>
                <th className='text-left px-4 py-2 font-medium'>구분</th>
                <th className='text-left px-4 py-2 font-medium'>타입/길이</th>
                <th className='text-left px-4 py-2 font-medium'>상태</th>
                <th className='text-left px-4 py-2 font-medium'>설명</th>
                <th className='px-4 py-2'></th>
              </tr>
            </thead>
            <tbody className='divide-y'>
              {words.map((w) => (
                <tr key={w.dic_id} className='hover:bg-muted/30 transition-colors'>
                  <td className='px-4 py-3 font-medium'>{w.dic_log_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs'>{w.dic_phy_nm}</td>
                  <td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
                    {w.dic_phy_fll_nm ?? '—'}
                  </td>
                  <td className='px-4 py-3'>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GBN_COLOR[w.dic_gbn_cd] ?? ''}`}>
                      {GBN[w.dic_gbn_cd] ?? w.dic_gbn_cd}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-muted-foreground text-xs'>
                    {w.data_type
                      ? `${w.data_type}${w.data_len ? `(${w.data_len})` : ''}`
                      : '—'}
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
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-6 px-2 text-xs'
                        onClick={() => openEdit(w)}
                      >
                        수정
                      </Button>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-6 px-2 text-xs text-destructive hover:text-destructive'
                        disabled={deleting === w.dic_id}
                        onClick={() => remove(w.dic_id, w.dic_log_nm)}
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

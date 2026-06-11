'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { useDynamicLimit } from '@/hooks/use-dynamic-limit'

// p-6(48) + 제목+설명(56) + gap(16) + 생성폼(88) + gap(16) + 필터(36) + gap(16) + 테이블헤더(33) + gap(16) + 페이지(36)
const CHROME_PX = 361

interface PackRow {
  pack_id: string
  pack_nm: string
  pack_desc: string | null
  theme_cd: string | null
  price_pi: number
  is_dflt_yn: 'Y' | 'N'
  use_yn: 'Y' | 'N'
  ownr_usr_id: string | null
  mkt_yn: 'Y' | 'N' | null
  reg_dtm: string
  stkr_cnt: number
  ownr_cnt: number
  msg_theme: { theme_nm: string; theme_emoji: string } | null
}

interface ThemeOption {
  theme_cd: string
  theme_nm: string
  theme_emoji: string
}

interface StickerRow {
  stkr_id: string
  stkr_nm: string
  stkr_url: string
  sort_ord: number
}

type Filter = 'all' | 'official' | 'custom' | 'stopped'

export default function StickersPage() {
  const t = useTranslations('adminStickers')
  const tc = useTranslations('common')

  const [packs, setPacks] = useState<PackRow[]>([])
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const limit = useDynamicLimit(CHROME_PX)

  // 생성 폼 상태
  const [newNm, setNewNm] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newTheme, setNewTheme] = useState('')
  const [newPrice, setNewPrice] = useState(0)
  const [newDflt, setNewDflt] = useState(false)
  const [creating, setCreating] = useState(false)

  // 상세(확장) 상태
  const [detailId, setDetailId] = useState<string | null>(null)
  const [stickers, setStickers] = useState<StickerRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 수정 인라인 상태
  const [editId, setEditId] = useState<string | null>(null)
  const [editNm, setEditNm] = useState('')
  const [editTheme, setEditTheme] = useState('')
  const [editPrice, setEditPrice] = useState(0)
  const [editUseYn, setEditUseYn] = useState(true)
  const [editDflt, setEditDflt] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [limit, filter])

  async function reload() {
    const res = await fetch('/api/admin/stickers')
    if (!res.ok) return
    const d = (await res.json()) as { packs: PackRow[]; themes: ThemeOption[] }
    setPacks(d.packs ?? [])
    setThemes(d.themes ?? [])
  }

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  const filtered = packs.filter((p) => {
    if (filter === 'official') return !p.ownr_usr_id
    if (filter === 'custom') return !!p.ownr_usr_id
    if (filter === 'stopped') return p.use_yn === 'N'
    return true
  })
  const totalPages = Math.ceil(filtered.length / limit)
  const displayed = filtered.slice((page - 1) * limit, page * limit)

  const officialCount = packs.filter((p) => !p.ownr_usr_id).length
  const customCount = packs.length - officialCount
  const activeCount = packs.filter((p) => p.use_yn === 'Y').length

  async function createPack() {
    if (!newNm.trim()) {
      toast.error(t('createValidation'))
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/stickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack_nm: newNm.trim(),
          pack_desc: newDesc.trim() || undefined,
          theme_cd: newTheme || undefined,
          price_pi: newPrice,
          is_dflt_yn: newDflt ? 'Y' : 'N',
        }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('createFail'))
      }
      toast.success(t('createSuccess'))
      setNewNm('')
      setNewDesc('')
      setNewTheme('')
      setNewPrice(0)
      setNewDflt(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('createFail'))
    } finally {
      setCreating(false)
    }
  }

  async function openDetail(packId: string) {
    if (detailId === packId) {
      setDetailId(null)
      return
    }
    setDetailId(packId)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/stickers/${packId}`)
      if (!res.ok) {
        setDetailId(null)
        return
      }
      const d = (await res.json()) as { stickers: StickerRow[] }
      setStickers(d.stickers ?? [])
    } finally {
      setDetailLoading(false)
    }
  }

  function startEdit(p: PackRow) {
    setEditId(p.pack_id)
    setEditNm(p.pack_nm)
    setEditTheme(p.theme_cd ?? '')
    setEditPrice(Number(p.price_pi))
    setEditUseYn(p.use_yn === 'Y')
    setEditDflt(p.is_dflt_yn === 'Y')
  }

  async function saveEdit(packId: string) {
    const res = await fetch(`/api/admin/stickers/${packId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pack_nm: editNm,
        theme_cd: editTheme || null,
        price_pi: editPrice,
        use_yn: editUseYn ? 'Y' : 'N',
        is_dflt_yn: editDflt ? 'Y' : 'N',
      }),
    })
    if (!res.ok) {
      const d = (await res.json()) as { error?: string }
      toast.error(d.error ?? t('updateFail'))
      return
    }
    toast.success(t('updateSuccess'))
    setEditId(null)
    await reload()
  }

  async function removePack(p: PackRow) {
    if (!confirm(t('deleteConfirm', { name: p.pack_nm }))) return
    const res = await fetch(`/api/admin/stickers/${p.pack_id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      toast.error(t('deleteFail'))
      return
    }
    toast.success(t('deleteSuccess'))
    if (detailId === p.pack_id) setDetailId(null)
    setPacks((prev) => prev.filter((x) => x.pack_id !== p.pack_id))
  }

  async function uploadStickers(packId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of Array.from(files)) fd.append('files', f)
      const res = await fetch(`/api/admin/stickers/${packId}/items`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        throw new Error(d.error ?? t('uploadFail'))
      }
      const d = (await res.json()) as {
        stickers: StickerRow[]
        uploaded: number
      }
      toast.success(t('uploadSuccess', { count: d.uploaded }))
      setStickers((prev) => [...prev, ...d.stickers])
      setPacks((prev) =>
        prev.map((p) =>
          p.pack_id === packId
            ? { ...p, stkr_cnt: p.stkr_cnt + d.uploaded }
            : p,
        ),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('uploadFail'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removeSticker(packId: string, stkrId: string) {
    if (!confirm(t('stkrDeleteConfirm'))) return
    const res = await fetch(`/api/admin/stickers/${packId}/items/${stkrId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      toast.error(t('stkrDeleteFail'))
      return
    }
    setStickers((prev) => prev.filter((s) => s.stkr_id !== stkrId))
    setPacks((prev) =>
      prev.map((p) =>
        p.pack_id === packId
          ? { ...p, stkr_cnt: Math.max(0, p.stkr_cnt - 1) }
          : p,
      ),
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('desc', {
            count: packs.length,
            official: officialCount,
            custom: customCount,
            active: activeCount,
          })}
        </p>
      </div>

      {/* 팩 생성 폼 */}
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-semibold">{t('createTitle')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs">
              {t('packNm')}
            </label>
            <input
              className="bg-background w-52 rounded-md border px-3 py-1.5 text-sm"
              value={newNm}
              onChange={(e) => setNewNm(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs">
              {t('packDesc')}
            </label>
            <input
              className="bg-background w-64 rounded-md border px-3 py-1.5 text-sm"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs">
              {t('theme')}
            </label>
            <select
              className="bg-background rounded-md border px-3 py-1.5 text-sm"
              value={newTheme}
              onChange={(e) => setNewTheme(e.target.value)}
            >
              <option value="">—</option>
              {themes.map((th) => (
                <option key={th.theme_cd} value={th.theme_cd}>
                  {th.theme_emoji} {th.theme_nm}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-muted-foreground text-xs">
              {t('price')}
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              step={0.1}
              className="bg-background w-24 rounded-md border px-3 py-1.5 text-sm"
              value={newPrice}
              onChange={(e) => setNewPrice(Number(e.target.value))}
            />
          </div>
          <label className="text-muted-foreground flex items-center gap-1.5 pb-2 text-xs">
            <input
              type="checkbox"
              checked={newDflt}
              onChange={(e) => setNewDflt(e.target.checked)}
            />
            {t('isDflt')}
          </label>
          <Button size="sm" disabled={creating} onClick={createPack}>
            {creating ? t('creating') : t('createBtn')}
          </Button>
        </div>
      </div>

      {/* 필터 칩 */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'official', 'custom', 'stopped'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(`filter.${f}`)}
            {f === 'official' && (
              <span className="ml-1">({officialCount})</span>
            )}
            {f === 'custom' && <span className="ml-1">({customCount})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">{tc('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noData')}</p>
      ) : (
        <div className="overflow-hidden overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.pack')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.theme')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.type')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('col.price')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('col.stkrCnt')}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t('col.ownrCnt')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.status')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.regDtm')}
                </th>
                <th className="px-4 py-2 text-left font-medium">
                  {t('col.manage')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {displayed.map((p) => (
                <PackTableRow
                  key={p.pack_id}
                  pack={p}
                  themes={themes}
                  expanded={detailId === p.pack_id}
                  editing={editId === p.pack_id}
                  editState={{
                    editNm,
                    editTheme,
                    editPrice,
                    editUseYn,
                    editDflt,
                    setEditNm,
                    setEditTheme,
                    setEditPrice,
                    setEditUseYn,
                    setEditDflt,
                  }}
                  stickers={stickers}
                  detailLoading={detailLoading}
                  uploading={uploading}
                  fileInputRef={fileInputRef}
                  t={t}
                  tc={tc}
                  onDetail={() => openDetail(p.pack_id)}
                  onEdit={() => startEdit(p)}
                  onSave={() => saveEdit(p.pack_id)}
                  onCancelEdit={() => setEditId(null)}
                  onDelete={() => removePack(p)}
                  onUpload={(files) => uploadStickers(p.pack_id, files)}
                  onRemoveSticker={(stkrId) => removeSticker(p.pack_id, stkrId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  )
}

interface EditState {
  editNm: string
  editTheme: string
  editPrice: number
  editUseYn: boolean
  editDflt: boolean
  setEditNm: (v: string) => void
  setEditTheme: (v: string) => void
  setEditPrice: (v: number) => void
  setEditUseYn: (v: boolean) => void
  setEditDflt: (v: boolean) => void
}

function PackTableRow({
  pack: p,
  themes,
  expanded,
  editing,
  editState,
  stickers,
  detailLoading,
  uploading,
  fileInputRef,
  t,
  tc,
  onDetail,
  onEdit,
  onSave,
  onCancelEdit,
  onDelete,
  onUpload,
  onRemoveSticker,
}: {
  pack: PackRow
  themes: ThemeOption[]
  expanded: boolean
  editing: boolean
  editState: EditState
  stickers: StickerRow[]
  detailLoading: boolean
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  t: ReturnType<typeof useTranslations<'adminStickers'>>
  tc: ReturnType<typeof useTranslations<'common'>>
  onDetail: () => void
  onEdit: () => void
  onSave: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onUpload: (files: FileList | null) => void
  onRemoveSticker: (stkrId: string) => void
}) {
  const isCustom = !!p.ownr_usr_id
  const es = editState

  return (
    <>
      <tr className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3">
          {editing ? (
            <input
              className="bg-background w-44 rounded border px-2 py-1 text-sm"
              value={es.editNm}
              onChange={(e) => es.setEditNm(e.target.value)}
            />
          ) : (
            <>
              <p className="font-medium">
                {p.pack_nm}
                {p.is_dflt_yn === 'Y' && (
                  <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    {t('dfltBadge')}
                  </span>
                )}
              </p>
              {p.pack_desc && (
                <p className="text-muted-foreground max-w-56 truncate text-xs">
                  {p.pack_desc}
                </p>
              )}
            </>
          )}
        </td>
        <td className="text-muted-foreground px-4 py-3">
          {editing ? (
            <select
              className="bg-background rounded border px-2 py-1 text-xs"
              value={es.editTheme}
              onChange={(e) => es.setEditTheme(e.target.value)}
            >
              <option value="">—</option>
              {themes.map((th) => (
                <option key={th.theme_cd} value={th.theme_cd}>
                  {th.theme_emoji} {th.theme_nm}
                </option>
              ))}
            </select>
          ) : p.msg_theme ? (
            `${p.msg_theme.theme_emoji} ${p.msg_theme.theme_nm}`
          ) : (
            '—'
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isCustom
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isCustom ? t('typeCustom') : t('typeOfficial')}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          {editing ? (
            <input
              type="number"
              min={0}
              max={1000}
              step={0.1}
              className="bg-background w-20 rounded border px-2 py-1 text-right text-xs"
              value={es.editPrice}
              onChange={(e) => es.setEditPrice(Number(e.target.value))}
            />
          ) : Number(p.price_pi) === 0 ? (
            <span className="text-muted-foreground">{t('free')}</span>
          ) : (
            `π${p.price_pi}`
          )}
        </td>
        <td className="px-4 py-3 text-right">{p.stkr_cnt}</td>
        <td className="px-4 py-3 text-right">{p.ownr_cnt}</td>
        <td className="px-4 py-3">
          {editing ? (
            <div className="flex flex-col gap-1 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={es.editUseYn}
                  onChange={(e) => es.setEditUseYn(e.target.checked)}
                />
                {t('statusOn')}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={es.editDflt}
                  onChange={(e) => es.setEditDflt(e.target.checked)}
                />
                {t('isDflt')}
              </label>
            </div>
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                p.use_yn === 'Y'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {p.use_yn === 'Y' ? t('statusOn') : t('statusOff')}
            </span>
          )}
        </td>
        <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
          {new Date(p.reg_dtm).toLocaleDateString('ko-KR')}
        </td>
        <td className="px-4 py-3">
          {editing ? (
            <div className="flex gap-1">
              <Button size="sm" className="h-6 px-2 text-xs" onClick={onSave}>
                {tc('save')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={onCancelEdit}
              >
                {tc('cancel')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={onDetail}
              >
                {expanded ? t('close') : t('detail')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={onEdit}
              >
                {t('edit')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs text-red-600 hover:text-red-600"
                onClick={onDelete}
              >
                {t('delete')}
              </Button>
            </div>
          )}
        </td>
      </tr>

      {/* 상세 확장 — 스티커 그리드 + 업로드 */}
      {expanded && (
        <tr>
          <td colSpan={9} className="bg-muted/20 px-4 py-4">
            {detailLoading ? (
              <p className="text-muted-foreground text-sm">{tc('loading')}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {t('stickers')} ({stickers.length})
                  </p>
                  <label className="hover:bg-muted cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium">
                    {uploading ? t('uploading') : t('addStickers')}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => onUpload(e.target.files)}
                    />
                  </label>
                </div>
                {stickers.length === 0 ? (
                  <p className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-sm">
                    {t('noStickers')}
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
                    {stickers.map((s) => (
                      <div
                        key={s.stkr_id}
                        className="group bg-background relative rounded-lg border p-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.stkr_url}
                          alt={s.stkr_nm}
                          className="aspect-square w-full object-contain"
                        />
                        <p className="text-muted-foreground mt-1 truncate text-center text-[10px]">
                          {s.stkr_nm}
                        </p>
                        <button
                          onClick={() => onRemoveSticker(s.stkr_id)}
                          className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
                          aria-label={t('delete')}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

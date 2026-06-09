'use client'

import { useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

export interface GalleryExistingImage {
  attch_id: string
  fl_nm: string
  fl_url: string
  sort_ord: number
}

interface PendingImage {
  key: string
  file: File
  previewUrl: string
  uploading: boolean
}

type Item =
  | { kind: 'existing'; img: GalleryExistingImage }
  | { kind: 'pending'; img: PendingImage }

type Props = {
  category: string
  postId?: string
  initialImages?: GalleryExistingImage[]
  onFilesChange?: (orderedFiles: File[]) => void
  disabled?: boolean
  maxFiles?: number
}

export function GalleryImageEditor({
  category,
  postId,
  initialImages = [],
  onFilesChange,
  disabled,
  maxFiles = 5,
}: Props) {
  const [items, setItems] = useState<Item[]>(() =>
    [...initialImages]
      .sort((a, b) => a.sort_ord - b.sort_ord)
      .map((img) => ({ kind: 'existing' as const, img }))
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isNewMode = !postId

  const notifyParent = useCallback(
    (updated: Item[]) => {
      onFilesChange?.(
        updated
          .filter((i): i is { kind: 'pending'; img: PendingImage } => i.kind === 'pending')
          .map((i) => i.img.file)
      )
    },
    [onFilesChange]
  )

  const syncSortOrd = useCallback(
    async (ordered: Item[]) => {
      if (!postId) return
      const existings = ordered.filter(
        (i): i is { kind: 'existing'; img: GalleryExistingImage } => i.kind === 'existing'
      )
      await Promise.all(
        existings.map((i, idx) =>
          piFetch(`/api/board/${category}/${postId}/attachments/${i.img.attch_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sort_ord: idx }),
          })
        )
      )
    },
    [category, postId]
  )

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= items.length) return
    const newItems = [...items]
    ;[newItems[index], newItems[next]] = [newItems[next], newItems[index]]
    setItems(newItems)
    notifyParent(newItems)
    if (!isNewMode) await syncSortOrd(newItems)
  }

  const handleFiles = async (newFiles: File[]) => {
    const imageFiles = newFiles.filter((f) => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    if (items.length + imageFiles.length > maxFiles) {
      toast.error(`이미지는 최대 ${maxFiles}개까지 가능합니다`)
      return
    }

    if (isNewMode) {
      const newItems: Item[] = imageFiles.map((file) => ({
        kind: 'pending' as const,
        img: {
          key: `${Date.now()}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          uploading: false,
        },
      }))
      const updated = [...items, ...newItems]
      setItems(updated)
      notifyParent(updated)
      return
    }

    // 수정 모드 — 파일별 순차 업로드
    const baseOrd = items.length
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      const key = `${Date.now()}-${Math.random()}`
      const previewUrl = URL.createObjectURL(file)

      setItems((prev) => [
        ...prev,
        { kind: 'pending' as const, img: { key, file, previewUrl, uploading: true } },
      ])

      const formData = new FormData()
      formData.append('files', file)
      formData.append('sort_ord', String(baseOrd + i))

      const res = await piFetch(`/api/board/${category}/${postId}/attachments`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const { uploaded } = (await res.json()) as {
          uploaded: { attch_id: string; fl_nm: string; fl_url: string; sort_ord: number }[]
        }
        const u = uploaded[0]
        setItems((prev) =>
          prev.map((item) =>
            item.kind === 'pending' && item.img.key === key
              ? {
                  kind: 'existing' as const,
                  img: { attch_id: u.attch_id, fl_nm: u.fl_nm, fl_url: u.fl_url, sort_ord: u.sort_ord ?? baseOrd + i },
                }
              : item
          )
        )
      } else {
        toast.error(`업로드 실패: ${file.name}`)
        URL.revokeObjectURL(previewUrl)
        setItems((prev) => prev.filter((item) => !(item.kind === 'pending' && item.img.key === key)))
      }
    }
  }

  const handleRemove = async (index: number) => {
    const item = items[index]
    if (item.kind === 'existing' && !isNewMode) {
      const res = await piFetch(
        `/api/board/${category}/${postId}/attachments/${item.img.attch_id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) { toast.error('삭제 실패'); return }
    }
    if (item.kind === 'pending') URL.revokeObjectURL(item.img.previewUrl)
    const updated = items.filter((_, i) => i !== index)
    setItems(updated)
    notifyParent(updated)
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-sm font-medium'>
          이미지 ({items.length}/{maxFiles})
        </span>
        {items.length > 0 && items.length < maxFiles && !disabled && (
          <button
            type='button'
            onClick={() => fileInputRef.current?.click()}
            className='text-xs text-primary hover:underline'
          >
            + 이미지 추가
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        onChange={(e) => {
          handleFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
        disabled={disabled}
      />

      {items.length === 0 ? (
        <button
          type='button'
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className='flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-default disabled:opacity-50'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='mb-2 h-8 w-8 opacity-40'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={1.5}
              d='M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z'
            />
          </svg>
          <p className='text-sm'>클릭하여 이미지 추가</p>
          <p className='mt-1 text-xs opacity-60'>최대 {maxFiles}개, 20MB 이하</p>
        </button>
      ) : (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
          {items.map((item, idx) => {
            const url = item.kind === 'existing' ? item.img.fl_url : item.img.previewUrl
            const name = item.kind === 'existing' ? item.img.fl_nm : item.img.file.name
            const uploading = item.kind === 'pending' && item.img.uploading

            return (
              <div
                key={item.kind === 'existing' ? item.img.attch_id : item.img.key}
                className='group relative aspect-square overflow-hidden rounded-lg border bg-muted'
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={name} className='h-full w-full object-cover' />

                {uploading && (
                  <div className='absolute inset-0 flex items-center justify-center bg-black/40'>
                    <div className='h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent' />
                  </div>
                )}

                {!uploading && !disabled && (
                  <div className='absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100'>
                    <button
                      type='button'
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      aria-label='앞으로 이동'
                      className='rounded p-0.5 text-white hover:bg-white/20 disabled:opacity-30'
                    >
                      ←
                    </button>
                    <button
                      type='button'
                      onClick={() => handleRemove(idx)}
                      aria-label='삭제'
                      className='rounded p-0.5 text-white hover:bg-red-500/70'
                    >
                      ✕
                    </button>
                    <button
                      type='button'
                      onClick={() => move(idx, 1)}
                      disabled={idx === items.length - 1}
                      aria-label='뒤로 이동'
                      className='rounded p-0.5 text-white hover:bg-white/20 disabled:opacity-30'
                    >
                      →
                    </button>
                  </div>
                )}

                <span className='absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white'>
                  {idx + 1}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

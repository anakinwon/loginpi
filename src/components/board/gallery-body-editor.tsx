'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import {
  type EditorBlock,
  type ImageBlock,
  type PendingImageBlock,
  type SavedImageBlock,
} from './gallery-block-utils'

export type { EditorBlock, ImageBlock, PendingImageBlock, SavedImageBlock }
export { parseBlocks, serializeBlocks } from './gallery-block-utils'

interface Props {
  blocks: EditorBlock[]
  onChange: (blocks: EditorBlock[]) => void
  category?: string
  postId?: string // 있으면 이미지 삽입 시 즉시 업로드 (수정 모드)
  disabled?: boolean
}

export function GalleryBodyEditor({
  blocks,
  onChange,
  category,
  postId,
  disabled,
}: Props) {
  const t = useTranslations('board')
  const fileRef = useRef<HTMLInputElement>(null)
  const insertPosRef = useRef<number>(0)
  const [uploading, setUploading] = useState(false)

  function updateText(idx: number, c: string) {
    const next = [...blocks]
    next[idx] = { t: 'text', c }
    onChange(next)
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  function removeBlock(idx: number) {
    const block = blocks[idx]
    if (block.t === 'img') {
      if (block.kind === 'saved' && postId && category) {
        piFetch(`/api/board/${category}/${postId}/attachments/${block.id}`, {
          method: 'DELETE',
        }).catch(() => {})
      } else if (block.kind === 'pending') {
        URL.revokeObjectURL(block.blobUrl)
      }
    }
    const next = blocks.filter((_, i) => i !== idx)
    onChange(next.length === 0 ? [{ t: 'text', c: '' }] : next)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const pos = insertPosRef.current

    if (postId && category) {
      // 수정 모드: 즉시 업로드
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('files', file)
        fd.append('sort_ord', String(pos))
        const res = await piFetch(
          `/api/board/${category}/${postId}/attachments`,
          {
            method: 'POST',
            body: fd,
          },
        )
        if (!res.ok) throw new Error('업로드 실패')
        const data = (await res.json()) as {
          uploaded: { attch_id: string; fl_nm: string; fl_url: string }[]
        }
        const u = data.uploaded[0]
        const saved: SavedImageBlock = {
          t: 'img',
          kind: 'saved',
          id: u.attch_id,
          url: u.fl_url,
          nm: u.fl_nm,
        }
        const next = [...blocks]
        next.splice(pos, 0, saved)
        onChange(next)
      } catch {
        // 에러는 호출부에서 toast로 처리
      } finally {
        setUploading(false)
      }
    } else {
      // 신규 작성 모드: pending 블록으로 보관
      const blobUrl = URL.createObjectURL(file)
      const pending: PendingImageBlock = {
        t: 'img',
        kind: 'pending',
        tempId: crypto.randomUUID(),
        file,
        blobUrl,
        nm: file.name,
      }
      const next = [...blocks]
      next.splice(pos, 0, pending)
      onChange(next)
    }
  }

  function openFilePicker(insertAt: number) {
    insertPosRef.current = insertAt
    fileRef.current?.click()
  }

  return (
    <div className="border-input bg-background rounded-md border">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="space-y-0 p-2">
        <InsertImageButton
          onClick={() => openFilePicker(0)}
          disabled={disabled || uploading}
        />

        {blocks.map((block, idx) => {
          const key =
            block.t === 'img'
              ? block.kind === 'saved'
                ? `saved-${block.id}`
                : `pending-${block.tempId}`
              : `text-${idx}`

          return (
            <div key={key}>
              {block.t === 'text' ? (
                <AutoTextarea
                  value={block.c}
                  onChange={(v) => updateText(idx, v)}
                  disabled={disabled || uploading}
                  placeholder={
                    idx === 0
                      ? t('gallery.bodyPlaceholderFirst')
                      : t('gallery.bodyPlaceholderMore')
                  }
                />
              ) : (
                <ImageBlockView
                  block={block}
                  onMoveUp={() => moveBlock(idx, -1)}
                  onMoveDown={() => moveBlock(idx, 1)}
                  onDelete={() => removeBlock(idx)}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < blocks.length - 1}
                  disabled={disabled || uploading}
                />
              )}

              <InsertImageButton
                onClick={() => openFilePicker(idx + 1)}
                disabled={disabled || uploading}
              />
            </div>
          )
        })}
      </div>

      {uploading && (
        <p className="border-border text-muted-foreground animate-pulse border-t py-2 text-center text-xs">
          {t('gallery.imageUploading')}
        </p>
      )}
    </div>
  )
}

function AutoTextarea({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={3}
      className="placeholder:text-muted-foreground focus:ring-ring w-full resize-none rounded-sm bg-transparent px-2 py-1.5 text-sm focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      onInput={(e) => {
        const el = e.currentTarget
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
      }}
    />
  )
}

function ImageBlockView({
  block,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
  disabled,
}: {
  block: ImageBlock
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  disabled?: boolean
}) {
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const src = block.kind === 'pending' ? block.blobUrl : block.url

  return (
    <div className="border-border my-1 overflow-hidden rounded-md border">
      <div className="bg-muted/20 flex max-h-96 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={block.nm}
          className="max-h-96 max-w-full object-contain"
        />
      </div>
      <div className="border-border bg-background/80 flex items-center justify-between border-t px-3 py-1.5">
        <span className="text-muted-foreground max-w-xs truncate text-xs">
          {block.nm}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
            title={t('gallery.moveUp')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-1.5 py-0.5 text-sm disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
            title={t('gallery.moveDown')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-1.5 py-0.5 text-sm disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            title={tc('delete')}
            className="text-destructive hover:bg-destructive/10 rounded px-1.5 py-0.5 text-sm disabled:opacity-30"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

function InsertImageButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  const t = useTranslations('board')
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="bg-border h-px flex-1" />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="border-border text-muted-foreground hover:border-primary hover:text-primary rounded-full border border-dashed px-2.5 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('gallery.addImage')}
      </button>
      <div className="bg-border h-px flex-1" />
    </div>
  )
}

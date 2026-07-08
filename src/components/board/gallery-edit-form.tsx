'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { GalleryBodyEditor } from './gallery-body-editor'
import {
  parseBlocks,
  serializeBlocks,
  type EditorBlock,
} from './gallery-block-utils'

interface Props {
  category: string
  postId: string
  initialTitle: string
  initialContent: string
}

export function GalleryEditForm({
  category,
  postId,
  initialTitle,
  initialContent,
}: Props) {
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [blocks, setBlocks] = useState<EditorBlock[]>(() =>
    parseBlocks(initialContent),
  )
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error(t('gallery.titleRequired'))
      return
    }
    setSubmitting(true)

    const postCont = serializeBlocks(blocks)

    const res = await piFetch(`/api/board/${category}/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_ttl: title.trim(), post_cont: postCont }),
    })

    if (!res.ok) {
      const { error } = (await res.json()) as { error?: string }
      toast.error(error ?? t('gallery.saveFail'))
      setSubmitting(false)
      return
    }

    toast.success(t('gallery.saved'))
    router.push(`/board/${category}/${postId}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="edit-title">{t('gallery.titleLabel')}</Label>
        <Input
          id="edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('gallery.titlePh')}
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t('gallery.bodyLabel')}</Label>
        <GalleryBodyEditor
          blocks={blocks}
          onChange={setBlocks}
          category={category}
          postId={postId}
          disabled={submitting}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? t('gallery.saving') : t('gallery.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          {tc('cancel')}
        </Button>
      </div>
    </form>
  )
}

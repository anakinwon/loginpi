'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  category: string
  postId?: string
  initialTitle?: string
  initialContent?: string
  canAttach?: boolean
}

export function PostForm({ category, postId, initialTitle = '', initialContent = '', canAttach }: Props) {
  const router = useRouter()
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const ta = useTranslations('attachment')
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [submitting, setSubmitting] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!postId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error(t('titlePlaceholder'))
      return
    }
    setSubmitting(true)

    const res = await fetch(
      isEdit ? `/api/board/${category}/${postId}` : `/api/board/${category}`,
      {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_ttl: title.trim(), post_cont: content.trim() }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      const targetId = isEdit ? postId : data.post_id

      // 글 등록 후 선택된 파일을 업로드 (신규 글 + 첨부파일 있을 때만)
      if (!isEdit && canAttach && files.length > 0) {
        const formData = new FormData()
        files.forEach((f) => formData.append('files', f))
        const uploadRes = await fetch(`/api/board/${category}/${targetId}/attachments`, {
          method: 'POST',
          body: formData,
        })
        if (!uploadRes.ok) {
          toast.error(ta('uploadFail'))
        }
      }

      toast.success(isEdit ? t('editSuccess') : t('createSuccess'))
      router.push(`/board/${category}/${targetId}`)
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(error ?? (isEdit ? t('editFail') : t('createFail')))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-1.5'>
        <Label htmlFor='post-title'>{t('postTitle')}</Label>
        <Input
          id='post-title'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          required
          disabled={submitting}
        />
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='post-content'>{t('postContent')}</Label>
        <textarea
          id='post-content'
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('contentPlaceholder')}
          rows={18}
          disabled={submitting}
          className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        />
      </div>

      {canAttach && !isEdit && (
        <div className='space-y-1.5'>
          <Label>{ta('title')}</Label>
          <div className='flex flex-wrap items-center gap-2'>
            <input
              ref={fileInputRef}
              type='file'
              multiple
              className='hidden'
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              disabled={submitting}
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              {ta('upload')}
            </Button>
            {files.length > 0 && (
              <ul className='flex flex-wrap gap-1.5'>
                {files.map((f, i) => (
                  <li key={i} className='rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground'>
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className='text-xs text-muted-foreground'>{ta('sizeLimit')}</p>
        </div>
      )}

      <div className='flex gap-2'>
        <Button type='submit' disabled={submitting}>
          {submitting
            ? isEdit ? t('saving') : tc('creating')
            : isEdit ? t('editPost') : tc('create')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.back()}
          disabled={submitting}
        >
          {tc('cancel')}
        </Button>
      </div>
    </form>
  )
}

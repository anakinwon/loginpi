'use client'

import { useState } from 'react'
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
}

export function PostForm({ category, postId, initialTitle = '', initialContent = '' }: Props) {
  const router = useRouter()
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [submitting, setSubmitting] = useState(false)

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
      toast.success(isEdit ? t('editSuccess') : t('createSuccess'))
      const targetId = isEdit ? postId : data.post_id
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

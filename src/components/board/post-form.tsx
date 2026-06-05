'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const [title, setTitle] = useState(initialTitle)
  const [content, setContent] = useState(initialContent)
  const [submitting, setSubmitting] = useState(false)

  const isEdit = !!postId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('제목을 입력해주세요')
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
      toast.success(isEdit ? '수정됐습니다' : '게시글이 작성됐습니다')
      const targetId = isEdit ? postId : data.post_id
      router.push(`/board/${category}/${targetId}`)
      router.refresh()
    } else {
      const { error } = await res.json()
      toast.error(error ?? (isEdit ? '수정 실패' : '작성 실패'))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-1.5'>
        <Label htmlFor='post-title'>제목</Label>
        <Input
          id='post-title'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='제목을 입력하세요'
          required
          disabled={submitting}
        />
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='post-content'>내용</Label>
        <textarea
          id='post-content'
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder='내용을 입력하세요'
          rows={18}
          disabled={submitting}
          className='w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        />
      </div>

      <div className='flex gap-2'>
        <Button type='submit' disabled={submitting}>
          {submitting ? (isEdit ? '수정 중…' : '등록 중…') : isEdit ? '수정' : '등록'}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.back()}
          disabled={submitting}
        >
          취소
        </Button>
      </div>
    </form>
  )
}

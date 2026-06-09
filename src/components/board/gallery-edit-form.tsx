'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { GalleryBodyEditor } from './gallery-body-editor'
import { parseBlocks, serializeBlocks, type EditorBlock } from './gallery-block-utils'

interface Props {
  category: string
  postId: string
  initialTitle: string
  initialContent: string
}

export function GalleryEditForm({ category, postId, initialTitle, initialContent }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initialTitle)
  const [blocks, setBlocks] = useState<EditorBlock[]>(() => parseBlocks(initialContent))
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('제목을 입력해주세요'); return }
    setSubmitting(true)

    const postCont = serializeBlocks(blocks)

    const res = await piFetch(`/api/board/${category}/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_ttl: title.trim(), post_cont: postCont }),
    })

    if (!res.ok) {
      const { error } = (await res.json()) as { error?: string }
      toast.error(error ?? '수정 실패')
      setSubmitting(false)
      return
    }

    toast.success('수정되었습니다')
    router.push(`/board/${category}/${postId}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      <div className='space-y-1.5'>
        <Label htmlFor='edit-title'>제목</Label>
        <Input
          id='edit-title'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='제목을 입력하세요'
          required
          disabled={submitting}
        />
      </div>

      <div className='space-y-1.5'>
        <Label>본문</Label>
        <GalleryBodyEditor
          blocks={blocks}
          onChange={setBlocks}
          category={category}
          postId={postId}
          disabled={submitting}
        />
      </div>

      <div className='flex gap-2'>
        <Button type='submit' disabled={submitting}>
          {submitting ? '저장 중...' : '저장하기'}
        </Button>
        <Button type='button' variant='outline' onClick={() => router.back()} disabled={submitting}>
          취소
        </Button>
      </div>
    </form>
  )
}

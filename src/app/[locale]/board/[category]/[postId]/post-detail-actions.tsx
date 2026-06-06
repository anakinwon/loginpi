'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = { category: string; postId: string }

export function PostDetailActions({ category, postId }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('게시글을 삭제할까요?')) return
    setDeleting(true)
    const res = await fetch(`/api/board/${category}/${postId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('게시글이 삭제됐습니다')
      router.push(`/board/${category}`)
    } else {
      const { error } = await res.json()
      toast.error(error ?? '삭제 실패')
      setDeleting(false)
    }
  }

  return (
    <div className='flex shrink-0 gap-2'>
      <Link
        href={`/board/${category}/${postId}/edit`}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        수정
      </Link>
      <Button variant='destructive' size='sm' onClick={handleDelete} disabled={deleting}>
        {deleting ? '삭제 중…' : '삭제'}
      </Button>
    </div>
  )
}

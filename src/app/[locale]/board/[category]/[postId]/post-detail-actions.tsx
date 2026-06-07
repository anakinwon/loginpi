'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = { category: string; postId: string }

export function PostDetailActions({ category, postId }: Props) {
  const router = useRouter()
  const t = useTranslations('board')
  const tc = useTranslations('common')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm(t('deletePost'))) return
    setDeleting(true)
    const res = await fetch(`/api/board/${category}/${postId}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(t('deleteSuccess'))
      router.push(`/board/${category}`)
    } else {
      const { error } = await res.json()
      toast.error(error ?? t('deleteFail'))
      setDeleting(false)
    }
  }

  return (
    <div className='flex shrink-0 gap-2'>
      <Link
        href={`/board/${category}/${postId}/edit`}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
      >
        {tc('edit')}
      </Link>
      <Button variant='destructive' size='sm' onClick={handleDelete} disabled={deleting}>
        {deleting ? tc('deleting') : tc('delete')}
      </Button>
    </div>
  )
}

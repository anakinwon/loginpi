'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PostSearch({ category, q }: { category: string; q?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(q ?? '')

  const search = () => {
    const qs = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ''
    router.push(`/board/${category}${qs}`)
  }

  return (
    <div className='mb-4 flex gap-2'>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && search()}
        placeholder='제목 또는 내용 검색'
        className='max-w-xs'
      />
      <Button variant='outline' size='sm' onClick={search}>
        검색
      </Button>
      {q && (
        <Button
          variant='ghost'
          size='sm'
          onClick={() => {
            setValue('')
            router.push(`/board/${category}`)
          }}
        >
          초기화
        </Button>
      )}
    </div>
  )
}

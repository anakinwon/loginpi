'use client'

import { useState } from 'react'

interface StarRatingProps {
  value: number
  onChange?: (score: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const SIZE = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' }

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value

  return (
    <div className="flex gap-0.5" role="group" aria-label={`별점 ${value}점`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => !readonly && setHovered(star)}
          onMouseLeave={() => !readonly && setHovered(0)}
          className={[
            SIZE[size],
            'leading-none transition-transform',
            !readonly && 'cursor-pointer hover:scale-110',
            readonly && 'cursor-default',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={`${star}점`}
        >
          {star <= display ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

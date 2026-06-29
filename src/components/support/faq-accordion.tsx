'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface FaqItem {
  q: string
  a: string
}

export function FaqAccordion() {
  const t = useTranslations('faq')
  const items = t.raw('items') as FaqItem[]
  const [open, setOpen] = useState<Set<number>>(new Set())

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <ul className="divide-y rounded-xl border">
      {items.map((it, i) => {
        const isOpen = open.has(i)
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="hover:bg-muted/30 flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors"
            >
              <span className="text-sm font-medium">{it.q}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m6 9 6 6 6-6"
                />
              </svg>
            </button>
            {isOpen && (
              <p className="text-muted-foreground bg-muted/20 border-t px-4 py-3 text-sm leading-relaxed">
                {it.a}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

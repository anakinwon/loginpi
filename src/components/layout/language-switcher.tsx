'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { useState } from 'react'

const LOCALE_META: Record<string, { name: string; flag: string }> = {
  ko:  { name: '한국어',          flag: '🇰🇷' },
  en:  { name: 'English',         flag: '🇺🇸' },
  zh:  { name: '中文',            flag: '🇨🇳' },
  ja:  { name: '日本語',          flag: '🇯🇵' },
  hi:  { name: 'हिन्दी',          flag: '🇮🇳' },
  vi:  { name: 'Tiếng Việt',      flag: '🇻🇳' },
  af:  { name: 'Afrikaans',       flag: '🇿🇦' },
  fil: { name: 'Filipino',        flag: '🇵🇭' },
  th:  { name: 'ภาษาไทย',         flag: '🇹🇭' },
  id:  { name: 'Bahasa Indonesia', flag: '🇮🇩' },
  ms:  { name: 'Bahasa Melayu',   flag: '🇲🇾' },
  es:  { name: 'Español',         flag: '🇪🇸' },
  fr:  { name: 'Français',        flag: '🇫🇷' },
  de:  { name: 'Deutsch',         flag: '🇩🇪' },
  it:  { name: 'Italiano',        flag: '🇮🇹' },
}

export function LanguageSwitcher({ locale }: { locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next })
    setOpen(false)
  }

  const current = LOCALE_META[locale] ?? LOCALE_META['ko']

  return (
    <div className='relative'>
      <button
        onClick={() => setOpen((v) => !v)}
        className='text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors'
        aria-label='언어 선택'
      >
        <span>{current.flag}</span>
        <span className='text-xs font-medium uppercase'>{locale}</span>
      </button>

      {open && (
        <>
          {/* 오버레이 */}
          <div
            className='fixed inset-0 z-40'
            onClick={() => setOpen(false)}
          />
          {/* 언어 선택 패널 */}
          <div className='bg-background border-border absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border p-3 shadow-lg'>
            <p className='text-muted-foreground mb-2 px-1 text-xs font-medium'>언어 선택</p>
            <div className='grid grid-cols-3 gap-1'>
              {routing.locales.map((loc) => {
                const meta = LOCALE_META[loc]
                return (
                  <button
                    key={loc}
                    onClick={() => switchLocale(loc)}
                    className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-xs transition-colors ${
                      loc === locale
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span className='text-base'>{meta?.flag}</span>
                    <span className='truncate w-full text-center'>{meta?.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

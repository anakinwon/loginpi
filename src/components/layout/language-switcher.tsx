'use client'

import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { useState } from 'react'

interface LocaleMeta {
  name: string
  country: string  // ISO 3166-1 alpha-2 소문자 (flag-icons 클래스용)
}

const LOCALE_META: Record<string, LocaleMeta> = {
  ko:  { name: '한국어',           country: 'kr' },
  en:  { name: 'English',          country: 'us' },
  zh:  { name: '中文',             country: 'cn' },
  ja:  { name: '日本語',           country: 'jp' },
  hi:  { name: 'हिन्दी',            country: 'in' },
  vi:  { name: 'Tiếng Việt',       country: 'vn' },
  af:  { name: 'Afrikaans',        country: 'za' },
  fil: { name: 'Filipino',         country: 'ph' },
  th:  { name: 'ภาษาไทย',          country: 'th' },
  id:  { name: 'Bahasa Indonesia',  country: 'id' },
  ms:  { name: 'Bahasa Melayu',    country: 'my' },
  es:  { name: 'Español',          country: 'es' },
  fr:  { name: 'Français',         country: 'fr' },
  de:  { name: 'Deutsch',          country: 'de' },
  it:  { name: 'Italiano',         country: 'it' },
  ru:  { name: 'Русский',          country: 'ru' },
  pt:  { name: 'Português',        country: 'pt' },
  ar:  { name: 'العربية',          country: 'eg' },
}

function Flag({ country, size = 'sm' }: { country: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`fi fi-${country} rounded-sm ${size === 'lg' ? 'text-xl' : 'text-sm'}`}
      style={{ fontSize: size === 'lg' ? '1.25rem' : '0.875rem' }}
    />
  )
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
        className='text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors'
        aria-label='언어 선택'
      >
        <Flag country={current.country} />
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
                    className={`flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs transition-colors ${
                      loc === locale
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Flag country={meta?.country ?? 'un'} size='lg' />
                    <span className='truncate w-full text-center leading-tight'>{meta?.name}</span>
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

'use client'

// @pi/i18n/client — 검색형 언어 스위처(국기 + 원어 이름). DB·통화·네트워크 없음(카탈로그 정적).
// 선택은 localStorage 'preferred_locale' 에만 기억(Pi Browser 는 쿠키 미저장 — 표준 6절). 다음 방문 적용은 layout 의 <PreferredLocaleScript>(@pi/i18n)가 하이드레이션 전에 맡는다.
// 색은 시스템 색(Canvas·CanvasText)·currentColor 만 써서 앱 테마(color-scheme)를 따른다. 전환은 앱이 넘긴 onChange(next-intl router.replace)로만 — 하드 이동·UA 분기 없음
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { getLocaleInfo, LOCALE_CATALOG, type LocaleInfo } from './index'

export interface LocaleSwitcherProps {
  locale: string
  locales: readonly string[]
  onChange: (next: string) => void
  labels?: { button?: string; search?: string; empty?: string }
  storageKey?: string
  className?: string
}

const matches = (l: LocaleInfo, q: string) =>
  !q || [l.code, l.nativeName, l.englishName].some((s) => s.toLowerCase().includes(q))

export function LocaleSwitcher({
  locale,
  locales,
  onChange,
  labels,
  storageKey = 'preferred_locale',
  className = '',
}: LocaleSwitcherProps) {
  const id = useId()
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 표시 목록 = 카탈로그 순서 ∩ locales
  const all = useMemo(() => LOCALE_CATALOG.filter((l) => locales.includes(l.code)), [locales])
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => all.filter((l) => matches(l, q)), [all, q])
  const current = getLocaleInfo(locale)

  // 바깥 누르면 닫기
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const toggle = () => {
    if (!open) {
      // 화면 아래쪽 버튼(하단 메뉴 바 등)은 위로 펼친다
      const r = buttonRef.current?.getBoundingClientRect()
      setUp(!!r && r.top > window.innerHeight / 2)
      setQuery('')
      setActive(Math.max(0, all.findIndex((l) => l.code === locale)))
    }
    setOpen(!open)
  }

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const choose = (code: string) => {
    try {
      localStorage.setItem(storageKey, code)
    } catch {
      /* 저장 실패해도 전환은 진행 */
    }
    setOpen(false)
    if (code !== locale) onChange(code)
  }

  const onKey = (e: KeyboardEvent) => {
    const last = shown.length - 1
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Enter') {
      const pick = shown[active]
      if (pick) choose(pick.code)
    } else if (e.key === 'Escape') close()
    else return
    e.preventDefault()
  }

  // 활성 항목이 보이게 스크롤
  useEffect(() => {
    if (open) document.getElementById(`${id}-${shown[active]?.code}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, shown, id])

  const buttonLabel = labels?.button ?? 'Change language'

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={buttonLabel}
        title={buttonLabel}
        className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm hover:bg-current/10"
      >
        <span aria-hidden>{current?.flag ?? '🌐'}</span>
        <span className="sm:hidden">{locale}</span>
        <span className="hidden sm:inline" dir={current?.dir}>
          {current?.nativeName ?? locale}
        </span>
      </button>
      {open && (
        <div
          className={`absolute end-0 z-50 w-64 max-w-[calc(100vw-1.5rem)] rounded-xl bg-[Canvas] p-2 text-[CanvasText] shadow-xl ring-1 ring-current/15 ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            placeholder={labels?.search ?? 'Search language'}
            aria-label={labels?.search ?? 'Search language'}
            aria-controls={listId}
            aria-activedescendant={shown[active] ? `${id}-${shown[active].code}` : undefined}
            autoComplete="off"
            className="mb-2 min-h-11 w-full rounded-lg border border-current/20 bg-transparent px-3 text-base outline-none focus:border-current"
          />
          <ul id={listId} role="listbox" aria-label={buttonLabel} className="max-h-72 overflow-y-auto overscroll-contain">
            {shown.length === 0 && <li className="px-3 py-2 text-sm opacity-60">{labels?.empty ?? 'No results'}</li>}
            {shown.map((l, i) => (
              <li
                key={l.code}
                id={`${id}-${l.code}`}
                role="option"
                aria-selected={l.code === locale}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(l.code)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm ${i === active ? 'bg-current/10' : ''} ${l.code === locale ? 'font-semibold' : ''}`}
              >
                <span aria-hidden>{l.flag}</span>
                <span dir={l.dir} className="flex-1 truncate">
                  {l.nativeName}
                </span>
                <span className="text-xs opacity-60">{l.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

'use client'

// 상단 헤더 + 하단 폴더블 메뉴(마스터 지시 2026-10-31) —
//  상단 : 로고 · 로그인 상태(사용자명, Pi 세션 OR Google 연동 세션, useAppUser 통합)만.
//  하단 : 고정 메뉴 바 HOME | 요금제 | 개인정보 | 관리자(관리자만 — 위로 펼침 : 제작 현황·방 관리·사용자 관리·대면 노트) + 언어 전환(@pi/i18n 검색형 스위처) + 접기.
//   접기 = 바를 작은 손잡이 하나로 줄임(상태는 localStorage, 읽기 실패해도 동작). 세미나 방(/s/*)은 방 조작 바가 하단을 쓰므로 숨김.
//   아이콘은 정적 SVG(nav-icons) — 애니메이션 없음(Pi Browser 규칙)
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
import { AuthStatus } from './auth-status'
import { AppLocaleSwitcher } from './locale-switcher'
import { useAppUser } from './google-auth'
import {
  IconActivity,
  IconCard,
  IconChevronDown,
  IconHome,
  IconMenu,
  IconNotebook,
  IconShield,
  IconSliders,
  IconUsers,
  IconVideo,
} from './nav-icons'

const FOLD_KEY = 'smn_nav_fold'
type Item = { href: string; label: string; icon: ReactNode }

// 메뉴 항목 공통 모양 — 아이콘 위·짧은 글자 아래, 현재 화면은 강조색
const ITEM =
  'flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] leading-none text-muted-foreground hover:bg-surface-raised hover:text-foreground aria-[current=page]:text-accent'

function useHere() {
  const pathname = usePathname()
  return (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`)
}

// 관리자 메뉴 — 네이티브 펼침(details, 위로 열림). 항목 이동·바깥 탭·포커스 이탈·Esc = 닫기(Esc 는 여는 버튼으로 포커스 복귀)
function AdminMenu({ items, label }: { items: Item[]; label: string }) {
  const pathname = usePathname()
  const here = useHere()
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => {
    if (ref.current) ref.current.open = false
  }
  useEffect(close, [pathname])
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current?.open) return
      close()
      ref.current.querySelector('summary')?.focus()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [])
  const active = items.some((it) => here(it.href))
  return (
    <details
      ref={ref}
      className="relative"
      onBlur={(e) => {
        // Tab 으로 포커스가 메뉴 밖 요소로 갔을 때만 닫는다 — 대상 없음(null)은 무시(iOS 는 링크 탭에 포커스를 안 줘 클릭 전에 닫혀 버림, 바깥 탭은 pointerdown 이 맡음)
        const to = e.relatedTarget as Node | null
        if (to && !e.currentTarget.contains(to)) close()
      }}
    >
      <summary
        aria-current={active ? 'page' : undefined}
        className={`${ITEM} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <IconSliders />
        {label}
      </summary>
      <ul className="bg-surface absolute bottom-full left-1/2 z-40 mb-3 min-w-44 -translate-x-1/2 rounded-xl p-1 shadow-xl ring-1 ring-white/10">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={close}
              aria-current={here(it.href) ? 'page' : undefined}
              className="hover:bg-surface-raised aria-[current=page]:bg-surface-raised aria-[current=page]:text-accent flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            >
              {it.icon}
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  )
}

// 하단 폴더블 메뉴 바
function BottomNav({ admin }: { admin: boolean }) {
  const t = useTranslations('nav')
  const tl = useTranslations('list')
  const ta = useTranslations('auth')
  const pathname = usePathname()
  const here = useHere()
  const [folded, setFolded] = useState(false)
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLD_KEY) === '1')
    } catch {
      /* 저장소 차단 환경 — 펼침 기본 */
    }
  }, [])
  const toggle = () =>
    setFolded((f) => {
      const next = !f
      try {
        localStorage.setItem(FOLD_KEY, next ? '1' : '0')
      } catch {
        /* 무시 */
      }
      return next
    })

  // 세미나 방·상세(/s/*)는 방 조작 바(control-bar, fixed bottom)가 하단을 쓴다 — 겹치지 않게 숨김
  if (pathname.startsWith('/s/')) return null

  const items: Item[] = [
    { href: '/', label: t('home'), icon: <IconHome /> },
    { href: '/plan', label: t('plan'), icon: <IconCard /> },
    { href: '/privacy', label: t('privacyShort'), icon: <IconShield /> },
  ]
  const adminItems: Item[] = [
    {
      href: '/progress',
      label: tl('progress'),
      icon: <IconActivity width={18} height={18} />,
    },
    {
      href: '/admin/rooms',
      label: t('rooms'),
      icon: <IconVideo width={18} height={18} />,
    },
    {
      href: '/admin/users',
      label: t('users'),
      icon: <IconUsers width={18} height={18} />,
    },
    {
      href: '/notes',
      label: ta('inPerson'),
      icon: <IconNotebook width={18} height={18} />,
    },
  ]

  return (
    <nav
      aria-label={t('menu')}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      {folded ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={false}
          aria-label={t('unfold')}
          className="bg-surface/95 hover:bg-surface-raised pointer-events-auto ml-auto flex size-11 items-center justify-center rounded-full shadow-xl ring-1 ring-white/10 backdrop-blur"
        >
          <IconMenu />
        </button>
      ) : (
        <div className="bg-surface/95 pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5 shadow-xl ring-1 ring-white/10 backdrop-blur">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={here(it.href) ? 'page' : undefined}
              className={ITEM}
            >
              {it.icon}
              {it.label}
            </Link>
          ))}
          {admin && <AdminMenu items={adminItems} label={t('admin')} />}
          <span aria-hidden className="mx-0.5 h-7 w-px bg-white/10" />
          <AppLocaleSwitcher className="text-muted-foreground" />
          <button
            type="button"
            onClick={toggle}
            aria-expanded
            aria-label={t('fold')}
            title={t('fold')}
            className="text-muted-foreground hover:bg-surface-raised hover:text-foreground flex size-9 items-center justify-center rounded-xl"
          >
            <IconChevronDown />
          </button>
        </div>
      )}
    </nav>
  )
}

export function SiteHeader() {
  const { user } = useAppUser()
  // 표시 게이팅만 — 제작 현황 화면은 정적 안내(조회·쓰기 없음), 방 관리·사용자 관리·대면 노트는 API 가 ADMIN 을 다시 확인
  const admin = user?.role === 'ADMIN' || user?.role === 'MASTER'

  return (
    <>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 lg:max-w-none lg:px-8">
          <Link href="/" className="text-lg font-bold">
            seminar.pi
          </Link>
          {/* 로그인 버튼 글자가 좁은 화면에서 두 줄로 꺾이지 않게 */}
          <div className="ml-auto [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap">
            <AuthStatus />
          </div>
        </div>
      </header>
      <BottomNav admin={admin} />
    </>
  )
}

'use client'

/**
 * AdminQuickMenu — 하단 Footer(하단 네비)의 Admin 메뉴 위에 뜨는 플로팅 팝업
 * -------------------------------------------------------------------------
 * 좌측 사이드바(admin-sidebar)는 `hidden md:flex`라 모바일(Pi Browser)에서 숨겨진다.
 * 그 대체로, 하단 네비 바로 위에 플로팅 트리거 버튼을 두고, 탭하면 위로(드롭업)
 * 관리자 핵심 메뉴를 불투명도 80% 팝업으로 펼친다.
 * - 위치: fixed, 하단 네비(h-16 + safe-area) 위.
 * - 핵심 항목만(QUICK_NAV) 선별. 항목 추가·제거는 이 배열만 편집.
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronUp, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

type QuickNavItem = { href: string; label: string }

// 팝업에 올릴 항목은 서버(getQuickMenuItems)에서 주입 — /admin/quick-menu에서 관리.
export function AdminQuickMenu({ items }: { items: QuickNavItem[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const QUICK_NAV = items

  // pathname은 locale prefix가 없을 수 있으므로 endsWith로 현재 항목 판정
  const isActive = (href: string) =>
    pathname === href || pathname.endsWith(href)
  const label = (n: QuickNavItem) => n.label

  return (
    <>
      {/* 바깥 터치로 닫기 (팝업 열림 시) */}
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-black/10"
        />
      )}

      {/* 하단 네비 위 플로팅 컨테이너 (드롭업) */}
      <div
        className="fixed inset-x-3 z-40 flex flex-col items-end"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5.25rem)' }}
      >
        {/* 팝업 패널 — 트리거 위로 펼침, 불투명도 80% */}
        {open && (
          <nav className="mb-2 grid w-full max-h-[60vh] grid-cols-2 gap-1 overflow-auto rounded-2xl border bg-background/80 p-2 shadow-[0_14px_34px_-8px_rgba(0,0,0,0.42)] backdrop-blur-md">
            {QUICK_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-sm transition-colors',
                  isActive(n.href)
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted active:bg-muted',
                )}
              >
                {label(n)}
              </Link>
            ))}
          </nav>
        )}

        {/* 트리거 버튼 — 우측 정렬 플로팅, 불투명도 80% */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex touch-manipulation items-center gap-2 rounded-full border bg-background/80 px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-md transition-transform select-none active:scale-95"
        >
          <ShieldCheck className="size-4" />
          관리 메뉴
          <ChevronUp
            className={cn(
              'size-4 shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </div>
    </>
  )
}

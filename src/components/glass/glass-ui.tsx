'use client'

/**
 * Prism Glass UI 세트
 * -------------------------------------------------------------------------
 * 참고 이미지(newStyle_UI000001.png)의 글래스모피즘 스타일을 컴포넌트화한 세트.
 * - 유리 질감(.glass-surface) + 무지개빛 프리즘 테두리(.glass-prism)는 globals.css 유틸.
 * - 색상/레이아웃/상호작용만 이 파일에서 조합한다.
 * - ⚠️ 기존 shadcn(ui/*) 컴포넌트와 완전히 분리 — Pi 결제·인증 화면 불변.
 */

import * as React from 'react'
import {
  Check,
  Plus,
  Power,
  RotateCw,
  Search,
  X,
  ChevronsUpDown,
  Sparkles,
} from 'lucide-react'

import { cn } from '@/lib/utils'

/* ── 공통: 유리 표면 베이스 ─────────────────────────────────────────────── */
type GlassBaseProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 무지개 프리즘 테두리 표시 여부 */
  prism?: boolean
  /** 상단 광택 하이라이트 표시 여부 */
  gloss?: boolean
}

export function GlassSurface({
  className,
  prism = true,
  gloss = false,
  children,
  ...props
}: GlassBaseProps) {
  return (
    <div
      className={cn(
        'glass-surface',
        prism && 'glass-prism',
        gloss && 'glass-gloss',
        'relative overflow-hidden',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* ── 버튼 ──────────────────────────────────────────────────────────────── */
type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
}

export function GlassButton({
  variant = 'primary',
  className,
  children,
  ...props
}: GlassButtonProps) {
  return (
    <button
      className={cn(
        'glass-surface glass-prism group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full px-8 text-base font-semibold',
        'transition-all duration-200 active:scale-[0.97]',
        variant === 'primary' && 'text-white',
        variant === 'secondary' && 'text-slate-700 dark:text-slate-100',
        variant === 'ghost' && 'text-slate-600 dark:text-slate-200',
        className,
      )}
      {...props}
    >
      {/* 컬러 오버레이 */}
      {variant === 'primary' && (
        <span className="absolute inset-0 z-0 bg-gradient-to-br from-[#ff9a4d] via-[#ff6a3d] to-[#ff4d6e] opacity-95" />
      )}
      {variant === 'secondary' && (
        <span className="absolute inset-0 z-0 bg-gradient-to-br from-[#bcd4ff]/70 via-[#a8c0ff]/50 to-[#c9b8ff]/60" />
      )}
      {/* 지나가는 광택 */}
      <span className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-1/3 -translate-x-[140%] skew-x-[-18deg] bg-white/40 blur-md transition-transform duration-700 group-hover:translate-x-[320%]" />
      <span className="relative z-[3] flex items-center gap-2 drop-shadow-sm">
        {children}
      </span>
    </button>
  )
}

/* ── 아이콘 버튼 ───────────────────────────────────────────────────────── */
export function GlassIconButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'glass-surface glass-prism glass-gloss relative flex size-14 items-center justify-center rounded-3xl text-slate-600 transition-all duration-200 active:scale-95 dark:text-slate-200',
        className,
      )}
      {...props}
    >
      <span className="relative z-[3]">{children ?? <Power className="size-6" />}</span>
    </button>
  )
}

/* ── 검색 바 (+ 버튼 결합) ─────────────────────────────────────────────── */
type GlassSearchProps = {
  placeholder?: string
  onAdd?: () => void
  className?: string
}

export function GlassSearch({
  placeholder = 'With suggestions',
  onAdd,
  className,
}: GlassSearchProps) {
  const [value, setValue] = React.useState('')
  return (
    <div className={cn('flex items-stretch gap-3', className)}>
      <GlassSurface
        gloss
        className="flex h-14 flex-1 items-center gap-3 rounded-full px-5"
      >
        <Search className="relative z-[3] size-5 shrink-0 text-slate-500 dark:text-slate-300" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="relative z-[3] w-full bg-transparent text-base text-slate-700 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-400"
        />
      </GlassSurface>
      <button
        onClick={onAdd}
        aria-label="추가"
        className="glass-surface glass-prism glass-gloss relative flex size-14 shrink-0 items-center justify-center rounded-full text-slate-600 transition-all active:scale-95 dark:text-slate-200"
      >
        <Plus className="relative z-[3] size-6" />
      </button>
    </div>
  )
}

/* ── 셀렉트(라벨) + 체크박스 ──────────────────────────────────────────── */
type GlassSelectProps = {
  label?: string
  defaultChecked?: boolean
  className?: string
}

export function GlassSelect({
  label = 'Select',
  defaultChecked = true,
  className,
}: GlassSelectProps) {
  const [checked, setChecked] = React.useState(defaultChecked)
  return (
    <GlassSurface
      className={cn(
        'flex h-16 items-center gap-3 rounded-full py-2 pr-2 pl-6',
        className,
      )}
    >
      <RotateCw className="relative z-[3] size-5 text-slate-500 dark:text-slate-300" />
      <span className="relative z-[3] flex-1 text-lg font-medium text-slate-700 dark:text-slate-100">
        {label}
      </span>
      <GlassCheckbox checked={checked} onChange={setChecked} />
    </GlassSurface>
  )
}

/* ── 체크박스 (그린) ───────────────────────────────────────────────────── */
export function GlassCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative z-[3] flex size-11 items-center justify-center rounded-2xl transition-all duration-200 active:scale-95',
        checked
          ? 'bg-gradient-to-br from-[#3fe0a3] to-[#22b184] shadow-[0_4px_14px_rgba(45,200,150,0.5)]'
          : 'glass-surface glass-prism',
      )}
    >
      <Check
        className={cn(
          'size-6 text-white transition-all',
          checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
        strokeWidth={3}
      />
    </button>
  )
}

/* ── 토글 스위치 (그린) ────────────────────────────────────────────────── */
export function GlassToggle({
  defaultOn = true,
  className,
}: {
  defaultOn?: boolean
  className?: string
}) {
  const [on, setOn] = React.useState(defaultOn)
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={cn(
        'glass-prism relative flex h-14 w-24 items-center rounded-full p-1.5 transition-colors duration-300',
        on
          ? 'bg-gradient-to-br from-[#3fe0a3]/90 to-[#22b184]/90'
          : 'glass-surface',
        className,
      )}
    >
      <span
        className={cn(
          'glass-gloss relative z-[3] flex size-11 items-center justify-center rounded-full bg-white shadow-[0_3px_10px_rgba(0,0,0,0.2)] transition-transform duration-300',
          on ? 'translate-x-10' : 'translate-x-0',
        )}
      />
    </button>
  )
}

/* ── 탭 ────────────────────────────────────────────────────────────────── */
export function GlassTabs({
  tabs = ['Tabs', 'Toast'],
  className,
}: {
  tabs?: string[]
  className?: string
}) {
  const [active, setActive] = React.useState(0)
  return (
    <div className={cn('flex gap-4', className)}>
      {tabs.map((t, i) => (
        <button
          key={t}
          onClick={() => setActive(i)}
          className={cn(
            'glass-surface glass-prism relative flex h-14 flex-1 items-center justify-center gap-2 rounded-full px-6 text-lg font-medium transition-all active:scale-[0.97]',
            active === i
              ? 'text-slate-800 dark:text-white'
              : 'text-slate-500 dark:text-slate-400',
          )}
        >
          {active === i && (
            <span className="absolute inset-0 z-0 rounded-full bg-white/40 dark:bg-white/10" />
          )}
          <ChevronsUpDown className="relative z-[3] size-4" />
          <span className="relative z-[3]">{t}</span>
        </button>
      ))}
    </div>
  )
}

/* ── 토스트 알림 ───────────────────────────────────────────────────────── */
export function GlassToast({
  title = 'Toast',
  description,
  onClose,
  className,
}: {
  title?: string
  description?: string
  onClose?: () => void
  className?: string
}) {
  return (
    <GlassSurface
      gloss
      className={cn(
        'flex items-center gap-3 rounded-full py-3 pr-3 pl-6',
        className,
      )}
    >
      <Sparkles className="relative z-[3] size-5 text-[#ff8a4d]" />
      <div className="relative z-[3] flex-1">
        <p className="text-base font-medium text-slate-700 dark:text-slate-100">
          {title}
        </p>
        {description && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="닫기"
        className="relative z-[3] flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/40 dark:text-slate-300 dark:hover:bg-white/10"
      >
        <X className="size-4" />
      </button>
    </GlassSurface>
  )
}

/* ── 카드 ──────────────────────────────────────────────────────────────── */
export function GlassCard({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <GlassSurface
      gloss
      className={cn('flex flex-col rounded-[2rem] p-6', className)}
    >
      <div className="relative z-[3] flex h-full flex-col">{children}</div>
    </GlassSurface>
  )
}

/* ── 알림 팝오버 (Pro plan) ───────────────────────────────────────────── */
export function GlassPopover({
  className,
}: {
  className?: string
}) {
  const [open, setOpen] = React.useState(true)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="glass-surface glass-prism relative flex h-14 items-center justify-center rounded-[1.6rem] px-6 text-slate-600 dark:text-slate-200"
      >
        <span className="relative z-[3]">알림 다시 열기</span>
      </button>
    )
  }
  return (
    <GlassSurface
      gloss
      className={cn('rounded-[1.6rem] p-5', className)}
    >
      <div className="relative z-[3] flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-800 dark:text-white">
              Find files...
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add collaborator
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="닫기"
            className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/40 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
        <button className="group relative mt-1 flex h-12 items-center justify-center overflow-hidden rounded-full text-base font-semibold text-white">
          <span className="absolute inset-0 z-0 bg-gradient-to-r from-[#3d9aff] to-[#2b6fff]" />
          <span className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-1/3 -translate-x-[140%] skew-x-[-18deg] bg-white/40 blur-md transition-transform duration-700 group-hover:translate-x-[320%]" />
          <span className="relative z-[3]">Pro plan</span>
        </button>
      </div>
    </GlassSurface>
  )
}

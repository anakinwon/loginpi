'use client'
// 하단 컨트롤 바 — 발표자 : 마이크·카메라·나가기, 청중 : 나가기(+ 소리 막힘 시 "소리 켜기"). 설계서 6.1·14.3
// 꺼짐 = danger 색 + 사선 아이콘(색만으로 상태를 전하지 않음), 아이콘만 보여도 aria-label 유지.
// 폭 기반 슬롯(565/420/370) + 더보기(넘친 버튼이 1개면 바로 노출) · 폭 > 760px 텍스트 라벨 · 단축키 Ctrl/⌘+D·E · 자동 숨김(useBarVisibility)
import { useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { BAR, mainSlots, splitSlots } from './room-rules'
import type { MediaKind, Role } from './use-room'

export const ICON: Record<MediaKind | 'leave' | 'more', string> = {
  audio: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z',
  video: 'M15 8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2.5l5 3.5V7l-5 3.5V8Z',
  leave:
    'M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15.3 15.3 0 0 0 12 9Z',
  more: 'M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
}

export function Icon({ d, off, small }: { d: string; off?: boolean; small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={small ? 'h-4 w-4' : 'h-6 w-6'} fill="currentColor" aria-hidden>
      <path d={d} />
      {off && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

// 원형(아이콘만) / 알약(아이콘 + 텍스트 라벨, 넓은 화면) — 지름·높이 48px(최소 터치 타깃, 설계서 9절)
const BTN = 'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full transition-colors disabled:opacity-40'
const shape = (label?: boolean) => (label ? 'px-4 text-sm font-medium' : 'w-12')

// 마이크·카메라 토글 — 대기실 미리보기와 룸 하단 바가 같이 쓴다
export function MediaButton({
  kind,
  on,
  disabled,
  label,
  onClick,
}: {
  kind: MediaKind
  on: boolean
  disabled?: boolean
  label?: boolean // 텍스트 라벨 표시(넓은 화면) — aria-label 은 항상
  onClick: () => void
}) {
  const t = useTranslations('room')
  const text = t(`${kind === 'audio' ? 'mic' : 'cam'}.${on ? 'on' : 'off'}`)
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={text}
      title={text}
      disabled={disabled}
      onClick={onClick}
      className={`${BTN} ${shape(label)} ${on ? 'bg-surface-raised' : 'bg-danger text-white'}`}
    >
      <Icon d={ICON[kind]} off={!on} />
      {label && <span aria-hidden>{text}</span>}
    </button>
  )
}

// 입력 중(텍스트 칸·편집 영역)엔 단축키를 무시한다(설계서 10절)
function typing(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

// 더보기 — 데스크톱 팝오버, 좁은 화면 하단 시트(최대 80dvh). Esc·바깥 탭으로 닫힘, 열림 중엔 바 자동 숨김 보류(onOpen)
function MoreMenu({ items, onOpen }: { items: { id: string; node: (label: boolean) => ReactNode }[]; onOpen: (o: boolean) => void }) {
  const t = useTranslations('room')
  const [open, setOpenState] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const setOpen = (o: boolean) => {
    setOpenState(o)
    onOpen(o)
  }
  // 닫힌 채 사라지면(역할 전환·퇴장) 보류도 푼다
  useEffect(() => () => onOpen(false), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpenState(false)
      onOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t('more')}
        title={t('more')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={`${BTN} ${shape()} bg-surface-raised`}
      >
        <Icon d={ICON.more} />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          className="bg-surface fixed inset-x-0 bottom-0 z-30 flex max-h-[80dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-2 sm:rounded-xl sm:pb-4"
        >
          {items.map((it) => (
            <div key={it.id} role="none">
              {it.node(true)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ControlBar({
  role,
  ready,
  has,
  localOn,
  pending,
  soundBlocked,
  width,
  onHold,
  onToggle,
  onSound,
  onLeave,
}: {
  role: Role
  ready: boolean // 입장 완료 전(입장권·연결 중)엔 토글 비활성 — 발행 전이라 눌러도 효과 없음
  has: Record<MediaKind, boolean> // 실제로 가진 트랙만 버튼 노출(음성만 발표자에게 카메라 버튼 숨김)
  localOn: { audio: boolean; video: boolean }
  pending: MediaKind | null
  soundBlocked: boolean
  width: number // 룸 영역 폭(px) — 슬롯 수·라벨 판정
  onHold: (hold: boolean) => void // 메뉴 열림 등으로 자동 숨김을 보류
  onToggle: (kind: MediaKind, on: boolean) => void
  onSound: () => void
  onLeave: () => void
}) {
  const t = useTranslations('room')
  const presenter = role === 'presenter'

  // 단축키 — 최신 값은 ref 로 읽는다(리스너는 한 번만 등록)
  const latest = useRef({ presenter, ready, has, localOn, onToggle })
  useEffect(() => {
    latest.current = { presenter, ready, has, localOn, onToggle }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || typing(e.target)) return
      const kind = ({ d: 'audio', e: 'video' } as const)[e.key.toLowerCase() as 'd' | 'e']
      const p = latest.current
      if (!kind || !p.presenter || !p.ready || !p.has[kind]) return
      e.preventDefault() // Ctrl+D 북마크·Ctrl+E 주소창 검색 대신
      p.onToggle(kind, !p.localOn[kind])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 슬롯 대상 버튼(우선순위 순). W3 의 화면공유·채팅·참가자·손들기·반응이 이 목록에 붙는다
  const items: { id: string; node: (label: boolean) => ReactNode }[] = presenter
    ? (['audio', 'video'] as const)
        .filter((k) => has[k])
        .map((k) => ({
          id: k,
          node: (label: boolean) => (
            <MediaButton
              kind={k}
              on={localOn[k]}
              label={label}
              disabled={!ready || pending !== null}
              onClick={() => onToggle(k, !localOn[k])}
            />
          ),
        }))
    : []
  const labels = width > BAR.labelMinWidth
  const { main, more } = splitSlots(items, mainSlots(width, role))

  return (
    <nav
      aria-label={t('controls')}
      className="landscape-short:h-full landscape-short:flex-col landscape-short:pt-0 landscape-short:pb-0 landscape-short:pr-[max(8px,env(safe-area-inset-right))] flex items-center justify-center gap-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      {main.map((it) => (
        <span key={it.id} className="contents">
          {it.node(labels)}
        </span>
      ))}
      {more.length > 0 && <MoreMenu items={more} onOpen={onHold} />}
      {soundBlocked && (
        <button type="button" onClick={onSound} className={`${BTN} bg-accent px-4 text-sm font-semibold text-white`}>
          <span aria-hidden>🔊</span> {t('enableSound')}
        </button>
      )}
      <button
        type="button"
        aria-label={t('leave')}
        title={t('leave')}
        onClick={onLeave}
        className={`${BTN} ${shape(labels)} bg-danger text-white`}
      >
        <Icon d={ICON.leave} />
        {labels && <span aria-hidden>{t('leave')}</span>}
      </button>
    </nav>
  )
}

// 바 표시 여부(설계서 G6·14.3) — 마우스 : 4000ms 무조작 숨김(포인터가 바 위·바 안 포커스·메뉴 열림이면 유지),
// 터치·펜 : 타이머 없이 무대 탭으로 토글. 판정은 이벤트의 pointerType 으로만(UA 판정 금지). active=false(입장 전)면 항상 표시
export function useBarVisibility(active: boolean) {
  const [shown, setShown] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const holds = useRef({ over: false, focus: false, menu: false })
  const mouse = useRef(false) // 마지막 조작이 마우스였나 — 터치 사용자에겐 타이머를 걸지 않는다

  const arm = () => {
    clearTimeout(timer.current)
    const h = holds.current
    if (mouse.current && !h.over && !h.focus && !h.menu) timer.current = setTimeout(() => setShown(false), BAR.hideMs)
  }
  const hold = (k: keyof typeof holds.current, v: boolean) => {
    holds.current[k] = v
    if (v) {
      clearTimeout(timer.current)
      setShown(true)
    } else arm()
  }

  useEffect(() => {
    if (!active) {
      clearTimeout(timer.current)
      setShown(true)
    }
    return () => clearTimeout(timer.current)
  }, [active])

  return {
    shown: !active || shown,
    // 룸 영역(무대 포함)에 붙인다
    area: {
      onPointerMove: (e: RPointerEvent) => {
        if (!active || e.pointerType !== 'mouse') return
        mouse.current = true
        setShown(true)
        arm()
      },
      onPointerUp: (e: RPointerEvent) => {
        if (!active || e.pointerType === 'mouse') return
        mouse.current = false
        clearTimeout(timer.current)
        if ((e.target as HTMLElement).closest('nav, [role="menu"]')) return // 바·메뉴 안의 탭은 버튼 동작만
        setShown((s) => !s)
      },
    },
    // 바 감싸개에 붙인다
    bar: {
      onPointerEnter: (e: RPointerEvent) => {
        if (e.pointerType === 'mouse') hold('over', true)
      },
      onPointerLeave: (e: RPointerEvent) => {
        if (e.pointerType === 'mouse') hold('over', false)
      },
      onFocus: () => hold('focus', true),
      onBlur: (e: FocusEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) hold('focus', false)
      },
    },
    onMenu: (open: boolean) => hold('menu', open),
  }
}

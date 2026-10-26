'use client'
// 하단 컨트롤 바 — 역할별 버튼(설계서 6.1·14.3 표) : presenter·panel = 마이크·카메라·채팅·참가자·화면공유(+손 목록 / 반응),
// audience = 손들기·반응·채팅·참가자·화질(M4 수동 상한). 나가기·소리 켜기는 슬롯 밖. 꺼짐 = danger 색 + 사선 아이콘(색만으로 상태를 전하지 않음), 아이콘만 보여도 aria-label 유지.
// 폭 기반 슬롯(565/420/370) + 더보기(넘친 버튼이 1개면 바로 노출) · 폭 > 760px 텍스트 라벨 · 단축키 Ctrl/⌘+D·E · 자동 숨김(useBarVisibility)
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { BAR, barOrder, mainSlots, QUALITY_CAPS, splitSlots, type BarId, type QualityCap } from './room-rules'
import type { MediaKind, SessionRole } from './use-room'

export const ICON: Record<
  MediaKind | 'leave' | 'more' | 'screen' | 'chat' | 'people' | 'close' | 'quality' | 'warn',
  string
> = {
  quality:
    'M3 6h11v2H3V6Zm15 0h3v2h-3v2h-2V4h2v2ZM3 16h3v2H3v-2Zm7 0h11v2H10v-2Zm-2-2h2v6H8v-6Zm-5-3h7v2H3v-2Zm11 0h7v2h-7v2h-2V9h2v2Z',
  warn: 'M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z',
  screen: 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7v2h3v2H8v-2h3v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h16V6H4Z',
  chat: 'M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2Z',
  people:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-3 3-5 7-5s7 2 7 5v1H2v-1Zm16-4.6c2.4.4 4 1.9 4 4.1V20h-4.5v-1c0-1.8-.5-3.3-1.4-4.5.6-.1 1.2-.1 1.9-.1Z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z',
  audio:
    'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z',
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
const BTN =
  'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full transition-colors disabled:opacity-40'
const shape = (label?: boolean) => (label ? 'px-4 text-sm font-medium' : 'w-12')

// 마이크·카메라 토글 — 대기실 미리보기와 룸 하단 바가 같이 쓴다
export function MediaButton({
  kind,
  on,
  disabled,
  reason,
  label,
  menu,
  onClick,
}: {
  kind: MediaKind
  on: boolean
  disabled?: boolean
  reason?: string // 막힌 이유(발표자 잠금 등) — 이름·툴팁에 덧붙여 낭독기도 이유를 듣는다
  label?: boolean // 텍스트 라벨 표시(넓은 화면) — aria-label 은 항상
  menu?: boolean // 더보기 메뉴 안 — 토글은 menuitemcheckbox(aria-checked)
  onClick: () => void
}) {
  const t = useTranslations('room')
  const base = t(`${kind === 'audio' ? 'mic' : 'cam'}.${on ? 'on' : 'off'}`)
  const text = reason ? `${base} — ${reason}` : base
  return (
    <button
      type="button"
      {...(menu ? { role: 'menuitemcheckbox', 'aria-checked': on } : { 'aria-pressed': on })}
      aria-label={text}
      title={text}
      disabled={disabled}
      onClick={onClick}
      className={`${BTN} ${shape(label)} ${on ? 'bg-surface-raised' : 'bg-danger text-white'}`}
    >
      <Icon d={ICON[kind]} off={!on} />
      {label && <span aria-hidden>{base}</span>}
    </button>
  )
}

// 입력 중(텍스트 칸·편집 영역)엔 단축키를 무시한다(설계서 10절)
function typing(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

// 메뉴 키보드(WAI-ARIA 메뉴 패턴) — ↑↓(←→) 순환·Home·End 로 menuitem 사이 이동. 더보기·반응 메뉴가 같이 쓴다
export function menuKeys(e: ReactKeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')]
  if (!items.length) return
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next =
    e.key === 'ArrowDown' || e.key === 'ArrowRight'
      ? (i + 1) % items.length
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
        ? (i - 1 + items.length) % items.length
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? items.length - 1
            : -1
  if (next < 0) return
  e.preventDefault()
  items[next].focus()
}

// 열린 메뉴 공용 동작 — 열리면 첫 항목에 포커스, Esc = 닫고 여는 버튼으로 포커스 복귀, Tab·바깥 탭 = 닫기.
// triggerSel = 여는 버튼이 메뉴 밖에 따로 있을 때(반응 메뉴) — 그 버튼 탭은 바깥 탭으로 치지 않고, Esc 때 포커스를 돌려준다.
// fallbackSel = 여는 버튼이 이미 사라졌을 때(더보기 안에서 열어 더보기가 닫힘) Esc 포커스를 받을 요소(더보기 버튼)
export function useMenu(open: boolean, close: () => void, triggerSel?: string, fallbackSel?: string) {
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return latest.current() // 포커스 이동은 브라우저에 맡긴다
      if (e.key !== 'Escape') return
      latest.current()
      const q = (s?: string) => (s ? document.querySelector<HTMLElement>(s) : null)
      ;(triggerRef.current ?? q(triggerSel) ?? q(fallbackSel))?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element
      if (rootRef.current?.contains(el) || (triggerSel && el.closest?.(triggerSel))) return
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open, triggerSel, fallbackSel])
  return { rootRef, menuRef, triggerRef }
}

// 메뉴 표면 — 데스크톱 팝오버(버튼 위), 좁은 화면 하단 시트(최대 80dvh)
export const MENU_SURFACE =
  'bg-surface fixed inset-x-0 bottom-0 z-30 flex max-h-[80dvh] flex-col gap-2 overflow-y-auto rounded-t-2xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:mb-2 sm:rounded-xl sm:pb-4'

export type BarItem = { id: string; node: (o: { label: boolean; menu: boolean }) => ReactNode }

// 더보기 — 항목을 누르면 닫힌다. 열림 중엔 바 자동 숨김 보류(onOpen)
function MoreMenu({ items, onOpen }: { items: BarItem[]; onOpen: (o: boolean) => void }) {
  const t = useTranslations('room')
  const [open, setOpenState] = useState(false)
  const id = useId()
  const setOpen = (o: boolean) => {
    setOpenState(o)
    onOpen(o)
  }
  const m = useMenu(open, () => setOpen(false))
  // 닫힌 채 사라지면(역할 전환·퇴장) 보류도 푼다
  useEffect(() => () => onOpen(false), []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={m.rootRef} className="relative">
      <button
        ref={m.triggerRef}
        type="button"
        data-more-trigger
        aria-label={t('more')}
        title={t('more')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={`${BTN} ${shape()} bg-surface-raised`}
      >
        <Icon d={ICON.more} />
      </button>
      {open && (
        <div
          ref={m.menuRef}
          id={id}
          role="menu"
          aria-label={t('more')}
          onKeyDown={menuKeys}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role^="menuitem"]')) setOpen(false)
          }}
          className={MENU_SURFACE}
        >
          {items.map((it) => (
            <div key={it.id} role="none">
              {it.node({ label: true, menu: true })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// 아이콘 + 텍스트 버튼(채팅·참가자·화면공유·손들기·반응) — 메뉴 안이면 menuitem(토글은 menuitemcheckbox), 밖이면 aria-pressed.
// badge = 안 읽은 채팅·손든 사람 수(9 초과는 9+)
export function BarButton({
  icon,
  text,
  pressed,
  badge,
  label,
  menu,
  disabled,
  accent,
  onClick,
  ...rest
}: {
  icon: ReactNode
  text: string
  pressed?: boolean
  badge?: number
  label: boolean
  menu: boolean
  disabled?: boolean
  accent?: boolean // 켜짐을 강조색으로(손들기)
  onClick: () => void
  'data-react-trigger'?: boolean
  'data-quality-trigger'?: boolean
  'aria-haspopup'?: 'menu' // 메뉴를 여는 버튼(반응) — 토글 상태는 aria-expanded 로(aria-pressed 대신)
  'aria-expanded'?: boolean
}) {
  const state =
    pressed === undefined
      ? { role: menu ? 'menuitem' : undefined }
      : menu
        ? { role: 'menuitemcheckbox', 'aria-checked': pressed }
        : { 'aria-pressed': pressed }
  return (
    <button
      type="button"
      {...state}
      {...rest}
      aria-label={badge ? `${text} (${badge})` : text}
      title={text}
      disabled={disabled}
      onClick={onClick}
      className={`${BTN} ${shape(label)} relative ${pressed && accent ? 'bg-accent text-white' : pressed ? 'bg-surface-raised ring-accent ring-2' : 'bg-surface-raised'}`}
    >
      {icon}
      {label && <span aria-hidden>{text}</span>}
      {!!badge && (
        <span
          aria-hidden
          className="bg-danger absolute -top-1 -right-1 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold text-white"
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}

const Emoji = ({ c }: { c: string }) => (
  <span aria-hidden className="text-xl leading-none">
    {c}
  </span>
)

export type PanelTab = 'chat' | 'people'

export function ControlBar({
  role,
  ready,
  addReady,
  has,
  localOn,
  locked,
  pending,
  canShare,
  sharing,
  panel,
  unread,
  raised,
  handUp,
  reactOpen,
  qualityOpen,
  qualityCap,
  soundBlocked,
  width,
  onHold,
  onToggle,
  onShare,
  onPanel,
  onHand,
  onReact,
  onQuality,
  onSound,
  onLeave,
}: {
  role: SessionRole
  ready: boolean // 발행 완료(produce 응답) 전엔 마이크·카메라 토글 비활성 — producerId 가 없어 눌러도 실패
  addReady: boolean // 아직 없는 마이크·카메라를 켜서 발행할 수 있나(입장 완료·발행 협상 중 아님)
  has: Record<MediaKind, boolean> // 가진 트랙 — 없는 종류는 presenter 면 숨김(카메라 없이 입장), panel 이면 "켜기"(승격 뒤 발행)
  localOn: { audio: boolean; video: boolean }
  locked: Record<MediaKind, boolean> // 발표자 잠금으로 내가 켤 수 없는 종류(v1.2, 끄기는 늘 가능)
  pending: MediaKind | null
  canShare: boolean // getDisplayMedia 기능 탐지 결과(UA 판정 금지, 설계서 6.1)
  sharing: boolean
  panel: PanelTab | null
  unread: number
  raised: number // 손든 사람 수(presenter 손 목록 배지)
  handUp: boolean // 내 손(audience)
  reactOpen: boolean
  qualityOpen: boolean
  qualityCap: QualityCap
  soundBlocked: boolean
  width: number // 룸 영역 폭(px) — 슬롯 수·라벨 판정(사이드 패널이 열리면 좁아진다)
  onHold: (hold: boolean) => void // 메뉴 열림 등으로 자동 숨김을 보류
  onToggle: (kind: MediaKind, on: boolean) => void
  onShare: (on: boolean) => void
  onPanel: (tab: PanelTab) => void
  onHand: (raised: boolean) => void
  onReact: () => void
  onQuality: () => void // 화질 메뉴 열기·닫기(청중)
  onSound: () => void
  onLeave: () => void
}) {
  const t = useTranslations('room')
  const stage = role !== 'audience'
  // presenter 는 가진 트랙만, panel 은 늘 둘 다(없으면 탭해서 켠다 — 승격 뒤 자동 켜기 금지)
  const shown = (k: MediaKind) => has[k] || role === 'panel'

  // 단축키 — 최신 값은 ref 로 읽는다(리스너는 한 번만 등록). 아직 없는 트랙은 단축키로 켜지 않는다(권한 팝업은 버튼 탭으로만)
  const latest = useRef({ stage, ready, has, localOn, locked, onToggle })
  useEffect(() => {
    latest.current = { stage, ready, has, localOn, locked, onToggle }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || typing(e.target)) return
      // e.code(물리 키) — 한글 입력 상태에선 e.key 가 'ㅇ'·'ㄷ' 로 와 단축키가 안 먹는다
      const kind = ({ KeyD: 'audio', KeyE: 'video' } as const)[e.code as 'KeyD' | 'KeyE']
      const p = latest.current
      if (!kind || !p.stage || !p.ready || !p.has[kind] || (p.locked[kind] && !p.localOn[kind])) return
      e.preventDefault() // Ctrl+D 북마크·Ctrl+E 주소창 검색 대신
      p.onToggle(kind, !p.localOn[kind])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const node: Record<BarId, BarItem['node'] | null> = {
    audio: stage && shown('audio') ? mediaNode('audio') : null,
    video: stage && shown('video') ? mediaNode('video') : null,
    screen:
      stage && canShare
        ? (o) => (
            <BarButton
              {...o}
              icon={<Icon d={ICON.screen} />}
              text={t(sharing ? 'screen.stop' : 'screen.start')}
              pressed={sharing}
              disabled={!addReady && !sharing}
              onClick={() => onShare(!sharing)}
            />
          )
        : null,
    chat: (o) => (
      <BarButton
        {...o}
        icon={<Icon d={ICON.chat} />}
        text={t('panel.chat')}
        pressed={panel === 'chat'}
        badge={unread}
        onClick={() => onPanel('chat')}
      />
    ),
    people: (o) => (
      <BarButton
        {...o}
        icon={<Icon d={ICON.people} />}
        text={t('panel.people')}
        pressed={panel === 'people'}
        onClick={() => onPanel('people')}
      />
    ),
    // 손 목록(presenter) = 참가자 패널(손든 사람이 위로 정렬) — 배지로 대기 수
    hands:
      role === 'presenter'
        ? (o) => (
            <BarButton
              {...o}
              icon={<Emoji c="✋" />}
              text={t('hand.list')}
              badge={raised}
              onClick={() => onPanel('people')}
            />
          )
        : null,
    hand:
      role === 'audience'
        ? (o) => (
            <BarButton
              {...o}
              icon={<Emoji c="✋" />}
              text={t(handUp ? 'hand.lower' : 'hand.raise')}
              pressed={handUp}
              accent
              onClick={() => onHand(!handUp)}
            />
          )
        : null,
    react:
      role !== 'presenter'
        ? (o) => (
            <BarButton
              {...o}
              icon={<Emoji c="😀" />}
              text={t('react.open')}
              {...(o.menu ? {} : { 'aria-haspopup': 'menu' as const, 'aria-expanded': reactOpen })}
              data-react-trigger
              onClick={onReact}
            />
          )
        : null,
    quality:
      role === 'audience'
        ? (o) => (
            <BarButton
              {...o}
              icon={<Icon d={ICON.quality} />}
              text={`${t('quality.label')} · ${t(`quality.${qualityCap}`)}`}
              {...(o.menu ? {} : { 'aria-haspopup': 'menu' as const, 'aria-expanded': qualityOpen })}
              data-quality-trigger
              onClick={onQuality}
            />
          )
        : null,
  }

  function mediaNode(k: MediaKind): BarItem['node'] {
    const missing = !has[k]
    const blocked = locked[k] && !localOn[k] // 잠금 중 켜기만 막는다(서버도 LOCKED)
    return ({ label, menu }) => (
      <MediaButton
        kind={k}
        on={localOn[k]}
        label={label}
        menu={menu}
        reason={blocked ? t('mod.locked') : undefined}
        disabled={blocked || (missing ? !addReady : !ready || pending !== null)}
        onClick={() => onToggle(k, !localOn[k])}
      />
    )
  }

  const items: BarItem[] = barOrder(role, width).flatMap((id) => {
    const n = node[id]
    return n ? [{ id, node: n }] : []
  })
  const labels = width > BAR.labelMinWidth
  const { main, more } = splitSlots(items, mainSlots(width, role))

  return (
    <nav
      aria-label={t('controls')}
      className="landscape-short:h-full landscape-short:flex-col landscape-short:pt-0 landscape-short:pb-0 landscape-short:pr-[max(8px,env(safe-area-inset-right))] flex flex-wrap items-center justify-center gap-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      {main.map((it) => (
        <span key={it.id} className="contents">
          {it.node({ label: labels, menu: false })}
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

// 화질 메뉴(청중, 설계서 14.3 '화질' 칸) — 자동/높음/보통/낮음 중 하나(menuitemradio), 고르면 닫는다. 자동 계산 레이어를 이 값으로 자른다
export function QualityMenu({
  open,
  cap,
  onClose,
  onPick,
}: {
  open: boolean
  cap: QualityCap
  onClose: () => void
  onPick: (c: QualityCap) => void
}) {
  const t = useTranslations('room')
  const m = useMenu(open, onClose, '[data-quality-trigger]', '[data-more-trigger]')
  if (!open) return null
  return (
    <div ref={m.rootRef} className="relative">
      <div
        ref={m.menuRef}
        role="menu"
        aria-label={t('quality.label')}
        onKeyDown={menuKeys}
        className={`${MENU_SURFACE} sm:right-1/2! sm:translate-x-1/2`}
      >
        {QUALITY_CAPS.map((c) => (
          <button
            key={c}
            type="button"
            role="menuitemradio"
            aria-checked={c === cap}
            onClick={() => {
              onPick(c)
              onClose()
            }}
            className={`hover:bg-surface-raised h-12 rounded-full px-4 text-left text-sm ${c === cap ? 'ring-accent font-semibold ring-2' : ''}`}
          >
            {t(`quality.${c}`)}
          </button>
        ))}
      </div>
    </div>
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

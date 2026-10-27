'use client'
// 사이드 패널 — 채팅·참가자 탭(설계서 14.4·5.3). 닫아도 언마운트하지 않는다(쓰던 글·스크롤 유지, 안 읽은 수는 room-view 가 센다).
// 폭 <580px 이면 전체 화면(포커스 가둠), 그 이상은 룸 오른쪽 열. 탭 ←→·Esc 닫기. 채팅은 저장 안 함(엔진 중계만 — 늦게 들어오면 이전 대화 없음, 13절 #2)
// 부가 기능 탭(설계서 15.3, extensions PanelTabDef) — 채팅과 참가자 사이에 등록 순서대로. 없으면 기존 2탭 그대로
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ICON, Icon, type PanelTab } from './control-bar'
import { modActions, sortPeers, type Locks, type ModAction, type PeerMedia } from './room-rules'
import type { ChatMsg, Peer, SessionRole } from './use-room'

const CHAT_MAX = 500 // SIGNAL_API 3.3 C. maxLength 는 UTF-16 단위라 이모지는 2로 센다 → 서버(문자 수)보다 엄격, 넘칠 일 없음
const SAME_SENDER_MS = 60000 // 같은 사람이 1분 안에 이어 쓰면 이름·시각 줄 생략(설계서 14.4)
const FULL_SCREEN = '(max-width: 579.98px)' // 아래 className 의 min-[580px] 와 짝 — 이 폭에선 패널이 전체 화면
const FOCUSABLE = ':is(button, input, a[href], [tabindex]):not([disabled]):not([tabindex="-1"])'

// 부가 탭 1개 — label 은 room.* 아래 문구 키, badge = 새 항목 수, node = 탭 내용(room-view 가 맥락을 넣어 만든다)
export type ExtraTab = { id: string; label: string; badge: number; node: ReactNode }

export function SidePanel({
  tab,
  open,
  viewer,
  selfId,
  peers,
  chat,
  onTab,
  onClose,
  onSend,
  onRetry,
  onPromote,
  onDemote,
  onLowerAll,
  media,
  locks,
  onMod,
  onMuteAll,
  extra = [],
}: {
  tab: PanelTab
  open: boolean
  viewer: SessionRole
  selfId: string
  peers: Peer[]
  chat: ChatMsg[]
  onTab: (t: PanelTab) => void
  onClose: () => void
  onSend: (text: string) => void // 실패는 그 메시지 줄의 [다시 보내기](onRetry)로 — 입력 칸에 되돌리지 않는다(중복 방지)
  onRetry: (m: ChatMsg) => void
  onPromote: (peerId: string) => void
  onDemote: (peerId: string) => void
  onLowerAll: () => void
  media: Map<string, PeerMedia> // 참가자별 마이크·카메라(v1.2 사회 동작 판정)
  locks: Locks
  onMod: (peerId: string, action: ModAction) => void
  onMuteAll: (lock: boolean) => void // 모두 마이크 끄기(lock = 잠금 설정·유지 여부)
  extra?: ExtraTab[]
}) {
  const t = useTranslations('room')
  const id = useId()
  const tabs: PanelTab[] = ['chat', ...extra.map((x) => x.id), 'people']
  const ext = new Map(extra.map((x) => [x.id, x]))
  const tabEl = (x: PanelTab) => document.getElementById(`${id}-${x}`)
  const asideRef = useRef<HTMLElement>(null)
  // 열리면 활성 탭으로 포커스, 닫히면(포커스가 패널 안·없음일 때만) 연 곳으로 돌려준다. tab 은 열 때 값만 본다
  useEffect(() => {
    if (!open) return
    const back = document.activeElement as HTMLElement | null
    tabEl(tab)?.focus()
    return () => {
      const cur = document.activeElement
      if ((cur === document.body || asideRef.current?.contains(cur)) && back?.isConnected) back.focus()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 탭 목록 키보드(WAI-ARIA 탭 패턴, roving tabindex) — ←→ 순환·Home·End 로 바로 전환하고 포커스 이동
  function tabKeys(e: React.KeyboardEvent) {
    const i = tabs.indexOf(tab)
    const n = tabs.length
    const next =
      e.key === 'ArrowRight'
        ? tabs[(i + 1) % n]
        : e.key === 'ArrowLeft'
          ? tabs[(i - 1 + n) % n]
          : e.key === 'Home'
            ? tabs[0]
            : e.key === 'End'
              ? tabs[n - 1]
              : null
    if (!next) return
    e.preventDefault()
    onTab(next)
    tabEl(next)?.focus()
  }

  // Esc = 닫기. 폭 <580px(전체 화면 패널)에선 Tab 이 패널 밖 무대·바로 새지 않게 가둔다
  function panelKeys(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      return onClose()
    }
    if (e.key !== 'Tab' || !window.matchMedia(FULL_SCREEN).matches) return
    const els = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]'))
    if (!els.length) return
    const edge = e.shiftKey ? els[0] : els[els.length - 1]
    if (document.activeElement !== edge) return
    e.preventDefault()
    ;(e.shiftKey ? els[els.length - 1] : els[0]).focus()
  }

  return (
    <aside
      ref={asideRef}
      hidden={!open}
      aria-label={t('panel.title')}
      onKeyDown={panelKeys}
      className="bg-surface fixed inset-0 z-30 flex flex-col min-[580px]:static min-[580px]:z-auto min-[580px]:h-[min(80dvh,720px)] lg:h-auto min-[580px]:w-80 min-[580px]:shrink-0 min-[580px]:rounded-xl"
    >
      <div className="flex items-center gap-1 border-b border-white/10 p-2">
        <div role="tablist" aria-label={t('panel.title')} onKeyDown={tabKeys} className="flex flex-1 gap-1">
          {tabs.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              id={`${id}-${x}`}
              aria-selected={tab === x}
              aria-controls={`${id}-${x}-panel`}
              tabIndex={tab === x ? 0 : -1}
              onClick={() => onTab(x)}
              className={`h-10 flex-1 rounded-lg text-sm font-medium ${tab === x ? 'bg-surface-raised' : 'text-muted-foreground'}`}
            >
              {t(ext.get(x)?.label ?? `panel.${x}`)}
              {x === 'people' && ` ${peers.length}`}
              {!!ext.get(x)?.badge && (
                <span className="bg-danger ml-1 inline-block min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold text-white">
                  {ext.get(x)!.badge > 9 ? '9+' : ext.get(x)!.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={t('panel.close')}
          title={t('panel.close')}
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full"
        >
          <Icon d={ICON.close} />
        </button>
      </div>
      <div
        role="tabpanel"
        id={`${id}-chat-panel`}
        aria-labelledby={`${id}-chat`}
        hidden={tab !== 'chat'}
        className="flex min-h-0 flex-1 flex-col"
      >
        <ChatTab chat={chat} visible={open && tab === 'chat'} onSend={onSend} onRetry={onRetry} />
      </div>
      {extra.map((x) => (
        <div
          key={x.id}
          role="tabpanel"
          id={`${id}-${x.id}-panel`}
          aria-labelledby={`${id}-${x.id}`}
          hidden={tab !== x.id}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        >
          {x.node}
        </div>
      ))}
      <div
        role="tabpanel"
        id={`${id}-people-panel`}
        aria-labelledby={`${id}-people`}
        hidden={tab !== 'people'}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <PeopleTab
          viewer={viewer}
          selfId={selfId}
          peers={peers}
          onPromote={onPromote}
          onDemote={onDemote}
          onLowerAll={onLowerAll}
          media={media}
          locks={locks}
          onMod={onMod}
          onMuteAll={onMuteAll}
        />
      </div>
    </aside>
  )
}

function ChatTab({
  chat,
  visible,
  onSend,
  onRetry,
}: {
  chat: ChatMsg[]
  visible: boolean
  onSend: (text: string) => void
  onRetry: (m: ChatMsg) => void
}) {
  const t = useTranslations('room')
  const [text, setText] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  // 새 메시지·탭 열기 때 맨 아래로(보이는 동안만 — 숨긴 요소는 높이가 0)
  useEffect(() => {
    const el = listRef.current
    if (visible && el) el.scrollTop = el.scrollHeight
  }, [chat.length, visible])
  const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    onSend(body)
  }

  return (
    <>
      <ol ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {chat.length === 0 && <li className="text-muted-foreground py-6 text-center">{t('chat.empty')}</li>}
        {chat.map((m, i) => {
          const prev = chat[i - 1]
          const head = !prev || prev.peerId !== m.peerId || m.ts - prev.ts >= SAME_SENDER_MS
          return (
            <li key={m.n} className={`${head ? 'pt-2' : ''} ${m.status === 'sending' ? 'opacity-60' : ''}`}>
              {head && (
                <p className="text-muted-foreground text-xs">
                  <b className="text-foreground">{m.mine ? t('chat.me') : m.name}</b> {time(m.ts)}
                </p>
              )}
              <p className="break-words whitespace-pre-wrap">{m.text}</p>
              {m.status === 'failed' && (
                <p className="text-danger flex items-center gap-2 text-xs">
                  {t('chat.failed')}
                  <button
                    type="button"
                    onClick={() => onRetry(m)}
                    className="text-foreground min-h-8 rounded-full px-2 font-semibold underline"
                  >
                    {t('chat.retry')}
                  </button>
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX}
          aria-label={t('chat.input')}
          placeholder={t('chat.input')}
          enterKeyHint="send"
          className="bg-background min-w-0 flex-1 rounded-full border border-white/15 px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="bg-accent h-10 shrink-0 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {t('chat.send')}
        </button>
      </form>
    </>
  )
}

function PeopleTab({
  viewer,
  selfId,
  peers,
  onPromote,
  onDemote,
  onLowerAll,
  media,
  locks,
  onMod,
  onMuteAll,
}: {
  viewer: SessionRole
  selfId: string
  peers: Peer[]
  onPromote: (peerId: string) => void
  onDemote: (peerId: string) => void
  onLowerAll: () => void
  media: Map<string, PeerMedia>
  locks: Locks
  onMod: (peerId: string, action: ModAction) => void
  onMuteAll: (lock: boolean) => void
}) {
  const t = useTranslations('room')
  const presenter = viewer === 'presenter'
  const raised = peers.some((p) => p.role === 'audience' && p.raisedTs > 0)
  const small = 'h-8 shrink-0 rounded-full px-3 text-xs font-semibold'
  return (
    <div className="p-2">
      {/* 방 사회(v1.2, 발표자) — 모두 끄기는 지금 잠금 상태 유지, 잠금 토글은 끄기 + 잠금/해제를 서버 한 처리로 */}
      {presenter && (
        <div className="mb-2 flex gap-2">
          <button type="button" onClick={() => onMuteAll(locks.audio)} className={`${small} bg-surface-raised flex-1`}>
            {t('mod.muteAll')}
          </button>
          <button
            type="button"
            aria-pressed={locks.audio}
            onClick={() => onMuteAll(!locks.audio)}
            className={`${small} flex-1 ${locks.audio ? 'bg-danger text-white' : 'bg-surface-raised'}`}
          >
            {t(locks.audio ? 'mod.unlock' : 'mod.lock')}
          </button>
        </div>
      )}
      {presenter && raised && (
        <button type="button" onClick={onLowerAll} className={`${small} bg-surface-raised mb-2 w-full`}>
          {t('hand.lowerAll')}
        </button>
      )}
      <ul className="space-y-1">
        {sortPeers(peers).map((p) => {
          const hand = p.role === 'audience' && p.raisedTs > 0
          return (
            <li key={p.peerId} className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg px-2 py-1">
              <span
                aria-hidden
                className="bg-surface-raised grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold uppercase"
              >
                {[...p.name][0] ?? '?'}
              </span>
              {/* 이름 최소 폭 확보 — 사회 버튼이 여러 개면 다음 줄로 내려간다(2차 QA : 버튼 3개에 이름이 0폭) */}
              <span className="min-w-24 flex-1">
                <span className="block truncate text-sm">
                  {p.peerId === selfId ? t('tile.self', { name: p.name }) : p.name}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {t(`roles.${p.role}`)}
                  {hand && ` · ${t('hand.raised')}`}
                </span>
              </span>
              {hand && <span aria-hidden>✋</span>}
              {/* 줄마다 빠른 동작 1개(설계서 14.4) — 손든 청중 [무대로], 패널 [내리기]. 권한 검사는 서버 */}
              {presenter && hand && (
                <button type="button" onClick={() => onPromote(p.peerId)} className={`${small} bg-accent text-white`}>
                  {t('stage.invite')}
                </button>
              )}
              {/* 사회 동작(v1.2) — 켜진 마이크·카메라 끄기, 꺼진 마이크 켜기 요청(본인이 탭해야 켜짐) */}
              {modActions(viewer, p, media.get(p.peerId), locks).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-label={t(`mod.${a}Of`, { name: p.name })}
                  onClick={() => onMod(p.peerId, a)}
                  className={`${small} bg-surface-raised`}
                >
                  {t(`mod.${a}`)}
                </button>
              ))}
              {presenter && p.role === 'panel' && (
                <button type="button" onClick={() => onDemote(p.peerId)} className={`${small} bg-surface-raised`}>
                  {t('stage.remove')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

'use client'
// 사이드 패널 — 채팅·참가자 탭(설계서 14.4·5.3). 닫아도 언마운트하지 않는다(쓰던 글·스크롤 유지, 안 읽은 수는 room-view 가 센다).
// 폭 <580px 이면 전체 화면, 그 이상은 룸 오른쪽 열. 채팅은 저장 안 함(엔진 중계만 — 늦게 들어오면 이전 대화 없음, 13절 #2)
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ICON, Icon, type PanelTab } from './control-bar'
import { sortPeers } from './room-rules'
import type { ChatMsg, Peer, SessionRole } from './use-room'

const CHAT_MAX = 500 // SIGNAL_API 3.3 C. maxLength 는 UTF-16 단위라 이모지는 2로 센다 → 서버(문자 수)보다 엄격, 넘칠 일 없음
const SAME_SENDER_MS = 60000 // 같은 사람이 1분 안에 이어 쓰면 이름·시각 줄 생략(설계서 14.4)

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
  onPromote,
  onDemote,
  onLowerAll,
}: {
  tab: PanelTab
  open: boolean
  viewer: SessionRole
  selfId: string
  peers: Peer[]
  chat: ChatMsg[]
  onTab: (t: PanelTab) => void
  onClose: () => void
  onSend: (text: string) => Promise<boolean> // false = 실패(입력 내용 유지)
  onPromote: (peerId: string) => void
  onDemote: (peerId: string) => void
  onLowerAll: () => void
}) {
  const t = useTranslations('room')
  const id = useId()
  const tabs: PanelTab[] = ['chat', 'people']
  return (
    <aside
      hidden={!open}
      aria-label={t('panel.title')}
      className="bg-surface fixed inset-0 z-30 flex flex-col min-[580px]:static min-[580px]:z-auto min-[580px]:h-[min(80dvh,720px)] min-[580px]:w-80 min-[580px]:shrink-0 min-[580px]:rounded-xl"
    >
      <div className="flex items-center gap-1 border-b border-white/10 p-2">
        <div role="tablist" aria-label={t('panel.title')} className="flex flex-1 gap-1">
          {tabs.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              id={`${id}-${x}`}
              aria-selected={tab === x}
              aria-controls={`${id}-${x}-panel`}
              onClick={() => onTab(x)}
              className={`h-10 flex-1 rounded-lg text-sm font-medium ${tab === x ? 'bg-surface-raised' : 'text-muted-foreground'}`}
            >
              {t(`panel.${x}`)}
              {x === 'people' && ` ${peers.length}`}
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
        <ChatTab chat={chat} visible={open && tab === 'chat'} onSend={onSend} />
      </div>
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
        />
      </div>
    </aside>
  )
}

function ChatTab({
  chat,
  visible,
  onSend,
}: {
  chat: ChatMsg[]
  visible: boolean
  onSend: (text: string) => Promise<boolean>
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    if (!(await onSend(body))) setText((cur) => cur || body) // 실패면 다시 보낼 수 있게 되돌린다(그사이 새로 쓴 글은 지키고)
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
              {m.status === 'failed' && <p className="text-danger text-xs">{t('chat.failed')}</p>}
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
}: {
  viewer: SessionRole
  selfId: string
  peers: Peer[]
  onPromote: (peerId: string) => void
  onDemote: (peerId: string) => void
  onLowerAll: () => void
}) {
  const t = useTranslations('room')
  const presenter = viewer === 'presenter'
  const raised = peers.some((p) => p.role === 'audience' && p.raisedTs > 0)
  const small = 'h-8 shrink-0 rounded-full px-3 text-xs font-semibold'
  return (
    <div className="p-2">
      {presenter && raised && (
        <button type="button" onClick={onLowerAll} className={`${small} bg-surface-raised mb-2 w-full`}>
          {t('hand.lowerAll')}
        </button>
      )}
      <ul className="space-y-1">
        {sortPeers(peers).map((p) => {
          const hand = p.role === 'audience' && p.raisedTs > 0
          return (
            <li key={p.peerId} className="flex min-h-11 items-center gap-2 rounded-lg px-2">
              <span
                aria-hidden
                className="bg-surface-raised grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold uppercase"
              >
                {[...p.name][0] ?? '?'}
              </span>
              <span className="min-w-0 flex-1">
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

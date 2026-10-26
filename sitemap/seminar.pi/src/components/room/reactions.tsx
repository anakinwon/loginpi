'use client'
// 반응 — 7종 메뉴(SIGNAL_API 3.3 C 허용 목록)와 떠오르는 반응(CSS keyframes 5s, JS 애니메이션 없음, 설계서 14.4).
// 받은 ntf reaction{counts} 를 화면 큐(최대 50개)로 — 움직임 줄이기 설정이면 떠오름을 끈다
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MENU_SURFACE, menuKeys, useMenu } from './control-bar'
import { enqueueReactions, REACT, type Floater } from './room-rules'

const TRIGGER = '[data-react-trigger]'

// 여는 버튼은 하단 바(또는 더보기) 안에 따로 있다 — 메뉴는 바 위 가운데에 띄운다. 연달아 누를 수 있게 고른 뒤에도 열어 둔다
export function ReactionMenu({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (e: string) => void
}) {
  const t = useTranslations('room')
  const m = useMenu(open, onClose, TRIGGER, '[data-more-trigger]')
  if (!open) return null
  return (
    <div ref={m.rootRef} className="relative">
      <div
        ref={m.menuRef}
        role="menu"
        aria-label={t('react.open')}
        aria-orientation="horizontal"
        onKeyDown={menuKeys}
        className={`${MENU_SURFACE} flex-row! flex-wrap justify-center sm:right-1/2! sm:translate-x-1/2`}
      >
        {REACT.emojis.map((e) => (
          <button
            key={e}
            type="button"
            role="menuitem"
            aria-label={t(`react.e${REACT.emojis.indexOf(e)}`)}
            onClick={() => onPick(e)}
            className="hover:bg-surface-raised grid size-12 place-items-center rounded-full text-2xl"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

// 떠오르는 반응 — 큐 규칙은 room-rules enqueueReactions. 애니메이션이 끝나면 빼고, 끝 이벤트가 없어도(숨김·움직임 줄이기) 다음 수신 때 5초 지난 것은 정리된다
export function Floaters({ reaction }: { reaction: { counts: Record<string, number>; seq: number } | null }) {
  const [queue, setQueue] = useState<Floater[]>([])
  const nextId = useRef(1)
  useEffect(() => {
    if (!reaction) return
    setQueue((q) => {
      const r = enqueueReactions(q, reaction.counts, Date.now(), nextId.current)
      nextId.current = r.nextId
      return r.queue
    })
  }, [reaction])
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
      {queue.map((f) => (
        <span
          key={f.id}
          className={`float-up absolute bottom-2 text-3xl lane-${f.lane}`}
          style={{ left: `${12 + f.lane * 22}%`, animationDelay: `${(f.id % 5) * 90}ms` }}
          onAnimationEnd={() => setQueue((q) => q.filter((x) => x.id !== f.id))}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  )
}

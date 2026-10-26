'use client'
// 하단 컨트롤 바 — 발표자 : 마이크·카메라·나가기, 청중 : 나가기(+ 소리 막힘 시 "소리 켜기"). 설계서 6.1·14.3
// 꺼짐 = danger 색 + 사선 아이콘(색만으로 상태를 전하지 않음), 아이콘만 보여도 aria-label 유지
import { useTranslations } from 'next-intl'
import type { MediaKind, Role } from './use-room'

export const ICON: Record<MediaKind | 'leave', string> = {
  audio: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z',
  video: 'M15 8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2.5l5 3.5V7l-5 3.5V8Z',
  leave:
    'M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.66-1.85 1 1 0 0 1-.56-.9v-3.1A15.3 15.3 0 0 0 12 9Z',
}

export function Icon({ d, off, small }: { d: string; off?: boolean; small?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={small ? 'h-4 w-4' : 'h-6 w-6'} fill="currentColor" aria-hidden>
      <path d={d} />
      {off && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}

const ROUND = 'grid h-12 w-12 place-items-center rounded-full transition-colors disabled:opacity-40'

// 마이크·카메라 토글 — 대기실 미리보기와 룸 하단 바가 같이 쓴다
export function MediaButton({
  kind,
  on,
  disabled,
  onClick,
}: {
  kind: MediaKind
  on: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const t = useTranslations('room')
  const name = kind === 'audio' ? 'mic' : 'cam'
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t(`${name}.${on ? 'on' : 'off'}`)}
      title={t(`${name}.${on ? 'on' : 'off'}`)}
      disabled={disabled}
      onClick={onClick}
      className={`${ROUND} ${on ? 'bg-surface-raised' : 'bg-danger text-white'}`}
    >
      <Icon d={ICON[kind]} off={!on} />
    </button>
  )
}

export function ControlBar({
  role,
  ready,
  has,
  localOn,
  pending,
  soundBlocked,
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
  onToggle: (kind: MediaKind, on: boolean) => void
  onSound: () => void
  onLeave: () => void
}) {
  const t = useTranslations('room')
  return (
    <nav
      aria-label={t('controls')}
      className="flex items-center justify-center gap-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      {role === 'presenter' &&
        (['audio', 'video'] as const).filter((k) => has[k]).map((k) => (
          <MediaButton
            key={k}
            kind={k}
            on={localOn[k]}
            disabled={!ready || pending !== null}
            onClick={() => onToggle(k, !localOn[k])}
          />
        ))}
      {soundBlocked && (
        <button type="button" onClick={onSound} className="bg-accent h-12 rounded-full px-4 text-sm font-semibold text-white">
          🔊 {t('enableSound')}
        </button>
      )}
      <button type="button" aria-label={t('leave')} title={t('leave')} onClick={onLeave} className={`${ROUND} bg-danger text-white`}>
        <Icon d={ICON.leave} />
      </button>
    </nav>
  )
}

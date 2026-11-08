'use client'
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import type {
  VoiceState,
  VoiceParticipant,
  MicState,
} from '@/hooks/use-voice-channel'

// PyVoice™ v3.0 — N:N 음성채널 패널 (PRD_9_VOICE_CHAT v3.0)
// 권한 정책: 방장 👑 보장 슬롯, 멤버 자동 2/승인 2.
// 방장은 PENDING 승인/거절, CONNECTED 회수, LISTEN_ONLY 직접 허용 가능.

interface VoiceChannelPanelProps {
  voiceState: VoiceState
  participants: VoiceParticipant[]
  isMuted: boolean
  micState: MicState // 본인 권한 상태
  joinError: string | null // S0 진단 — 입장 실패 사유 표시
  currentUserId: string
  canControlMic: boolean // 방장(OWNER/ADMIN) — 서버가 재검증
  onJoin: () => void
  onLeave: () => void
  onToggleMute: () => void
  onControlMic: (
    targetUsrId: string,
    action: 'approve' | 'deny' | 'revoke' | 'grant',
  ) => void
  onRequestMic: () => void
  onClose: () => void
}

// 원격 피어 1명분 오디오 출력 — srcObject는 ref로만 설정 가능.
// 패널이 아닌 채팅방 레벨에서 렌더 (패널을 닫아도 통화 오디오 유지)
//
// ⚠️ 모바일 WebView(iOS Pi Browser 등) 무음 대응:
//  1) display:none(=hidden)은 일부 WebView에서 오디오 재생 차단 → 화면 밖 1px로 숨김
//  2) autoPlay 속성만으론 autoplay 정책에 걸려 조용히 실패 → 명시적 play() + 터치 시 재개
export function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    const play = () => {
      el.play().catch(() => {
        /* autoplay 차단 — 아래 제스처 폴백으로 재개 */
      })
    }
    play()
    // 차단 시 다음 사용자 제스처(터치/클릭)에서 1회 재개
    const resume = () => play()
    document.addEventListener('touchend', resume, { once: true })
    document.addEventListener('click', resume, { once: true })
    return () => {
      document.removeEventListener('touchend', resume)
      document.removeEventListener('click', resume)
    }
  }, [stream])
  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={{
        position: 'fixed',
        left: -9999,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

// 참여자 상태 아이콘 (라벨은 컴포넌트에서 i18n)
const MIC_ST_ICON: Record<MicState, string> = {
  CONNECTED: '🎙️',
  PENDING: '⏳',
  LISTEN_ONLY: '🔇',
}

export function VoiceChannelPanel({
  voiceState,
  participants,
  isMuted,
  micState,
  joinError,
  currentUserId,
  canControlMic,
  onJoin,
  onLeave,
  onToggleMute,
  onControlMic,
  onRequestMic,
  onClose,
}: VoiceChannelPanelProps) {
  const t = useTranslations('chat')
  const tc = useTranslations('common')
  const joined = voiceState === 'joined'
  const canSpeak = micState === 'CONNECTED'
  const micStLabel: Record<MicState, string | null> = {
    CONNECTED: null,
    PENDING: t('voice.pending'),
    LISTEN_ONLY: t('voice.listenOnly'),
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-end justify-center p-4 sm:bottom-4">
      <div className="bg-background/95 w-full max-w-sm rounded-2xl border p-5 shadow-xl backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">
            {t('voice.title', { count: participants.length })}
          </p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label={tc('close')}
          >
            ✕
          </button>
        </div>

        {/* 참여자 목록 — 권한 상태 + 방장 제어 */}
        {participants.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            {t('voice.emptyChannel')}
          </p>
        ) : (
          <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto">
            {participants.map((p) => {
              const isMe = p.usr_id === currentUserId
              const st =
                p.mic_st_cd ?? (p.mic_yn === 'Y' ? 'CONNECTED' : 'LISTEN_ONLY')
              const stLabel = micStLabel[st]
              return (
                <li
                  key={p.usr_id}
                  className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{MIC_ST_ICON[st]}</span>
                    <span className="truncate">
                      {p.owner_yn === 'Y' && <span className="mr-0.5">👑</span>}
                      {p.display_nm}
                      {isMe && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          {t('voice.me')}
                        </span>
                      )}
                    </span>
                  </span>
                  {stLabel && (
                    <span className="text-muted-foreground shrink-0 text-[10px]">
                      {stLabel}
                    </span>
                  )}
                  {/* 방장 권한 제어 — 본인·다른 방장 제외 */}
                  {canControlMic && !isMe && joined && p.owner_yn !== 'Y' && (
                    <span className="flex shrink-0 gap-1">
                      {st === 'PENDING' && (
                        <>
                          <button
                            onClick={() => onControlMic(p.usr_id, 'approve')}
                            className="rounded-md bg-green-500/15 px-2 py-0.5 text-[10px] text-green-700 transition-colors hover:bg-green-500/25 dark:text-green-400"
                            title={t('voice.approveOwner')}
                          >
                            {t('voice.approve')}
                          </button>
                          <button
                            onClick={() => onControlMic(p.usr_id, 'deny')}
                            className="bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md px-2 py-0.5 text-[10px] transition-colors"
                            title={t('voice.denyOwner')}
                          >
                            {t('voice.deny')}
                          </button>
                        </>
                      )}
                      {st === 'CONNECTED' && (
                        <button
                          onClick={() => onControlMic(p.usr_id, 'revoke')}
                          className="bg-muted hover:bg-muted/70 rounded-md px-2 py-0.5 text-[10px] transition-colors"
                          title={t('voice.revokeOwner')}
                        >
                          {t('voice.revoke')}
                        </button>
                      )}
                      {st === 'LISTEN_ONLY' && (
                        <button
                          onClick={() => onControlMic(p.usr_id, 'grant')}
                          className="bg-muted hover:bg-muted/70 rounded-md px-2 py-0.5 text-[10px] transition-colors"
                          title={t('voice.grantOwner')}
                        >
                          {t('voice.grant')}
                        </button>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* S0 진단 — 입장·제어 실패 사유 */}
        {joinError && (
          <p className="bg-destructive/10 text-destructive mb-2 rounded-lg px-3 py-1.5 text-xs">
            ⚠️ {joinError}
          </p>
        )}

        {/* 본인 권한 상태 안내 */}
        {joined && micState === 'PENDING' && (
          <p className="mb-2 rounded-lg bg-blue-500/10 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-400">
            {t('voice.waitingApproval')}
          </p>
        )}
        {joined && micState === 'LISTEN_ONLY' && (
          <p className="mb-2 rounded-lg bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-700 dark:text-yellow-400">
            {t('voice.listenOnlyHint')}
          </p>
        )}

        {/* 액션 버튼 */}
        <div className="flex items-center justify-center gap-4">
          {!joined ? (
            <button
              onClick={onJoin}
              disabled={voiceState === 'joining'}
              className="flex h-12 items-center gap-2 rounded-full bg-green-500 px-6 text-sm font-semibold text-white shadow-md transition-opacity disabled:opacity-50"
            >
              🎙️{' '}
              {voiceState === 'joining'
                ? t('voice.connecting')
                : t('voice.join')}
            </button>
          ) : (
            <>
              {/* 청취 전용 → 발언 신청 (R4) */}
              {micState === 'LISTEN_ONLY' && (
                <button
                  onClick={onRequestMic}
                  className="flex h-12 items-center gap-1 rounded-full bg-blue-500 px-5 text-sm font-semibold text-white shadow"
                  title={t('voice.requestHint')}
                >
                  {t('voice.requestSpeak')}
                </button>
              )}
              <button
                onClick={onToggleMute}
                disabled={!canSpeak}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow disabled:opacity-40 ${
                  isMuted
                    ? 'bg-yellow-400 text-white'
                    : 'bg-muted text-foreground'
                }`}
                aria-label={isMuted ? t('voice.unmute') : t('voice.mute')}
                title={
                  canSpeak
                    ? isMuted
                      ? t('voice.unmute')
                      : t('voice.mute')
                    : t('voice.noSpeakPermission')
                }
              >
                {isMuted || !canSpeak ? '🔇' : '🎙️'}
              </button>
              <button
                onClick={onLeave}
                className="bg-destructive flex h-12 w-12 items-center justify-center rounded-full text-xl text-white shadow"
                aria-label={t('voice.leave')}
                title={t('voice.leaveChannel')}
              >
                📵
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

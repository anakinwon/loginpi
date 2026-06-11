'use client'
import { useEffect, useRef } from 'react'
import type { VoiceState, VoiceParticipant } from '@/hooks/use-voice-channel'

// PiVoice™ v2.0 — N:N 음성채널 패널 (PRD_9_VOICE_CHAT v2.0)
// 참여자 목록 + 마이크 상태, 본인 음소거, 방장(OWNER/ADMIN) 원격 마이크 제어.

interface VoiceChannelPanelProps {
  voiceState: VoiceState
  participants: VoiceParticipant[]
  isMuted: boolean
  micAllowed: boolean
  currentUserId: string
  canControlMic: boolean // 방장(OWNER/ADMIN) — 서버가 재검증
  onJoin: () => void
  onLeave: () => void
  onToggleMute: () => void
  onControlMic: (targetUsrId: string, action: 'mute' | 'unmute') => void
  onClose: () => void
}

// 원격 피어 1명분 오디오 출력 — srcObject는 ref로만 설정 가능.
// 패널이 아닌 채팅방 레벨에서 렌더 (패널을 닫아도 통화 오디오 유지)
export function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <audio ref={ref} autoPlay playsInline className="hidden" />
}

export function VoiceChannelPanel({
  voiceState,
  participants,
  isMuted,
  micAllowed,
  currentUserId,
  canControlMic,
  onJoin,
  onLeave,
  onToggleMute,
  onControlMic,
  onClose,
}: VoiceChannelPanelProps) {
  const joined = voiceState === 'joined'

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex items-end justify-center p-4 sm:bottom-4">
      <div className="bg-background/95 w-full max-w-sm rounded-2xl border p-5 shadow-xl backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">
            🎙️ 음성채널 ({participants.length}명)
          </p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 참여자 목록 — 마이크 상태 + 방장 원격 제어 */}
        {participants.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">
            아직 아무도 없습니다. 먼저 입장해서 기다릴 수 있어요.
          </p>
        ) : (
          <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto">
            {participants.map((p) => {
              const isMe = p.usr_id === currentUserId
              const micOn = p.mic_yn === 'Y'
              return (
                <li
                  key={p.usr_id}
                  className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0">{micOn ? '🎙️' : '🔇'}</span>
                    <span className="truncate">
                      {p.display_nm}
                      {isMe && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          (나)
                        </span>
                      )}
                    </span>
                  </span>
                  {!micOn && (
                    <span className="text-muted-foreground shrink-0 text-[10px]">
                      청취 전용
                    </span>
                  )}
                  {/* 방장 원격 마이크 제어 — 본인 제외 */}
                  {canControlMic && !isMe && joined && (
                    <button
                      onClick={() =>
                        onControlMic(p.usr_id, micOn ? 'mute' : 'unmute')
                      }
                      className="bg-muted hover:bg-muted/70 shrink-0 rounded-md px-2 py-0.5 text-[10px] transition-colors"
                      title={
                        micOn ? '마이크 끄기 (방장)' : '마이크 허용 (방장)'
                      }
                    >
                      {micOn ? '마이크 차단' : '마이크 허용'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* 방장 강제 mute 안내 */}
        {joined && !micAllowed && (
          <p className="mb-2 rounded-lg bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-700 dark:text-yellow-400">
            🔇 마이크가 제한되었습니다 (방장 제어 또는 동시 4명 초과). 청취만
            가능합니다.
          </p>
        )}

        {/* 액션 버튼 */}
        <div className="flex justify-center gap-4">
          {!joined ? (
            <button
              onClick={onJoin}
              disabled={voiceState === 'joining'}
              className="flex h-12 items-center gap-2 rounded-full bg-green-500 px-6 text-sm font-semibold text-white shadow-md transition-opacity disabled:opacity-50"
            >
              🎙️ {voiceState === 'joining' ? '연결 중…' : '입장하기'}
            </button>
          ) : (
            <>
              <button
                onClick={onToggleMute}
                disabled={!micAllowed}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow disabled:opacity-40 ${
                  isMuted
                    ? 'bg-yellow-400 text-white'
                    : 'bg-muted text-foreground'
                }`}
                aria-label={isMuted ? '음소거 해제' : '음소거'}
                title={
                  micAllowed
                    ? isMuted
                      ? '음소거 해제'
                      : '음소거'
                    : '마이크 제한됨'
                }
              >
                {isMuted || !micAllowed ? '🔇' : '🎙️'}
              </button>
              <button
                onClick={onLeave}
                className="bg-destructive flex h-12 w-12 items-center justify-center rounded-full text-xl text-white shadow"
                aria-label="나가기"
                title="음성채널 나가기"
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

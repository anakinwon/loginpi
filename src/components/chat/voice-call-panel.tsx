'use client'
import { useEffect, useRef } from 'react'
import type { CallState, IncomingCall } from '@/hooks/use-webrtc-call'

interface VoiceCallPanelProps {
  callState: CallState
  incomingCall: IncomingCall | null
  remoteStream: MediaStream | null
  isMuted: boolean
  calleeName?: string
  onAnswer: () => void
  onReject: () => void
  onHangup: () => void
  onToggleMute: () => void
}

export function VoiceCallPanel({
  callState,
  incomingCall,
  remoteStream,
  isMuted,
  calleeName,
  onAnswer,
  onReject,
  onHangup,
  onToggleMute,
}: VoiceCallPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (audioRef.current && remoteStream) {
      audioRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  if (callState === 'idle' || callState === 'ended') return null

  return (
    <div className='fixed inset-x-0 bottom-0 z-50 flex items-end justify-center p-4 sm:bottom-4'>
      <div className='w-full max-w-sm rounded-2xl border bg-background/95 p-5 shadow-xl backdrop-blur-sm'>
        {/* 수신 중 */}
        {callState === 'ringing_in' && incomingCall && (
          <div className='flex flex-col items-center gap-4'>
            <div className='flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl'>
              📞
            </div>
            <div className='text-center'>
              <p className='font-semibold'>{incomingCall.caller_nm}</p>
              <p className='text-sm text-muted-foreground'>음성 통화 요청</p>
            </div>
            <div className='flex gap-6'>
              <button
                onClick={onReject}
                className='flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white text-2xl shadow-md'
                aria-label='거절'
              >
                📵
              </button>
              <button
                onClick={onAnswer}
                className='flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white text-2xl shadow-md'
                aria-label='수신'
              >
                📞
              </button>
            </div>
          </div>
        )}

        {/* 발신 중 */}
        {callState === 'ringing_out' && (
          <div className='flex flex-col items-center gap-4'>
            <div className='flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-primary/10 text-3xl'>
              📞
            </div>
            <div className='text-center'>
              <p className='font-semibold'>{calleeName ?? '통화 중…'}</p>
              <p className='text-sm text-muted-foreground'>연결 중…</p>
            </div>
            <button
              onClick={onHangup}
              className='flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-white text-2xl shadow-md'
              aria-label='취소'
            >
              📵
            </button>
          </div>
        )}

        {/* 통화 중 */}
        {callState === 'connected' && (
          <div className='flex flex-col items-center gap-4'>
            <div className='flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-3xl'>
              🎙️
            </div>
            <p className='font-semibold'>{calleeName ?? '통화 중'}</p>
            <div className='flex gap-4'>
              <button
                onClick={onToggleMute}
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl shadow ${
                  isMuted ? 'bg-yellow-400 text-white' : 'bg-muted text-foreground'
                }`}
                aria-label={isMuted ? '음소거 해제' : '음소거'}
              >
                {isMuted ? '🔇' : '🎙️'}
              </button>
              <button
                onClick={onHangup}
                className='flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-white text-xl shadow'
                aria-label='종료'
              >
                📵
              </button>
            </div>
          </div>
        )}

        {/* 오디오 출력 (화면 미표시) */}
        <audio ref={audioRef} autoPlay playsInline className='hidden' />
      </div>
    </div>
  )
}

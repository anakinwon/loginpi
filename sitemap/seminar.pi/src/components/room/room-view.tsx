'use client'
// 세미나 룸 화면 — 로그인 게이트 → 대기실(S3) → 룸(S4)을 한 페이지 상태 전환으로 잇는다(설계서 5절 :
// 대기실 카메라 스트림과 [입장] 탭 제스처를 그대로 룸에 넘겨야 Pi Browser 자동재생이 막히지 않는다). 서버 redirect 없음
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LoginGate } from '@/components/login-gate'
import { ControlBar } from './control-bar'
import { Prejoin } from './prejoin'
import { Stage, useRemoteAudio } from './stage'
import { useRoom, type Role } from './use-room'

export function RoomView({ room, wsUrl }: { room: string; wsUrl?: string }) {
  const t = useTranslations('room')
  if (!wsUrl) return <p className="text-muted-foreground text-sm">{t('noEngine')}</p>
  return (
    <LoginGate>
      {(user) => (
        <Room
          room={room}
          wsUrl={wsUrl}
          name={user.displayName || user.username || ''}
          // 발표 선택지 노출용 힌트일 뿐 — 실제 발표 권한은 입장권 API(isAdmin)가 서버에서 판정(13절 #8 : 지금은 관리자만)
          canPresent={user.role === 'ADMIN' || user.role === 'MASTER'}
        />
      )}
    </LoginGate>
  )
}

function Room({ room, wsUrl, name, canPresent }: { room: string; wsUrl: string; name: string; canPresent: boolean }) {
  const t = useTranslations('room')
  const r = useRoom({ wsUrl })
  const audioRef = useRef<HTMLAudioElement>(null)
  const [role, setRole] = useState<Role>(canPresent ? 'presenter' : 'audience')
  const sound = useRemoteAudio(audioRef, r.remoteStream)

  function onJoin(local: MediaStream | null) {
    // [입장] 탭 안에서 소리 요소를 먼저 재생해 자동재생 허용을 받아 둔다(설계서 14.5). iOS 실기기 확인 전 [확인중 : 마스터 실기기]
    const el = audioRef.current
    if (el) {
      if (!el.srcObject) el.srcObject = new MediaStream()
      el.play().catch(() => {})
    }
    void r.join(room, role, local)
  }

  const ended = r.state === 'error' || r.state === 'closed'
  const stageRole: Role = r.forbidden ? 'audience' : role
  const errKey = `err.${r.error ?? 'CLOSED'}`
  return (
    <div className="space-y-3">
      <audio ref={audioRef} autoPlay />
      {r.state === 'idle' ? (
        <Prejoin room={room} name={name} canPresent={canPresent} role={role} onRole={setRole} onJoin={onJoin} />
      ) : ended ? (
        <section className="bg-surface mx-auto max-w-md space-y-3 rounded-xl p-5 text-center" role="alert">
          <p>{t.has(errKey) ? t(errKey) : t('err.generic')}</p>
          <button type="button" onClick={r.leave} className="bg-accent h-11 rounded-full px-5 font-semibold text-white">
            {t('rejoin')}
          </button>
        </section>
      ) : (
        <>
          <Stage
            role={stageRole}
            state={r.state}
            local={r.localStream}
            remote={r.remoteStream}
            localOn={r.localOn}
            remotePaused={r.remotePaused}
          />
          <ControlBar
            role={stageRole}
            ready={r.state === 'joined'}
            has={{
              audio: !!r.localStream?.getAudioTracks().length,
              video: !!r.localStream?.getVideoTracks().length,
            }}
            localOn={r.localOn}
            pending={r.pending}
            soundBlocked={sound.blocked}
            onToggle={(k, on) => void r.setMedia(k, on)}
            onSound={() => void sound.enable()}
            onLeave={r.leave}
          />
        </>
      )}
    </div>
  )
}

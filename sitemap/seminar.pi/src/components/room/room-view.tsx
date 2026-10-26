'use client'
// 세미나 룸 화면 — 로그인 게이트 → 대기실(S3) → 룸(S4)을 한 페이지 상태 전환으로 잇는다(설계서 5절 :
// 대기실 카메라 스트림과 [입장] 탭 제스처를 그대로 룸에 넘겨야 Pi Browser 자동재생이 막히지 않는다). 서버 redirect 없음
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LoginGate } from '@/components/login-gate'
import { ControlBar } from './control-bar'
import { Prejoin } from './prejoin'
import { Stage, useRemoteAudio } from './stage'
import { useRoom, type MediaKind, type Role } from './use-room'

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

// 화면 알림 유지 시간 — 설계서 14.4 알림 지속 5단계 중 5s
const NOTICE_MS = 5000

function Room({ room, wsUrl, name, canPresent }: { room: string; wsUrl: string; name: string; canPresent: boolean }) {
  const t = useTranslations('room')
  const r = useRoom({ wsUrl })
  const audioRef = useRef<HTMLAudioElement>(null)
  const [role, setRole] = useState<Role>(canPresent ? 'presenter' : 'audience')
  const sound = useRemoteAudio(audioRef, r.remoteAudio)
  // 화면 안 알림(alert() 금지, 설계서 14.5) — 값은 room.notice.* 키
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // 발표 거부(ROLE_FORBIDDEN) — 청중으로 계속한다는 사실을 알린다(설계서 7.3)
  useEffect(() => {
    if (r.forbidden) setNotice('forbidden')
  }, [r.forbidden])

  async function toggle(kind: MediaKind, on: boolean) {
    if (!(await r.setMedia(kind, on))) setNotice(`toggleFailed.${kind}`)
  }

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
      {/* 알림 영역은 항상 붙여 둔다 — 내용이 바뀔 때 화면 낭독기가 읽게(오류성 알림이라 assertive) */}
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
        {notice && (
          <p className="bg-surface-raised rounded-lg px-4 py-2 text-sm shadow-lg">{t(`notice.${notice}`)}</p>
        )}
      </div>
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
            remoteVideo={r.remoteVideo}
            remoteAudio={r.remoteAudio}
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
            onToggle={(k, on) => void toggle(k, on)}
            onSound={() => void sound.enable()}
            onLeave={r.leave}
          />
        </>
      )}
    </div>
  )
}

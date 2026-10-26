'use client'
// 세미나 룸 화면 — 로그인 게이트 → 대기실(S3) → 룸(S4)을 한 페이지 상태 전환으로 잇는다(설계서 5절 :
// 대기실 카메라 스트림과 [입장] 탭 제스처를 그대로 룸에 넘겨야 Pi Browser 자동재생이 막히지 않는다). 서버 redirect 없음
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { LoginGate } from '@/components/login-gate'
import { Link } from '@/i18n/navigation'
import { ConnectionBadge, useConnectionCheck } from './connection-check'
import { ControlBar, useBarVisibility } from './control-bar'
import { Prejoin } from './prejoin'
import { Spinner, Stage, useRemoteAudio } from './stage'
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

// 오류 코드별 다음 행동(설계서 7.3) — 정원·종료 = 홈으로(상세 S2 는 M5 전이라 홈), 중복 세션 = 안내 + 홈으로(다시 입장하면 다른 기기를
// 끊으므로 다시 입장 버튼은 두지 않는다 — 빠져나갈 길은 홈 링크), 그 밖 = 다시 입장(대기실 → 입장권 재발급)
const HOME_CODES = new Set(['ROOM_FULL', 'ROOM_CLOSED', 'DUPLICATE_SESSION'])

// 끊김·오류 전체 화면(설계서 6.3) — 무대·하단 바를 덮는다
function Ended({ code, onRejoin }: { code: string; onRejoin: () => void }) {
  const t = useTranslations('room')
  const key = `err.${code}`
  const btn = 'bg-accent inline-grid h-11 place-items-center rounded-full px-5 font-semibold text-white'
  return (
    <section role="alert" className="bg-background fixed inset-0 z-40 grid place-items-center p-4">
      <div className="bg-surface w-full max-w-md space-y-4 rounded-xl p-6 text-center">
        <p>{t.has(key) ? t(key) : t('err.generic')}</p>
        {HOME_CODES.has(code) ? (
          <Link href="/" className={btn}>
            {t('home')}
          </Link>
        ) : (
          <button type="button" onClick={onRejoin} className={btn}>
            {t('rejoin')}
          </button>
        )}
      </div>
    </section>
  )
}

// 화면 알림 유지 시간 — 설계서 14.4 알림 지속 5단계 중 5s
const NOTICE_MS = 5000

// 요소 폭(px) 추적 — 하단 바 슬롯 수·라벨 판정(창이 아니라 룸 영역 기준 — W3 사이드 패널이 열리면 좁아진다)
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function Room({ room, wsUrl, name, canPresent }: { room: string; wsUrl: string; name: string; canPresent: boolean }) {
  const t = useTranslations('room')
  const r = useRoom({ wsUrl })
  const audioRef = useRef<HTMLAudioElement>(null)
  const [role, setRole] = useState<Role>(canPresent ? 'presenter' : 'audience')
  const sound = useRemoteAudio(audioRef, r.remoteAudio)
  // 화면 안 알림(alert() 금지, 설계서 14.5) — 값은 room.notice.* 키
  const [notice, setNotice] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const width = useWidth(rootRef)
  const live = r.state === 'joined' || r.state === 'reconnecting'
  const bar = useBarVisibility(live)
  const stageRole: Role = r.forbidden ? 'audience' : role
  // 발표자 연결 점검 — 발행 중일 때만(입장 직후 1회, 재연결 뒤 다시)
  const publishing = stageRole === 'presenter' && r.state === 'joined' && !!r.localStream
  const check = useConnectionCheck(r.pubStats, publishing, r.localOn)

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
  return (
    <div ref={rootRef} className="space-y-3">
      <audio ref={audioRef} autoPlay />
      {/* 알림 영역은 항상 붙여 둔다 — 내용이 바뀔 때 화면 낭독기가 읽게(오류성 알림이라 assertive) */}
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
        {notice && <p className="bg-surface-raised rounded-lg px-4 py-2 text-sm shadow-lg">{t(`notice.${notice}`)}</p>}
      </div>
      {r.state === 'idle' ? (
        <Prejoin room={room} name={name} canPresent={canPresent} role={role} onRole={setRole} onJoin={onJoin} />
      ) : ended ? (
        <Ended code={r.error ?? 'CLOSED'} onRejoin={r.leave} />
      ) : (
        // 룸 — 세로 : 무대 위·바 아래, 낮은 가로 화면(휴대폰 회전) : 바를 오른쪽 세로로(설계서 6.2). W3 사이드 패널은 이 줄의 오른쪽에 붙는다
        <div {...bar.area} className="landscape-short:flex-row flex flex-col gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            {/* 상단 정보 줄 — 재연결 배지(설계서 6.3). 인원 수·연결 품질은 같은 줄에 붙는다 */}
            <div className="flex min-h-7 items-center gap-2 text-xs">
              {/* status 영역은 늘 붙여 두고 안의 내용만 바꾼다 — 붙는 순간의 영역은 화면 낭독기가 놓친다 */}
              <span role="status">
                {r.state === 'reconnecting' && (
                  <span className="bg-surface-raised inline-flex items-center gap-2 rounded-full px-3 py-1">
                    <Spinner />
                    {t('state.reconnecting')}
                  </span>
                )}
              </span>
              <ConnectionBadge check={check} />
            </div>
            <Stage
              role={stageRole}
              state={r.state}
              name={name}
              local={r.localStream}
              remoteVideo={r.remoteVideo}
              remoteAudio={r.remoteAudio}
              localOn={r.localOn}
              remotePaused={r.remotePaused}
            />
          </div>
          {/* 자동 숨김 — 200ms 페이드(reduced-motion 이면 즉시), 숨겨도 자리는 유지해 무대가 출렁이지 않게 */}
          <div
            {...bar.bar}
            className={`transition-opacity duration-200 motion-reduce:transition-none ${bar.shown ? '' : 'pointer-events-none opacity-0'}`}
          >
            <ControlBar
              role={stageRole}
              ready={r.state === 'joined' && r.published}
              has={{
                audio: !!r.localStream?.getAudioTracks().length,
                video: !!r.localStream?.getVideoTracks().length,
              }}
              localOn={r.localOn}
              pending={r.pending}
              soundBlocked={sound.blocked}
              onToggle={(k, on) => void toggle(k, on)}
              onSound={() => void sound.enable()}
              width={width}
              onHold={bar.onMenu}
              onLeave={r.leave}
            />
          </div>
        </div>
      )}
    </div>
  )
}

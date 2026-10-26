'use client'
// 세미나 룸 화면 — 로그인 게이트 → 대기실(S3) → 룸(S4)을 한 페이지 상태 전환으로 잇는다(설계서 5절 :
// 대기실 카메라 스트림과 [입장] 탭 제스처를 그대로 룸에 넘겨야 Pi Browser 자동재생이 막히지 않는다). 서버 redirect 없음
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LoginGate } from '@/components/login-gate'
import { Link } from '@/i18n/navigation'
import { ConnectionBadge, useConnectionCheck } from './connection-check'
import { ControlBar, ICON, Icon, QualityMenu, useBarVisibility, type PanelTab } from './control-bar'
import { Prejoin } from './prejoin'
import { Floaters, ReactionMenu } from './reactions'
import { handKey, handNotice, isBadGrade, nextToast, TOAST, type Grade, type ToastState } from './room-rules'
import { SidePanel } from './side-panel'
import { Spinner, Stage, useRemoteAudio } from './stage'
import { useRoom, type MediaKind, type Role, type SessionRole } from './use-room'

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

// 요소 폭(px) 추적 — 하단 바 슬롯 수·라벨 판정(창이 아니라 무대 열 기준 — 사이드 패널이 열리면 좁아진다).
// 콜백 ref(요소가 입장 뒤에 생기므로 처음 렌더의 ref 로는 못 잡는다)
function useWidth() {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w] as const
}

// 화면공유 버튼 기능 탐지(설계서 6.1·P5) — getDisplayMedia 가 있을 때만. UA 로 판정하지 않는다. 서버 렌더 때는 false
function useCanShare() {
  const [ok, setOk] = useState(false)
  useEffect(() => setOk(typeof navigator.mediaDevices?.getDisplayMedia === 'function'), [])
  return ok
}

// 수신 품질 알림(설계서 14.1·6.3, ntf score) — 나쁠 때(poor·lost)만 보이고 회복 5초 뒤 숨긴다. 낭독은 polite(영역은 늘 붙여 둠)
function QualityToast({ grade }: { grade: Grade }) {
  const t = useTranslations('room')
  const bad = isBadGrade(grade)
  const [st, setSt] = useState<ToastState>({ shown: false, okAt: 0 })
  useEffect(() => {
    setSt((s) => nextToast(s, bad, Date.now()))
    if (bad) return
    // 여유 50ms — 타이머가 1ms 일찍 깨도 숨김
    const timer = setTimeout(() => setSt((s) => nextToast(s, false, Date.now())), TOAST.hideMs + 50)
    return () => clearTimeout(timer)
  }, [bad])
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4">
      {st.shown && (
        <p className="bg-surface-raised text-warning flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg">
          <Icon d={ICON.warn} small />
          <span className="text-foreground">{t('quality.unstable')}</span>
        </p>
      )}
    </div>
  )
}

// 화면 알림 문구 키 — 오류 코드가 있으면 그 문구, 없으면 일반 실패 문구
const ERR_NOTICE = new Set(['RATE_LIMITED', 'ROLE_FORBIDDEN', 'MEDIA_FAILED'])

function Room({ room, wsUrl, name, canPresent }: { room: string; wsUrl: string; name: string; canPresent: boolean }) {
  const t = useTranslations('room')
  const r = useRoom({ wsUrl })
  const audioRef = useRef<HTMLAudioElement>(null)
  const [ticketRole, setTicketRole] = useState<Role>(canPresent ? 'presenter' : 'audience')
  const sound = useRemoteAudio(audioRef, r.remoteAudio)
  // 화면 안 알림(alert() 금지, 설계서 14.5) — 값은 room.notice.* 키(+ 변수)
  const [notice, setNotice] = useState<{ key: string; v?: Record<string, string> } | null>(null)
  // 새 채팅·손들기 낭독(aria-live polite, 설계서 10절) — 오류 알림(assertive)과 분리
  const [announce, setAnnounce] = useState('')
  const [setStageEl, width] = useWidth()
  const canShare = useCanShare()
  const live = r.state === 'joined' || r.state === 'reconnecting'
  const bar = useBarVisibility(live)
  // 세션 역할이 정본(SIGNAL_API 6절) — 입장 응답 전엔 요청한 역할, 발행 거부면 청중
  const role: SessionRole = r.forbidden ? 'audience' : (r.role ?? ticketRole)
  const has = { audio: !!r.localStream?.getAudioTracks().length, video: !!r.localStream?.getVideoTracks().length }
  // 발표자 연결 점검 — 발행 중일 때만(입장 직후 1회, 재연결 뒤 다시)
  const publishing = role === 'presenter' && r.state === 'joined' && r.published
  const check = useConnectionCheck(r.pubStats, publishing, r.localOn)
  const [panel, setPanel] = useState<PanelTab | null>(null)
  const [tab, setTab] = useState<PanelTab>('chat')
  const [reactOpen, setReactOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)
  // 화질 메뉴는 청중 전용 — 역할이 바뀌면 열린 메뉴를 닫는다
  useEffect(() => {
    if (r.role && r.role !== 'audience') setQualityOpen(false)
  }, [r.role])
  const [seenN, setSeenN] = useState(0)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [promoHidden, setPromoHidden] = useState(false)
  const leaveRef = useRef<HTMLDialogElement>(null)
  const [leaveStep, setLeaveStep] = useState<'choose' | 'confirm'>('choose')
  const me = r.peers.find((p) => p.peerId === r.selfId)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  const say = (key: string, v?: Record<string, string>) => setNotice({ key, v })
  const sayErr = (code: string | null, fallback: string) => {
    if (code) say(ERR_NOTICE.has(code) ? `err.${code}` : fallback)
  }

  // 발표 거부(ROLE_FORBIDDEN) — 청중으로 계속한다는 사실을 알린다(설계서 7.3)
  useEffect(() => {
    if (r.forbidden) say('forbidden')
  }, [r.forbidden])

  // 역할 변경 알림 — 승격은 고정 알림(아래 promo), 강등은 5초 알림. 입장 직후 첫 역할은 알리지 않는다
  const prevRole = useRef<SessionRole | null>(null)
  useEffect(() => {
    const prev = prevRole.current
    prevRole.current = r.role
    if (!prev || !r.role || prev === r.role) return
    if (r.role === 'audience') say('demoted')
    setPromoHidden(false)
  }, [r.role])

  // 안 읽은 채팅 — 채팅 탭이 보이는 동안은 다 읽은 것
  const lastN = r.chat.at(-1)?.n ?? 0
  const chatVisible = panel === 'chat'
  useEffect(() => {
    if (chatVisible) setSeenN(lastN)
  }, [chatVisible, lastN])
  const unread = chatVisible ? 0 : r.chat.filter((m) => !m.mine && m.n > seenN).length

  // 낭독 — 새 채팅(남의 것)·새로 든 손
  const lastMsg = r.chat.at(-1)
  useEffect(() => {
    if (lastMsg && !lastMsg.mine) setAnnounce(t('announce.chat', { name: lastMsg.name, text: lastMsg.text }))
  }, [lastMsg?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  const raisedKey = r.peers
    .filter((p) => p.role === 'audience' && p.raisedTs > 0 && p.peerId !== r.selfId)
    .map(handKey)
    .join(',')
  const prevRaised = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set(raisedKey ? raisedKey.split(',') : [])
    const fresh = r.peers.find((p) => now.has(handKey(p)) && !prevRaised.current.has(handKey(p)))
    prevRaised.current = now
    if (fresh) setAnnounce(t('announce.hand', { name: fresh.name }))
  }, [raisedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const raisedCount = raisedKey ? raisedKey.split(',').length : 0

  // 화면을 떠나는 관리 대화상자·메뉴는 퇴장·끊김 때 닫는다
  useEffect(() => {
    if (live) return
    setPanel(null)
    setReactOpen(false)
    setQualityOpen(false)
    setDismissed(new Set())
    leaveRef.current?.close()
  }, [live])

  async function toggle(kind: MediaKind, on: boolean) {
    // 아직 없는 마이크·카메라(승격된 panel·카메라 없이 들어온 발표자) = 이 탭으로 켜서 발행. 자동으로 켜지 않는다(설계서 14.4)
    if (!has[kind]) return sayErr(await r.addMedia(kind), `toggleFailed.${kind}`)
    if (!(await r.setMedia(kind, on))) say(`toggleFailed.${kind}`)
  }

  function openPanel(next: PanelTab) {
    setTab(next)
    setPanel((p) => (p === next ? null : next))
  }

  function onJoin(local: MediaStream | null) {
    // [입장] 탭 안에서 소리 요소를 먼저 재생해 자동재생 허용을 받아 둔다(설계서 14.5). iOS 실기기 확인 전 [확인중 : 마스터 실기기]
    const el = audioRef.current
    if (el) {
      if (!el.srcObject) el.srcObject = new MediaStream()
      el.play().catch(() => {})
    }
    void r.join(room, ticketRole, local)
  }

  function onLeave() {
    // 발표자는 [나가기]/[세미나 종료] 선택(설계서 6.1, 13절 #6). 대화상자는 기본 <dialog>(포커스 가두기·Esc 닫기 내장)
    if (role !== 'presenter') return r.leave()
    setLeaveStep('choose')
    leaveRef.current?.showModal()
  }

  async function endSeminar() {
    leaveRef.current?.close()
    // 성공하면 서버가 전원(나 포함)에게 ntf error ROOM_CLOSED → 종료 화면
    sayErr(await r.end(), 'endFailed')
  }

  const hands = role === 'presenter' ? handNotice(r.peers, dismissed) : ({ kind: 'none' } as const)
  const promo = role === 'panel' && !has.audio && !promoHidden && r.state === 'joined'
  const ended = r.state === 'error' || r.state === 'closed'
  const btnS = 'h-9 shrink-0 rounded-full px-4 text-sm font-semibold'
  return (
    <div className="space-y-3">
      <audio ref={audioRef} autoPlay />
      {/* 알림 영역은 항상 붙여 두고 내용만 바꾼다 — 오류성 알림은 assertive, 채팅·손들기 낭독은 polite */}
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
        {notice && (
          <p className="bg-surface-raised rounded-lg px-4 py-2 text-sm shadow-lg">
            {t(`notice.${notice.key}`, notice.v)}
          </p>
        )}
      </div>
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
      <QualityToast grade={live ? r.quality : 'excellent'} />
      {r.state === 'idle' ? (
        <Prejoin
          room={room}
          name={name}
          canPresent={canPresent}
          role={ticketRole}
          onRole={setTicketRole}
          onJoin={onJoin}
        />
      ) : ended ? (
        <Ended code={r.error ?? 'CLOSED'} onRejoin={r.leave} />
      ) : (
        <div className="flex gap-3">
          {/* 무대 열 — 세로 : 무대 위·바 아래, 낮은 가로 화면(휴대폰 회전) : 바를 오른쪽 세로로(설계서 6.2) */}
          <div ref={setStageEl} {...bar.area} className="landscape-short:flex-row flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-w-0 flex-1 space-y-2">
              {/* 상단 정보 줄 — 인원 수·재연결 배지(설계서 5.2·6.3)·연결 점검 */}
              <div className="flex min-h-7 flex-wrap items-center gap-2 text-xs">
                {r.peers.length > 0 && (
                  <span className="text-muted-foreground">{t('people', { n: r.peers.length })}</span>
                )}
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
              {/* 고정 알림 — 승격(마이크 켜기)·손든 사람(1명 = 바로 처리, 2명 이상 = 묶음 → 참가자 패널) */}
              {promo && (
                <div className="bg-surface-raised flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
                  <p className="min-w-0 flex-1">{t('stage.promoted')}</p>
                  <button
                    type="button"
                    disabled={r.pubBusy}
                    onClick={() => void toggle('audio', true)}
                    className={`${btnS} bg-accent text-white disabled:opacity-40`}
                  >
                    {t('mic.off')}
                  </button>
                  <button type="button" onClick={() => setPromoHidden(true)} className={`${btnS} bg-surface`}>
                    {t('stage.later')}
                  </button>
                </div>
              )}
              {hands.kind === 'one' && (
                <div className="bg-surface-raised flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
                  <p className="min-w-0 flex-1">✋ {t('hand.notice', { name: hands.peer.name })}</p>
                  <button
                    type="button"
                    onClick={async () => sayErr(await r.setPeerRole(hands.peer.peerId, 'panel'), 'actionFailed')}
                    className={`${btnS} bg-accent text-white`}
                  >
                    {t('stage.invite')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissed((s) => new Set(s).add(handKey(hands.peer)))}
                    className={`${btnS} bg-surface`}
                  >
                    {t('hand.dismiss')}
                  </button>
                </div>
              )}
              {hands.kind === 'many' && (
                <button
                  type="button"
                  onClick={() => openPanel('people')}
                  className="bg-surface-raised w-full rounded-xl p-3 text-left text-sm"
                >
                  ✋ {t('hand.waiting', { n: hands.count })}
                </button>
              )}
              <div className="relative">
                <Stage
                  viewer={role}
                  state={r.state}
                  selfId={r.selfId}
                  selfName={me?.name ?? name}
                  peers={r.peers}
                  tracks={r.tracks}
                  local={r.localStream}
                  localScreen={r.localScreen}
                  localOn={r.localOn}
                  onLayer={r.setLayer}
                />
                <Floaters reaction={r.reaction} />
              </div>
            </div>
            {/* 자동 숨김 — 200ms 페이드(reduced-motion 이면 즉시), 숨겨도 자리는 유지해 무대가 출렁이지 않게 */}
            <div
              {...bar.bar}
              className={`relative transition-opacity duration-200 motion-reduce:transition-none ${bar.shown ? '' : 'pointer-events-none opacity-0'}`}
            >
              <div className="flex justify-center">
                <ReactionMenu open={reactOpen} onClose={() => setReactOpen(false)} onPick={r.react} />
                <QualityMenu
                  open={qualityOpen}
                  cap={r.qualityCap}
                  onClose={() => setQualityOpen(false)}
                  onPick={r.setQualityCap}
                />
              </div>
              <ControlBar
                role={role}
                ready={r.state === 'joined' && r.published && !r.pubBusy}
                addReady={r.state === 'joined' && !r.pubBusy}
                has={has}
                localOn={r.localOn}
                pending={r.pending}
                canShare={canShare}
                sharing={!!r.localScreen}
                panel={panel}
                unread={unread}
                raised={raisedCount}
                handUp={(me?.raisedTs ?? 0) > 0}
                reactOpen={reactOpen}
                qualityOpen={qualityOpen}
                qualityCap={r.qualityCap}
                soundBlocked={sound.blocked}
                width={width}
                onHold={bar.onMenu}
                onToggle={(k, on) => void toggle(k, on)}
                onShare={async (on) => sayErr(await r.shareScreen(on), 'shareFailed')}
                onPanel={openPanel}
                onHand={async (up) => sayErr(await r.setHand(up), 'actionFailed')}
                onReact={() => setReactOpen((o) => !o)}
                onQuality={() => setQualityOpen((o) => !o)}
                onSound={() => void sound.enable()}
                onLeave={onLeave}
              />
            </div>
          </div>
          <SidePanel
            tab={tab}
            open={panel !== null}
            viewer={role}
            selfId={r.selfId}
            peers={r.peers}
            chat={r.chat}
            onTab={setTab}
            onClose={() => setPanel(null)}
            onSend={async (text) => sayErr(await r.sendChat(text), 'chatFailed')}
            onRetry={async (m) => sayErr(await r.retryChat(m.n, m.text), 'chatFailed')}
            onPromote={async (id) => sayErr(await r.setPeerRole(id, 'panel'), 'actionFailed')}
            onDemote={async (id) => sayErr(await r.setPeerRole(id, 'audience'), 'actionFailed')}
            onLowerAll={async () => sayErr(await r.lowerAll(), 'actionFailed')}
          />
        </div>
      )}
      {/* 발표자 나가기 — [나가기]/[세미나 종료](확인 1단계 더). 기본 <dialog> : Esc·포커스 가두기 내장 */}
      <dialog
        ref={leaveRef}
        aria-labelledby="leave-title"
        className="bg-surface text-foreground m-auto w-[min(92vw,420px)] rounded-xl p-6 backdrop:bg-black/60"
      >
        <h2 id="leave-title" className="mb-2 font-bold">
          {t(leaveStep === 'choose' ? 'leaveDialog.title' : 'leaveDialog.confirmTitle')}
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          {t(leaveStep === 'choose' ? 'leaveDialog.body' : 'leaveDialog.confirmBody')}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => leaveRef.current?.close()} className={`${btnS} bg-surface-raised`}>
            {t('leaveDialog.cancel')}
          </button>
          {leaveStep === 'choose' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  leaveRef.current?.close()
                  r.leave()
                }}
                className={`${btnS} bg-surface-raised`}
              >
                {t('leave')}
              </button>
              <button type="button" onClick={() => setLeaveStep('confirm')} className={`${btnS} bg-danger text-white`}>
                {t('leaveDialog.end')}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void endSeminar()} className={`${btnS} bg-danger text-white`}>
              {t('leaveDialog.endConfirm')}
            </button>
          )}
        </div>
      </dialog>
    </div>
  )
}

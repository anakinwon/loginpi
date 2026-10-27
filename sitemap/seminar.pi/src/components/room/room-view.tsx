'use client'
// 세미나 룸 화면 — 로그인 게이트 → 대기실(S3) → 룸(S4)을 한 페이지 상태 전환으로 잇는다(설계서 5절 :
// 대기실 카메라 스트림과 [입장] 탭 제스처를 그대로 룸에 넘겨야 Pi Browser 자동재생이 막히지 않는다). 서버 redirect 없음
// 부가 기능 확장 지점(F-U, extensions.ts) — features/index.ts 등록부를 ⋯ 항목·패널 탭·무대 오버레이·영상 효과·app 수신·음성 조각·마이크 동의로 잇는다.
// 등록이 0개면 아무것도 더하지 않는다(회귀 0)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LoginGate } from '@/components/login-gate'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { isUuid } from '@/lib/seminar-rules'
import { ConnectionBadge, useConnectionCheck } from './connection-check'
import { ConsentDialog, useConsent } from './consent'
import {
  ControlBar,
  ExtraItem,
  ICON,
  Icon,
  QualityMenu,
  useBarVisibility,
  type BarItem,
  type PanelTab,
} from './control-bar'
import { useVideoEffects } from './effects'
import { featureStore, speechWants, useStore, useStores, type RoomCtx } from './extensions'
import { FEATURES } from './features'
import { Prejoin } from './prejoin'
import { Floaters, ReactionMenu } from './reactions'
import {
  handKey,
  handNotice,
  isBadGrade,
  layoutFor,
  lockedFor,
  nextToast,
  peerMedia,
  TOAST,
  type Grade,
  type ModAction,
  type ToastState,
  visibleExtras,
} from './room-rules'
import { SidePanel, type ExtraTab } from './side-panel'
import { Spinner, Stage, useRemoteAudio } from './stage'
import { useRoom, type MediaKind, type Role, type SessionRole } from './use-room'
import { useSpeech } from './use-speech'

// 등록부에서 한 번만 뽑는 목록(모듈 상수 — 저장소 구독 목록이 렌더마다 같아야 한다)
const MORE = FEATURES.flatMap((f) => f.more ?? [])
const TABS = FEATURES.flatMap((f) => (f.tab ? [f.tab] : []))
const ZERO = featureStore(0)
const TAB_BADGES = TABS.map((x) => x.badge ?? ZERO)
const EFFECTS = FEATURES.flatMap((f) => (f.effect ? [f.effect] : [])).sort((a, b) => a.order - b.order)
// 발언자 음성을 처리하는 기능이 있을 때만 마이크 동의·대기실 고지(A-6). 음성 조각은 동의한 사람만 돈다
const CONSENT = FEATURES.some((f) => f.consent)
// 엔진 app 중계가 있어야 보이는 ⋯ 항목이 있을 때만 입장 직후 지원 확인(없으면 확인 요청도 보내지 않는다)
const NEEDS_APP = MORE.some((it) => it.app)

export function RoomView({ room, wsUrl }: { room: string; wsUrl?: string }) {
  const t = useTranslations('room')
  if (!wsUrl) return <p className="text-muted-foreground text-sm">{t('noEngine')}</p>
  return (
    <LoginGate>
      {(user) => (
        <Room
          room={room}
          wsUrl={wsUrl}
          userId={user.userId}
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
// 입장권 거절(QA 2026-10-27) : 402 = 유료 미등록 → 상세(S2)에서 결제, 404·409 = 세미나 없음·종료 → 홈 — 다시 입장해도 같은 실패라 다시 입장 버튼을 두지 않는다
const HOME_CODES = new Set(['ROOM_FULL', 'ROOM_CLOSED', 'DUPLICATE_SESSION', 'TICKET_404', 'TICKET_409'])
const DETAIL_CODES = new Set(['TICKET_402'])

// 끊김·오류 전체 화면(설계서 6.3) — 무대·하단 바를 덮는다
function Ended({ code, room, onRejoin }: { code: string; room: string; onRejoin: () => void }) {
  const t = useTranslations('room')
  const key = `err.${code}`
  const btn = 'bg-accent inline-grid h-11 place-items-center rounded-full px-5 font-semibold text-white'
  return (
    <section role="alert" className="bg-background fixed inset-0 z-40 grid place-items-center p-4">
      <div className="bg-surface w-full max-w-md space-y-4 rounded-xl p-6 text-center">
        <p>{t.has(key) ? t(key) : t('err.generic')}</p>
        {DETAIL_CODES.has(code) ? (
          <Link href={`/s/${room}`} className={btn}>
            {t('toDetail')}
          </Link>
        ) : HOME_CODES.has(code) ? (
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
const ERR_NOTICE = new Set(['RATE_LIMITED', 'ROLE_FORBIDDEN', 'MEDIA_FAILED', 'LOCKED'])

function Room({
  room,
  wsUrl,
  userId,
  name,
  canPresent,
}: {
  room: string
  wsUrl: string
  userId: string
  name: string
  canPresent: boolean
}) {
  const t = useTranslations('room')
  const r = useRoom({ wsUrl, appProbe: NEEDS_APP })
  const audioRef = useRef<HTMLAudioElement>(null)
  const [ticketRole, setTicketRole] = useState<Role>(canPresent ? 'presenter' : 'audience')
  const sound = useRemoteAudio(audioRef, r.remoteAudio)
  // 화면 안 알림(alert() 금지, 설계서 14.5) — key = room.* 아래 전체 경로(+ 변수). say 는 notice.* 를, 부가 기능(ctx.notice)은 자기 키를 쓴다
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
  // 발표자의 켜기 요청(v1.2 askUnmute) — 고정 알림, 자동으로 켜지 않는다. [켜기]/[무시] 로만 닫힌다
  const [ask, setAsk] = useState<MediaKind | null>(null)
  const leaveRef = useRef<HTMLDialogElement>(null)
  const [leaveStep, setLeaveStep] = useState<'choose' | 'confirm'>('choose')
  const me = r.peers.find((p) => p.peerId === r.selfId)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])
  const say = (key: string, v?: Record<string, string>) => setNotice({ key: `notice.${key}`, v })
  const sayErr = (code: string | null, fallback: string) => {
    if (code) say(ERR_NOTICE.has(code) ? `err.${code}` : fallback)
  }

  // ── 부가 기능(extensions.ts) ──
  const locale = useLocale()
  // 마이크 동의 — 음성 처리 기능이 있고 내가 말할 수 있을 때만(발표 가능·무대 역할)
  const consent = useConsent(room, userId, CONSENT && (canPresent || role !== 'audience'))
  // 음성 조각(A-1) — 기능들의 말하기 요청을 합쳐 녹음기 1개로. 동의한 무대 역할의 내 마이크만(청중 음성은 나가지 않는다)
  const wants = Object.values(useStore(speechWants))
  const speech = useSpeech({
    track: role !== 'audience' ? (r.localStream?.getAudioTracks()[0] ?? null) : null,
    seminarId: room,
    lang: locale,
    on: live && wants.length > 0 && consent.agreed,
    broadcast: wants.includes('caption'),
    sendApp: r.sendApp,
    onText: (text, ts) => FEATURES.forEach((f) => f.onSpeech?.(text, ts, ctxRef.current)),
    // 서버에 동의 기록이 없다 — 이 기기 기록을 지우고 다시 묻는다(동의하면 음성 조각이 다시 돈다, 안 하면 마이크만 계속)
    onNoAgr: () => {
      consent.reset()
      void consent.ask()
    },
  })
  // 영상 효과 — 켜진 효과가 없으면 null(원본 그대로). 내 타일은 처리된 영상을 보여 준다(송출본 = 미리보기)
  const fxTrack = useVideoEffects(EFFECTS, r.localStream?.getVideoTracks()[0] ?? null, r.videoSender)
  const selfView = useMemo(
    () => (fxTrack && r.localStream ? new MediaStream([...r.localStream.getAudioTracks(), fxTrack]) : r.localStream),
    [fxTrack, r.localStream],
  )
  const ctx: RoomCtx = {
    r,
    role,
    seminarId: room,
    appSupported: r.appSupported,
    sendApp: r.sendApp,
    speechLimited: speech.limited,
    notice: (key, v) => setNotice({ key, v }),
    announce: setAnnounce,
    hold: bar.onSheet,
    openPanel,
    fxTrack,
  }
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  })
  // ntf app → 등록 기능(구독은 한 번 — 세션이 바뀌어도 유지)
  useEffect(
    () => r.subscribeApp((m) => FEATURES.forEach((f) => f.onApp?.(m, ctxRef.current))),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const extra: BarItem[] = visibleExtras(MORE, role, r.appSupported).map((it) => ({
    id: `x:${it.id}`,
    node: (o) => <ExtraItem item={it} ctx={ctx} {...o} />,
  }))
  const badges = useStores(TAB_BADGES)

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

  // 사회 알림(v1.2) — 음소거됨·잠금 바뀜은 5초 알림(발표자는 자기가 한 일이라 잠금 알림 생략), 켜기 요청은 고정 알림
  useEffect(() => {
    const ev = r.modEvent
    if (!ev) return
    if (ev.type === 'mutedBy') say(`mutedBy.${ev.kind}`)
    else if (ev.type === 'askUnmute') setAsk(ev.kind)
    // 오디오·영상 어느 쪽이든 잠기면 잠김 안내(v1.2 검토 지적 : 오디오만 보던 것)
    else if (role !== 'presenter') say(ev.locks.audio || ev.locks.video ? 'policy.locked' : 'policy.unlocked')
  }, [r.modEvent]) // eslint-disable-line react-hooks/exhaustive-deps
  const myLocks = lockedFor(role, r.locks)
  // 잠금이 걸리면 마이크 켜기 요청 알림은 의미가 없다
  useEffect(() => {
    if (myLocks.audio && ask === 'audio') setAsk(null)
  }, [myLocks.audio, ask])

  async function moderate(peerId: string, a: ModAction) {
    const e =
      a === 'askMic'
        ? await r.askUnmute(peerId, 'audio')
        : await r.mutePeer(peerId, a === 'muteMic' ? 'audio' : 'video')
    sayErr(e, 'actionFailed')
  }

  // 발표자 무대 고정 → 청중도 따라 보게(room.setLayout). 내 화면공유 키를 아직 모르면(발행 전) 보내지 않는다
  async function pinForAll(key: string | null) {
    if (role !== 'presenter') return
    const l = layoutFor(key, r.screenProducerId())
    if (l) sayErr(await r.setLayout(l), 'actionFailed')
  }

  // 지금 화면에 보이는 패널 탭 — 패널이 열려 있으면 tab(사이드 패널이 그리는 기준과 같다). panel 은 '어느 버튼으로 열었나'라서 탭을 옮겨도 그대로다
  const shown = panel !== null ? tab : null
  // 안 읽은 채팅 — 채팅 탭이 보이는 동안은 다 읽은 것
  const lastN = r.chat.at(-1)?.n ?? 0
  const chatVisible = shown === 'chat'
  useEffect(() => {
    if (chatVisible) setSeenN(lastN)
  }, [chatVisible, lastN])
  const unread = chatVisible ? 0 : r.chat.filter((m) => !m.mine && m.n > seenN).length
  // 부가 탭(Q&A·설문 등) — 바 '채팅' 배지 = 채팅 + 부가 탭 새 항목 합계(패널 입구가 채팅 버튼 하나라서, 15.3)
  const extraTabs: ExtraTab[] = TABS.map((x, i) => ({
    id: x.id,
    label: x.label,
    badge: badges[i],
    node: <x.Panel ctx={ctx} visible={shown === x.id} />,
  }))
  const badgeAll = unread + badges.reduce((a, b) => a + b, 0)

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
    setAsk(null)
    leaveRef.current?.close()
    // 부가 기능 — 저장소를 처음 값으로(시트·배지·자막·말하기 요청). 시트 보류는 useBarVisibility 가 비활성 때 푼다
    for (const f of FEATURES) f.onReset?.()
    speechWants.reset()
  }, [live])

  async function toggle(kind: MediaKind, on: boolean) {
    // 마이크를 처음 켜기 직전 동의(A-6) — 동의 안 함이어도 마이크는 켠다(음성 처리만 빠짐, consent.agreed 로 막힘). 닫기(Esc)만 켜기 취소
    if (kind === 'audio' && on && consent.needed && (await consent.ask()) === null) return
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
    // 마이크를 켠 채 발표자로 입장 = 첫 송출 직전 → 동의를 먼저 묻는다. 동의 안 함 = 마이크 켠 채(음성 처리 없음), 닫기 = 마이크를 끈 채 입장(입장은 막지 않음)
    const mic = ticketRole === 'presenter' ? (local?.getAudioTracks().filter((tr) => tr.enabled) ?? []) : []
    if (!mic.length || !consent.needed) return void r.join(room, ticketRole, local)
    void consent.ask().then((a) => {
      if (a === null) mic.forEach((tr) => (tr.enabled = false))
      void r.join(room, ticketRole, local)
    })
  }

  function onLeave() {
    // 발표자는 [나가기]/[세미나 종료] 선택(설계서 6.1, 13절 #6). 대화상자는 기본 <dialog>(포커스 가두기·Esc 닫기 내장)
    if (role !== 'presenter') return r.leave()
    setLeaveStep('choose')
    leaveRef.current?.showModal()
  }

  async function endSeminar() {
    leaveRef.current?.close()
    // DB 상태 먼저 ENDED(정본) — 엔진을 재시작해도 입장권이 다시 나가지 않게(입장권 409). 실험실 방 코드는 DB 가 없어 건너뜀.
    // DB 갱신이 실패하면 방을 닫지 않고 알린다 — 엔진만 닫으면 재시작 뒤 입장권이 다시 나가 종료가 풀린다(2차 검토 지적). 발표자가 다시 누르면 된다
    if (isUuid(room)) {
      const res = await piFetch(`/api/seminars/${room}/end`, { method: 'POST' }).catch(() => null)
      if (!res?.ok) return say('endFailed')
    }
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
            {t(notice.key, notice.v)}
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
          notice={CONSENT}
        />
      ) : ended ? (
        <Ended code={r.error ?? 'CLOSED'} room={room} onRejoin={r.leave} />
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
                {/* 잠금 이유(v1.2) — 마이크 버튼이 막힌 까닭을 화면에도 남긴다 */}
                {myLocks.audio && role !== 'audience' && (
                  <span className="bg-surface-raised rounded-full px-3 py-1">🔒 {t('mod.locked')}</span>
                )}
              </div>
              {/* 고정 알림 — 승격(마이크 켜기)·손든 사람(1명 = 바로 처리, 2명 이상 = 묶음 → 참가자 패널) */}
              {promo && (
                <div className="bg-surface-raised flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
                  <p className="min-w-0 flex-1">{t('stage.promoted')}</p>
                  <button
                    type="button"
                    disabled={r.pubBusy || myLocks.audio}
                    title={myLocks.audio ? t('mod.locked') : undefined}
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
              {ask && role !== 'audience' && (
                <div role="alert" className="bg-surface-raised flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm">
                  <p className="min-w-0 flex-1">{t(`ask.${ask}`)}</p>
                  <button
                    type="button"
                    disabled={r.pubBusy || myLocks[ask]}
                    onClick={() => {
                      setAsk(null)
                      void toggle(ask, true) // 사용자 탭 안에서만 켠다(장치 권한 팝업 포함)
                    }}
                    className={`${btnS} bg-accent text-white disabled:opacity-40`}
                  >
                    {t(ask === 'audio' ? 'mic.off' : 'cam.off')}
                  </button>
                  <button type="button" onClick={() => setAsk(null)} className={`${btnS} bg-surface`}>
                    {t('ask.ignore')}
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
                  local={selfView}
                  localScreen={r.localScreen}
                  localOn={r.localOn}
                  onLayer={r.setLayer}
                  speaker={r.speaker}
                  engineSpeaker={r.engineSpeaker}
                  layout={r.layout}
                  onPin={role === 'presenter' ? (k) => void pinForAll(k) : undefined}
                />
                <Floaters reaction={r.reaction} />
                {FEATURES.map((f) => f.Overlay && <f.Overlay key={f.id} ctx={ctx} barShown={bar.shown} />)}
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
                locked={myLocks}
                pending={r.pending}
                canShare={canShare}
                sharing={!!r.localScreen}
                panel={panel}
                unread={badgeAll}
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
                extra={extra}
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
            media={peerMedia(r.tracks)}
            locks={r.locks}
            onMod={(id, a) => void moderate(id, a)}
            onMuteAll={async (lock) => sayErr(await r.muteAll('audio', lock), 'actionFailed')}
            extra={extraTabs}
          />
        </div>
      )}
      {CONSENT && <ConsentDialog open={consent.open} onAnswer={consent.answer} />}
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

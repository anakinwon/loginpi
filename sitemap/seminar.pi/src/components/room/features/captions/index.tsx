'use client'
// 실시간 자막(SA3, 설계서 15.4) — 무대 하단 오버레이 + ⋯ '자막·번역' 시트(엔진 app 지원 시에만, 전원).
// 켜기 = presenter 의 '실시간 자막(방 전체)' → wantSpeech('captions','caption')(use-speech 시작) + app state{captions} 방송 →
// panel 도 받아서 자기 마이크 자막을 켠다. 표시 = ntf app caption{text,ts,lang}(검사 caption-rules) + 내 음성(onSpeech, 엔진은 본인에게 되돌리지 않음).
// 최신 자막 1개(화자 이름 + 문장, 최대 3줄), 8초 새 조각 없으면 사라짐, pointer-events 없음, aria-live 없음(원음과 이중 낭독 — 15.12).
// 늦은 입장자 = presenter 화면이 참가자 수 증가 시 1초에 1번 이하로 state 재방송(SIGNAL_API 3.6). 번역·더빙(SA8·SA9)은 이 시트·저장소 위에 붙인다
import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Icon } from '../../control-bar'
import { featureStore, speechWants, useStore, wantSpeech, type RoomCtx, type RoomFeature } from '../../extensions'
import { Sheet, SwitchRow } from '../sheet'
import { CAPTION, captionsState, parseCaption } from './caption-rules'

type Size = 'sm' | 'md' | 'lg'
const SCALE: Record<Size, number> = { sm: 0.85, md: 1, lg: 1.25 }
const PREF_KEY = 'seminar.captions' // 개인 설정(보기·크기) — 다음 입장에도 유지

export const capSheet = featureStore(false)
export const capRoom = featureStore(false) // 방 자막 켜짐(presenter 결정, state 로 전원 공유)
export const capShow = featureStore(true) // 내 화면에 보기
export const capSize = featureStore<Size>('md')
export const capLatest = featureStore<{
  name: string
  text: string
  lang: string
  at: number
} | null>(null)

const nameOf = (ctx: RoomCtx, peerId: string) => ctx.r.peers.find((p) => p.peerId === peerId)?.name ?? ''

// presenter 토글 — 방송 실패면 되돌린다(전원에게 알리지 못하면 켜지 않는다, 15.1)
async function toggleRoom(on: boolean, ctx: RoomCtx) {
  capRoom.set(on)
  const err = await ctx.sendApp('state', { captions: on })
  if (err) {
    capRoom.set(!on)
    ctx.notice('room.captions.sendFail')
  }
}

function usePrefs() {
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as {
        show?: unknown
        size?: unknown
      }
      if (typeof p.show === 'boolean') capShow.set(p.show)
      if (p.size === 'sm' || p.size === 'md' || p.size === 'lg') capSize.set(p.size)
    } catch {}
  }, [])
  const show = useStore(capShow)
  const size = useStore(capSize)
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ show, size }))
    } catch {}
  }, [show, size])
  return { show, size }
}

function CaptionsOverlay({ ctx, barShown }: { ctx: RoomCtx; barShown: boolean }) {
  const t = useTranslations('room.captions')
  const open = useStore(capSheet)
  const room = useStore(capRoom)
  const latest = useStore(capLatest)
  const { show, size } = usePrefs()
  const presenter = ctx.role === 'presenter'

  // 수명 — 마지막 조각 뒤 8초
  useEffect(() => {
    if (!latest) return
    const id = setTimeout(() => capLatest.set(null), Math.max(0, CAPTION.lifeMs - (Date.now() - latest.at)))
    return () => clearTimeout(id)
  }, [latest])

  // 방 자막·역할 → 말하기 요청(panel 승격·강등 포함). 실제 녹음은 room-view 가 동의·무대 역할일 때만 돈다
  useEffect(() => {
    wantSpeech('captions', room && ctx.role !== 'audience' ? 'caption' : null)
  }, [room, ctx.role])

  // 늦은 입장자에게 현재 상태 재방송(presenter, 켜져 있을 때만, 1초에 1번 이하)
  const count = ctx.r.peers.length
  const prevCount = useRef(count)
  const sendRef = useRef(ctx.sendApp)
  useEffect(() => {
    sendRef.current = ctx.sendApp
  })
  useEffect(() => {
    const grew = count > prevCount.current
    prevCount.current = count
    if (!presenter || !room || !grew) return
    const id = setTimeout(() => void sendRef.current('state', { captions: true }), CAPTION.resendMs)
    return () => clearTimeout(id)
  }, [count, presenter, room])

  // 음성 처리 한도 소진 — 1번 알림
  useEffect(() => {
    if (ctx.speechLimited && room) ctx.notice('room.captions.limit')
  }, [ctx.speechLimited]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {show && latest && (
        <div
          role="region"
          aria-label={t('region')}
          className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-2 transition-[bottom] duration-200 motion-reduce:transition-none"
          style={{
            bottom: barShown ? 12 : 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          <p
            className="text-foreground line-clamp-3 max-w-[min(92%,720px)] rounded-lg bg-black/75 px-2.5 py-1 leading-[1.4]"
            style={{
              fontSize: `calc(${SCALE[size]} * clamp(16px, min(4vh, 4.5vw), 32px))`,
            }}
          >
            {latest.name && <span className="text-muted-foreground mr-2">{latest.name}</span>}
            {latest.text}
          </p>
        </div>
      )}
      <Sheet open={open} onClose={() => capSheet.set(false)} title={t('title')} ctx={ctx}>
        {presenter ? (
          <SwitchRow label={t('room')} on={room} onChange={(v) => void toggleRoom(v, ctx)} />
        ) : (
          !room && <p className="text-muted-foreground">{t('waiting')}</p>
        )}
        <SwitchRow label={t('show')} on={show} onChange={capShow.set} />
        <div role="radiogroup" aria-label={t('size.label')} className="flex items-center justify-between gap-3">
          <span>{t('size.label')}</span>
          <div className="bg-surface-raised flex rounded-full p-0.5">
            {(['sm', 'md', 'lg'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                onClick={() => capSize.set(s)}
                className={`h-9 rounded-full px-3 ${size === s ? 'bg-accent text-white' : ''}`}
              >
                {t(`size.${s}`)}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </>
  )
}

export const captions: RoomFeature = {
  id: 'captions',
  consent: true, // 발언자 음성을 처리한다 → 마이크 동의·대기실 고지(A-6)
  more: [
    {
      id: 'captions',
      label: 'captions.title',
      icon: (
        <Icon d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v10h16V7H4Zm2 3h5v1.5H7.5v1h3.5V14H6v-4Zm7 0h5v1.5h-3.5v1H18V14h-5v-4Z" />
      ),
      roles: ['presenter', 'panel', 'audience'],
      app: true, // 엔진 app 미지원이면 숨김(전원 고지 불가 → 시작 불가)
      sheet: true,
      onClick: () => capSheet.set(true),
    },
  ],
  Overlay: CaptionsOverlay,
  onApp: (m, ctx) => {
    if (m.topic === 'caption') {
      const c = parseCaption(m.d)
      if (c)
        capLatest.set({
          name: nameOf(ctx, m.from),
          text: c.text,
          lang: c.lang,
          at: Date.now(),
        })
    } else if (m.topic === 'state') {
      // state 는 presenter 만 보낼 수 있다(엔진 주제표) — 다른 키는 다른 기능 몫
      const on = captionsState(m.d)
      if (on !== null) capRoom.set(on)
    }
  },
  onSpeech: (text, _ts, ctx) => {
    if (speechWants.get().captions !== 'caption') return // AI 회의록만 켠 조용한 모드면 띄우지 않는다
    const c = parseCaption({ text })
    if (c)
      capLatest.set({
        name: nameOf(ctx, ctx.r.selfId ?? ''),
        text: c.text,
        lang: c.lang,
        at: Date.now(),
      })
  },
  onReset: () => {
    capSheet.reset()
    capRoom.reset()
    capLatest.reset()
  },
}

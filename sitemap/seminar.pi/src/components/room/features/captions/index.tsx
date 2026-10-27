'use client'
// 실시간 자막(SA3, 설계서 15.4) — 무대 하단 오버레이 + ⋯ '자막·번역' 시트(엔진 app 지원 시에만, 전원).
// 켜기 = presenter 의 '실시간 자막(방 전체)' → wantSpeech('captions','caption')(use-speech 시작) + app state{captions} 방송 →
// panel 도 받아서 자기 마이크 자막을 켠다. 표시 = ntf app caption{text,ts,lang}(검사 caption-rules) + 내 음성(onSpeech, 엔진은 본인에게 되돌리지 않음).
// 최신 자막 1개(화자 이름 + 문장, 최대 3줄), 8초 새 조각 없으면 사라짐, pointer-events 없음, aria-live 없음(원음과 이중 낭독 — 15.12).
// 늦은 입장자 = presenter 화면이 참가자 수 증가 시 1초에 1번 이하로 state 재방송(SIGNAL_API 3.6, throttle).
// presenter 입장·재입장 때 자기 현재 값을 1번 방송(퇴장 뒤 꺼진 스위치와 panel 의 켜진 자막이 어긋나 음성 한도를 쓰는 것 방지).
// 음성 한도 소진 = presenter 가 state{captions:false, captionsReason:'limit'} 방송 → 전원 알림(설계서 15.4)
// 번역 자막(SA8) = 개인 설정 — '번역 자막 보기'(원문/번역 토글) + 언어 선택(TRANSLATE_LANGS, 표시명 Intl.DisplayNames). 기본 언어 = UI locale, localStorage 에 함께 저장
// 음성 번역 듣기(SA9 DubRow) = 번역 자막이 켜졌을 때만, 같은 언어(lang)로 — 꺼짐(원문)이면 숨김
import { useEffect, useMemo, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Icon } from '../../control-bar'
import { featureStore, speechWants, useStore, wantSpeech, type RoomCtx, type RoomFeature } from '../../extensions'
import { DubRow } from '../dubbing'
import { Sheet, SwitchRow } from '../sheet'
import { isTranslateLang, pickTrLang, TRANSLATE_LANGS } from '@/lib/translate-rules'
import { presenterGone, presenterResync } from '../../room-rules'
import { CAPTION, captionsState, parseCaption, SIZES, stepSize, type Size } from './caption-rules'
import { trStop, useTranslated } from './translate'

const SCALE: Record<Size, number> = { sm: 0.85, md: 1, lg: 1.25 }
const PREF_KEY = 'seminar.captions' // 개인 설정(보기·크기) — 다음 입장에도 유지

export const capSheet = featureStore(false)
export const capRoom = featureStore(false) // 방 자막 켜짐(presenter 결정, state 로 전원 공유)
export const capShow = featureStore(true) // 내 화면에 보기
export const capSize = featureStore<Size>('md')
export const capTr = featureStore(false) // 번역 자막 보기(꺼짐 = 원문)
export const capTrLang = featureStore('') // 번역 언어('' = 아직 안 고름 → UI locale)
export const capLatest = featureStore<{
  name: string
  text: string
  lang: string
  sig: string | null // 서버 발급 자막 서명 — 없으면 번역하지 않고 원문
  at: number
} | null>(null)

const nameOf = (ctx: RoomCtx, peerId: string) => ctx.r.peers.find((p) => p.peerId === peerId)?.name ?? ''

// presenter 토글 — 방송 실패면 되돌린다(전원에게 알리지 못하면 켜지 않는다, 15.1)
async function toggleRoom(on: boolean, ctx: RoomCtx) {
  capRoom.set(on)
  const err = await ctx.sendApp('state', { captions: on })
  if (err) {
    capRoom.set(!on)
    ctx.notice('captions.sendFail')
  }
}

function usePrefs() {
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as {
        show?: unknown
        size?: unknown
        tr?: unknown
        trLang?: unknown
      }
      if (typeof p.show === 'boolean') capShow.set(p.show)
      if (p.size === 'sm' || p.size === 'md' || p.size === 'lg') capSize.set(p.size)
      if (typeof p.tr === 'boolean') capTr.set(p.tr)
      if (isTranslateLang(p.trLang)) capTrLang.set(p.trLang)
    } catch {}
  }, [])
  const show = useStore(capShow)
  const size = useStore(capSize)
  const tr = useStore(capTr)
  const trLang = useStore(capTrLang)
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ show, size, tr, trLang }))
    } catch {}
  }, [show, size, tr, trLang])
  return { show, size, tr, trLang }
}

// 언어 선택 목록 — 각 언어를 UI locale 로 부른 이름(자기 언어 이름 병기), 이름순. Intl 미지원 언어는 코드 그대로
function useLangNames(locale: string) {
  return useMemo(() => {
    const name = (loc: string, code: string) => {
      try {
        return new Intl.DisplayNames([loc], { type: 'language' }).of(code) ?? code
      } catch {
        return code
      }
    }
    return TRANSLATE_LANGS.map((c) => {
      const a = name(locale, c)
      const b = name(c, c)
      return [c, a === b ? a : `${a} (${b})`] as const
    }).sort((x, y) => x[1].localeCompare(y[1], locale))
  }, [locale])
}

function CaptionsOverlay({ ctx, barShown }: { ctx: RoomCtx; barShown: boolean }) {
  const t = useTranslations('room.captions')
  const open = useStore(capSheet)
  const room = useStore(capRoom)
  const latest = useStore(capLatest)
  const { show, size, tr, trLang } = usePrefs()
  const presenter = ctx.role === 'presenter'
  const locale = useLocale()
  // 기본 = 브라우저 선호 언어(목록에 있으면) → UI locale → 'en'. navigator 는 마운트 뒤에만(SSR 없음 — 'use client' 오버레이)
  const lang = trLang || pickTrLang(typeof navigator === 'undefined' ? [] : navigator.languages, locale)
  const shown = useTranslated(latest, tr, lang, ctx.seminarId)
  const langs = useLangNames(locale)
  const stop = useStore(trStop)

  // 번역 중단(권한 없음·AI 미설정·한도) — 번역을 켠 사람에게 1번 알린다. 시트에도 사유를 남긴다
  useEffect(() => {
    if (stop && capTr.get()) ctx.notice(`captions.trStop.${stop}`)
  }, [stop]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // 발표자가 끊김 신호 없이 나가면(창 닫힘·망 단절) 방 자막을 내린다 — 끌 사람이 없다. 다시 들어오면 발표자가 현재 값을 방송한다
  const gone = presenterGone(ctx.role, ctx.r.selfId, ctx.r.peers)
  useEffect(() => {
    if (gone) capRoom.set(false)
  }, [gone])

  // presenter 입장·재입장 — 자기 현재 값을 1번 방송(꺼져 있으면 false 로 panel 을 맞춘다)
  const sendRef = useRef(ctx.sendApp)
  useEffect(() => {
    sendRef.current = ctx.sendApp
  })
  const selfId = ctx.r.selfId
  useEffect(() => {
    if (presenterResync(ctx.role, ctx.appSupported, selfId)) void sendRef.current('state', { captions: capRoom.get() })
  }, [presenter, ctx.appSupported, selfId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 늦은 입장자에게 현재 상태 재방송(presenter, 켜져 있을 때만) — throttle : 대기 중이면 새로 걸지 않는다
  const count = ctx.r.peers.length
  const prevCount = useRef(count)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const grew = count > prevCount.current
    prevCount.current = count
    if (!presenter || !room || !grew || timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      void sendRef.current('state', { captions: capRoom.get() })
    }, CAPTION.resendMs)
  }, [count, presenter, room])
  // 대기 타이머는 방 자막 꺼짐·역할 변경·언마운트 때만 지운다(참가자 수 변화로는 지우지 않음)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    },
    [presenter, room],
  )

  // 음성 처리 한도 소진 — 방 자막을 내리고 내 화면에 알린다. presenter 면 전원에게 사유와 함께 방송(받는 쪽 알림은 onApp).
  // panel 이 먼저 한도에 닿아도(세미나 단위 한도) 자기 자막이 멈췄음을 안다 — state 는 presenter 만 보낼 수 있어 방송은 없다
  useEffect(() => {
    if (!ctx.speechLimited || !capRoom.get()) return
    capRoom.set(false) // panel 도 내린다 — 뒤이어 오는 presenter 의 limit 방송으로 같은 알림이 두 번 뜨지 않게(onApp 은 켜져 있을 때만 알림)
    ctx.notice('captions.limit')
    if (presenter) void sendRef.current('state', { captions: false, captionsReason: 'limit' })
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
            {/* bdi = 아랍어·히브리어 등 오른쪽→왼쪽 번역문이 이름 뒤에서 문장부호 순서가 뒤섞이지 않게, lang = 한자 글꼴(중·일)·낭독기 발음 */}
            <bdi lang={shown?.lang || undefined}>{shown?.text}</bdi>
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
        <SwitchRow label={t('translate')} on={tr} onChange={capTr.set} />
        {tr && stop && <p className="text-muted-foreground text-sm">{t(`trStop.${stop}`)}</p>}
        {tr && (
          <label className="flex items-center justify-between gap-3">
            <span>{t('lang')}</span>
            <select
              value={lang}
              onChange={(e) => capTrLang.set(e.target.value)}
              className="bg-surface-raised h-10 max-w-[60%] rounded-lg px-2"
            >
              {langs.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div role="radiogroup" aria-label={t('size.label')} className="flex items-center justify-between gap-3">
          <span>{t('size.label')}</span>
          {/* 라디오 그룹 키보드(WAI-ARIA) — Tab 은 고른 것 1개에만 서고, 화살표·Home·End 로 바꾸며 초점도 따라간다 */}
          <div
            className="bg-surface-raised flex rounded-full p-0.5"
            onKeyDown={(e) => {
              const next = stepSize(size, e.key)
              if (!next) return
              e.preventDefault()
              capSize.set(next)
              e.currentTarget.querySelectorAll('button')[SIZES.indexOf(next)]?.focus()
            }}
          >
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                tabIndex={size === s ? 0 : -1}
                onClick={() => capSize.set(s)}
                className={`h-9 rounded-full px-3 ${size === s ? 'bg-accent text-white' : ''}`}
              >
                {t(`size.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <DubRow lang={tr ? lang : ''} />
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
          sig: c.sig,
          at: Date.now(),
        })
    } else if (m.topic === 'state') {
      // state 는 presenter 만 보낼 수 있다(엔진 주제표) — 다른 키는 다른 기능 몫
      const on = captionsState(m.d)
      if (on === null) return
      if (!on && capRoom.get() && (m.d as { captionsReason?: unknown }).captionsReason === 'limit')
        ctx.notice('captions.limit')
      capRoom.set(on)
    }
  },
  onSpeech: (text, _ts, ctx, meta) => {
    if (speechWants.get().captions !== 'caption') return // AI 회의록만 켠 조용한 모드면 띄우지 않는다
    const c = parseCaption({ text, ...meta })
    if (c)
      capLatest.set({
        name: nameOf(ctx, ctx.r.selfId ?? ''),
        text: c.text,
        lang: c.lang,
        sig: c.sig,
        at: Date.now(),
      })
  },
  onReset: () => {
    capSheet.reset()
    capRoom.reset()
    capLatest.reset()
    trStop.reset()
  },
}

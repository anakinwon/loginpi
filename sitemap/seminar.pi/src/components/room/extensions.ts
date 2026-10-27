'use client'
// 룸 확장 지점(F-U, 설계서 15절·계획서 A-7) — 기능 팀은 room-view·control-bar·side-panel·use-room·stage 를 고치지 않고
// features/<이름>/ 에 새 파일을 만든 뒤 features/index.ts 에 1줄 등록만 한다. 등록이 0개면 기존 화면·동작 그대로(회귀 0).
// 자리 4곳 : ⋯ 더보기 항목(more) · 사이드 패널 탭(tab) · 무대 위 오버레이(Overlay — 시트·배지·자막도 여기서 그린다) · 영상 효과(effect).
// 기능 간 공유 상태는 featureStore(모듈 저장소)로 — 메뉴 항목·오버레이·효과·onApp 이 같은 저장소를 본다. 근거 기록 docs/rea/REA_04_UI_EXT.md
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import type { useRoom, SessionRole } from './use-room'
import type { EffectDraw } from './effects'

export type RoomApi = ReturnType<typeof useRoom>
// 엔진 범용 중계(SIGNAL_API v1.3 A-2) — ntf app{topic, d, from}. from = 보낸 사람 peerId
export type AppMsg = { topic: string; d: unknown; from: string }

// 기능에 넘기는 룸 맥락 — 렌더마다 새 객체(최신 값). onApp·onSpeech 에는 그 순간의 최신 맥락이 온다
export type RoomCtx = {
  r: RoomApi // useRoom 결과 전체(peers·selfId·localStream·tracks 등)
  role: SessionRole // 세션 역할(정본) — 발행 거부면 audience
  seminarId: string // 방 코드 = 세미나 ID(UUID). 실험실 방은 UUID 가 아니다
  // 엔진 app 중계 지원 — null = 확인 중, false = 구 엔진(app 이 필요한 항목은 숨김 : 전원 고지를 못 하면 시작하지 않는다, 15.1)
  appSupported: boolean | null
  sendApp: (topic: string, d: unknown) => Promise<string | null> // 반환 = 오류 코드(성공 null)
  speechLimited: boolean // 세미나 음성 처리 한도 소진(A-5, 서버 SPEECH_QUOTA) — 자막·AI 회의록이 멈췄음을 알린다
  notice: (key: string, v?: Record<string, string>) => void // 화면 알림 5초(assertive) — key 는 room 네임스페이스 기준 상대 키(예 'captions.limit', 'room.' 붙이지 않음)
  announce: (text: string) => void // 낭독만(polite, 화면에 안 보임) — 시작·종료처럼 오류가 아닌 알림
  hold: (open: boolean) => void // 시트·대화상자가 열려 있는 동안 하단 바 자동 숨김 보류
  openPanel: (tab: string) => void // 사이드 패널을 그 탭으로 연다(이미 그 탭이면 닫는다)
  fxTrack: MediaStreamTrack | null // 효과를 모두 거친 최종 송출 영상(켜진 효과 없으면 null = 원본)
}

// ⋯ 더보기 부가 항목(15.2) — 넘친 기본 버튼 다음, 구분선 아래에 등록 순서대로 붙는다
export type MoreItem = {
  id: string
  label: string // room.* 아래 문구 키(예 'captions.title') — 상표 금지
  icon: ReactNode
  roles: readonly SessionRole[] // 보이는 역할
  app?: boolean // 엔진 app 중계가 있어야 쓸 수 있다 → 미지원·확인 전이면 숨김
  sheet?: boolean // 시트·대화상자를 연다(aria-haspopup="dialog")
  checked?: FeatureStore<boolean> // 있으면 켜기/끄기 항목(menuitemcheckbox, aria-checked)
  onClick: (ctx: RoomCtx) => void
}

// 사이드 패널 탭(15.3) — 채팅과 참가자 사이에 등록 순서대로. 숨긴 탭도 언마운트하지 않는다(쓰던 글 유지)
export type PanelTabDef = {
  id: string
  label: string // room.* 아래 문구 키(예 'panel.qna')
  badge?: FeatureStore<number> // 새 항목 수 — 탭 이름 옆, 그리고 바 '채팅' 배지에 합산
  Panel: ComponentType<{ ctx: RoomCtx; visible: boolean }>
}

// 영상 효과(15.5) — 원본 카메라 트랙 → 켜진 효과를 order 순으로 → canvas.captureStream → RTCRtpSender.replaceTrack(재협상 없음, effects.ts)
export type VideoEffect = {
  order: number // 작은 것부터 적용(예 조명 10 → 배경 20 : 카메라 보정 뒤 합성)
  on: FeatureStore<boolean> // 켜짐 — 30회 연속 실패하면 파이프라인이 false 로 되돌린다
  draw: EffectDraw
}

// 말하기 모드(A-1) — caption = 글로 바꾸고 엔진으로 자막 방송, quiet = 글로만(방송 없음 — 예 AI 회의록만 켬)
export type SpeechMode = 'caption' | 'quiet'

export type RoomFeature = {
  id: string
  more?: MoreItem[]
  tab?: PanelTabDef
  Overlay?: ComponentType<{ ctx: RoomCtx; barShown: boolean }> // 무대 위(relative 상자 안). 시트·배지·자막·토스트
  effect?: VideoEffect
  onApp?: (m: AppMsg, ctx: RoomCtx) => void // ntf app 수신 — 자기 topic 만 처리
  onSpeech?: (text: string, ts: number, ctx: RoomCtx, meta?: { lang: string; sig: string | null; rec?: boolean }) => void // 내 음성 조각이 글로 바뀜(내 화면용 — 방송은 use-speech 가 함)
  consent?: boolean // 발언자 음성을 처리하는 기능 — 하나라도 있으면 마이크 동의·대기실 고지가 켜진다(A-6)
  onReset?: () => void // 퇴장·끊김 — 저장소를 처음 값으로
}

// ── 모듈 저장소 ── 한 페이지에 룸은 1개라 모듈 단위로 둔다. 퇴장 때 onReset 에서 reset()

export type FeatureStore<T> = {
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  sub: (fn: () => void) => () => void
  reset: () => void
}

export function featureStore<T>(init: T): FeatureStore<T> {
  let v = init
  const subs = new Set<() => void>()
  const set = (next: T | ((prev: T) => T)) => {
    const n = typeof next === 'function' ? (next as (prev: T) => T)(v) : next
    if (Object.is(n, v)) return
    v = n
    for (const fn of subs) fn()
  }
  return {
    get: () => v,
    set,
    sub: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    reset: () => set(init),
  }
}

export function useStore<T>(s: FeatureStore<T>): T {
  return useSyncExternalStore(s.sub, s.get, s.get)
}

// 여러 저장소 값을 한 번에 — list 는 모듈 상수로 넘긴다(바뀌면 다시 구독). 값이 하나도 안 바뀌면 같은 배열을 돌려준다
export function useStores<T>(list: readonly FeatureStore<T>[]): T[] {
  const cache = useRef<T[]>([])
  const sub = useCallback(
    (fn: () => void) => {
      const offs = list.map((s) => s.sub(fn))
      return () => offs.forEach((off) => off())
    },
    [list],
  )
  const snap = () => {
    const next = list.map((s) => s.get())
    const prev = cache.current
    if (next.length === prev.length && next.every((x, i) => Object.is(x, prev[i]))) return prev
    cache.current = next
    return next
  }
  return useSyncExternalStore(sub, snap, snap)
}

// 원음(원격 소리 <audio>) 볼륨 0~1 — 음성 번역 듣기(더빙)가 켜진 동안 낮춘다(설계서 15.4 덕킹). stage.tsx useRemoteAudio 가 반영
export const remoteVolume = featureStore(1)

// 말하기 요청 — 기능별 모드(없으면 요청 안 함). room-view 가 1개의 use-speech 로 돌린다(자막·회의록이 같이 켜져도 녹음은 1번)
export const speechWants = featureStore<Readonly<Record<string, SpeechMode>>>({})
export function wantSpeech(featureId: string, mode: SpeechMode | null) {
  speechWants.set((s) => {
    if ((s[featureId] ?? null) === mode) return s
    const next = { ...s }
    if (mode) next[featureId] = mode
    else delete next[featureId]
    return next
  })
}

// 무대 위 공용 자리(15.6) — 녹화·AI 기록 배지(좌상단)와 시작·종료 토스트(상단 가운데)가 기능마다 같은 absolute 좌표라
//  동시에 켜지면 하나가 가려지던 것을 막는다. room-view 가 이 id 의 flex 줄을 오버레이보다 먼저 그리고, 기능은 createPortal 로 붙는다
export const BADGE_SLOT_ID = 'room-badges' // 가로 줄(360px 폭이면 줄바꿈)
export const TOAST_SLOT_ID = 'room-toasts' // 세로 줄
export function useStageSlot(id: typeof BADGE_SLOT_ID | typeof TOAST_SLOT_ID) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => setEl(document.getElementById(id)), [id])
  return el
}

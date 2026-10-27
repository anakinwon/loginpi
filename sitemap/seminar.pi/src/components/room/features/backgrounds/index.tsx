'use client'
// 배경 효과(SA5, 설계서 15.5) — ⋯ '효과' → 효과 시트(미리보기·배경 : 없음·흐리게·기본 6종·내 이미지). 고르면 바로 적용(미리보기 = 송출본).
// 무대 역할(presenter·panel)만. 효과 순서 BG.order 20(조명 10 뒤 — 조명은 카메라 원본만 재고 고친다). 성능이 15fps 미만 3초면 분리 간격을 2배로 낮추고, 그래도 느리면 자동 끔 + 경고 토스트(rules.slowWatch·slowerEvery).
// 조명·소음 줄은 SA3(media-fx FxRows)를 이 시트의 '배경' 절 아래에 붙인다 — ⋯ '효과' 항목은 이 기능 1개만 등록
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import {
  featureStore,
  TOAST_SLOT_ID,
  useStageSlot,
  useStore,
  type RoomCtx,
  type RoomFeature,
} from '../../extensions'
import { canProcessVideo, useTrackLive } from '../../effects'
import {
  autoOff,
  bgOn,
  canSegment,
  choice,
  choose,
  draw,
  dropMine,
  reset,
  status,
} from './engine'
import { addMine, listMine, removeMine, shrink, type MyImage } from './my-images'
import { BG, checkMine, PRESETS, withUnsaved } from './rules'
import { SCENE_IDS } from './scenes'
import { FxRows } from '../media-fx'

const open = featureStore(false)

function EffectsSheet({ ctx }: { ctx: RoomCtx }) {
  const t = useTranslations('room.effects')
  // 표시 게이팅만(인증과 무관) — 넓은 화면 + 정밀 포인터(마우스)
  const [desk] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(min-width: 1024px) and (pointer: fine)').matches)
  const isOpen = useStore(open)
  const cur = useStore(choice)
  const busy = useStore(status) === 'loading'
  const ref = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const [mine, setMine] = useState<(MyImage & { url: string; unsaved?: boolean })[]>([])
  const [err, setErr] = useState<string | null>(null)
  const raw = ctx.r.localStream?.getVideoTracks()[0]
  // 장치 쪽에서 끝난 카메라(앱 전환·장치 분리)는 없는 것과 같다 — 고른 배경이 적용되지 않는데 고를 수 있는 척하지 않는다(r5 E2E)
  const cam = useTrackLive(raw) ? raw : undefined
  const ok = isOpen && canProcessVideo() && canSegment() // 시트가 열렸을 때만 판정(닫힌 시트는 렌더 내용이 보이지 않는다)
  const { hold } = ctx
  const off = useStore(autoOff)

  // 시트가 열린 채 저절로 꺼지면(느림·연속 실패) 시트 안 알림 줄에 남긴다 — 무대 토스트는 모달 시트 뒤(inert)라 안 보이고 낭독도 안 된다(야간 r6 T05)
  useEffect(() => {
    if (isOpen && off) setErr(off)
  }, [isOpen, off])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (isOpen && !d.open) d.showModal()
    else if (!isOpen && d.open) d.close()
    hold(isOpen)
  }, [isOpen, hold])

  // 내 이미지 목록 — 시트를 열 때 읽는다(IndexedDB 가 없거나 막혀 있으면 빈 목록)
  useEffect(() => {
    if (!isOpen) return
    let alive = true
    listMine()
      .then(
        (l) =>
          alive &&
          // 저장 실패분(unsaved)은 이번 회의 동안 남긴다 — 덮어쓰면 쓰고 있는 이미지의 선택 표시·삭제가 사라진다
          setMine((prev) =>
            withUnsaved(l, prev).map((m) => ({
              ...m,
              url: URL.createObjectURL(m.blob),
            })),
          ),
      )
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isOpen])
  useEffect(() => () => mine.forEach((m) => URL.revokeObjectURL(m.url)), [mine])

  // 미리보기 = 최종 송출본(조명 등 뒤 효과까지 거친 트랙, 설계 15.5). 효과가 없으면 카메라 원본. 트랙은 송출과 공유라 멈추지 않는다
  const shown = ctx.fxTrack ?? cam
  useEffect(() => {
    const v = preview.current
    if (!v || !isOpen) return
    v.srcObject = shown ? new MediaStream([shown]) : null
    return () => {
      v.srcObject = null
    }
  }, [isOpen, shown])

  const pickIt = async (id: string, blob?: Blob) => {
    setErr(null)
    const e = await choose(id, blob)
    if (e && e !== 'superseded') setErr(e)
  }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    const bad = checkMine(f.type, f.size)
    if (bad) return setErr(bad)
    // 먼저 적용(디코드)해 보고 성공한 것만 저장 — 못 읽는 형식이 깨진 썸네일로 상한 슬롯을 차지하지 않게.
    // 새 이미지가 가장 최신이라 상한 초과로 지워지는 것은 늘 지금 선택이 아니다
    setErr(null)
    const id = crypto.randomUUID()
    let small: Blob
    try {
      small = await shrink(f) // 원본(휴대폰 사진 수십 MB 디코드)은 여기서 한 번만 줄이고 버린다
    } catch {
      return setErr('bgFailed')
    }
    const e = await choose(`m:${id}`, small)
    if (e) return e === 'superseded' ? undefined : setErr(e) // 디코드 실패면 밀려났어도 저장하지 않는다
    try {
      await addMine(small, id)
      const l = await listMine()
      setMine((prev) =>
        withUnsaved(l, prev).map((x) => ({
          ...x,
          url: URL.createObjectURL(x.blob),
        })),
      )
    } catch {
      // 저장만 실패(용량 초과·IndexedDB 막힘) — 배경은 이미 적용됐다. '불러오지 못함'이라 하면 틀린 안내라 저장 실패로 알리고,
      // 이번 회의 동안은 목록에 남겨 선택 표시·삭제가 되게 한다(URL 은 새로 — 이전 목록 URL 은 정리 effect 가 해제)
      setMine((l) =>
        [{ id, ts: Date.now(), blob: small, unsaved: true }, ...l.filter((x) => x.id !== id)].map((x) => ({
          ...x,
          url: URL.createObjectURL(x.blob),
        })),
      )
      setErr('mySaveFail')
    }
  }
  const del = async (id: string) => {
    await dropMine(id) // 쓰고 있던 이미지면 흐림·앞 배경으로(바로 '없음'이면 가리던 방이 드러난다)
    await removeMine(id).catch(() => {})
    setMine((l) =>
      l
        .filter((m) => m.id !== id)
        .map((m) => ({ ...m, url: URL.createObjectURL(m.blob) })),
    ) // 이전 목록 URL 은 정리 effect 가 해제
  }

  const tile =
    'relative aspect-video min-h-12 overflow-hidden rounded-lg border-2 text-xs font-semibold'
  // 썸네일 버튼 — 컴포넌트가 아니라 함수 호출(렌더마다 새 컴포넌트가 되어 다시 마운트되지 않게)
  const thumb = (id: string, label: string, img?: string, blob?: Blob) => {
    const sel = cur === id
    return (
      <button
        type="button"
        aria-pressed={sel}
        aria-busy={sel && busy} // 이름표가 '준비 중…' 글자를 덮으므로 낭독기에 준비 중임을 따로 알린다
        aria-label={label}
        disabled={busy && !sel && id !== 'none'} // '없음'은 모델을 받는 중에도 눌러 취소할 수 있게(choose 의 pick 토큰)
        onClick={() => void pickIt(id, blob)}
        className={`${tile} bg-surface-raised ${sel ? 'border-accent' : 'border-transparent'}`}
        style={
          img
            ? {
                backgroundImage: `url(${img})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        {!img && label}
        {sel && busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/60">
            {t('preparing')}
          </span>
        )}
        {sel && !busy && (
          <span className="bg-accent absolute top-1 right-1 rounded-full px-1 text-white">
            ✓
          </span>
        )}
      </button>
    )
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="fx-title"
      onClose={() => open.set(false)}
      className="bg-surface text-foreground m-0 mt-auto max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-2xl p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop:bg-black/40 sm:m-auto sm:w-[360px] sm:rounded-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="fx-title" className="font-bold">
          {t('title')}
        </h2>
        <button
          type="button"
          onClick={() => open.set(false)}
          aria-label={t('close')}
          className="h-9 w-9 rounded-full"
        >
          ✕
        </button>
      </div>
      <video
        ref={preview}
        autoPlay
        muted
        playsInline
        aria-label={t('preview')}
        className="mb-3 aspect-video w-full rounded-lg bg-black object-contain"
      />
      <h3 className="mb-2 text-sm font-semibold">{t('bg')}</h3>
      {!ok ? (
        <p className="text-muted-foreground text-sm">{t('unsupported')}</p>
      ) : !cam ? (
        <p className="text-muted-foreground text-sm">{t('noCam')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {thumb('none', t('bgNone'))}
            {thumb('blur', t('bgBlur'))}
            {PRESETS.map((p) => (
              <div key={p}>
                {thumb(`p:${p}`, t(`bgs.${p}`), `/backgrounds/${p}.svg`)}
              </div>
            ))}
            {/* 움직이는 배경 — 데스크톱(넓은 화면·마우스)만. 매 프레임 장면을 그려 휴대폰에선 무겁다 */}
            {desk &&
              SCENE_IDS.map((s) => (
                <div key={s}>{thumb(`a:${s}`, t(`scenes.${s}`))}</div>
              ))}
            {mine.map((m, i) => (
              <div key={m.id} className="relative">
                {/* 장마다 다른 이름 — 모두 '내 이미지'면 낭독기 사용자가 어느 것을 고르고 지우는지 구별하지 못한다 */}
                {thumb(`m:${m.id}`, t('myItem', { n: i + 1 }), m.url, m.blob)}
                <button
                  type="button"
                  onClick={() => void del(m.id)}
                  aria-label={t('myDel', { n: i + 1 })}
                  className="absolute -top-1 -left-1 h-6 w-6 rounded-full bg-black/80 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            <label
              // 파일 입력은 sr-only 라 포커스가 보이지 않는다 — 키보드로 Tab 해 온 자리를 타일 테두리로 보여 준다(WCAG 2.4.7)
              className={`${tile} bg-surface-raised focus-within:ring-accent grid cursor-pointer place-items-center border-dashed border-white/20 focus-within:ring-2`}
            >
              ＋ {t('myAdd')}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">{t('myNote')}</p>
        </>
      )}
      <FxRows ctx={ctx} />
      {err && (
        <p role="alert" className="text-danger mt-2 text-sm">
          {t(err)}
        </p>
      )}
    </dialog>
  )
}

// 저절로 꺼짐 경고(느려서·연속 실패) — 3초(polite, 설계 15.5·15.12). 공용 토스트 줄(15.6)에 portal 로 붙는다 —
//  따로 absolute top-3 이면 좌상단 녹화 배지·새 설문 토스트와 겹쳤다(야간 시험 r5 T10). 비어 있을 땐 줄 맨 뒤(order-last)
function AutoOffToast() {
  const t = useTranslations('room.effects')
  const key = useStore(autoOff)
  const slot = useStageSlot(TOAST_SLOT_ID)
  useEffect(() => {
    if (!key) return
    const id = setTimeout(() => autoOff.set(null), 3000)
    return () => clearTimeout(id)
  }, [key])
  if (!slot) return null
  return createPortal(
    <div role="status" aria-live="polite" className={key ? 'max-w-full' : 'order-last'}>
      {key && (
        <span className="bg-warning inline-block rounded-full px-4 py-2 text-sm font-semibold text-black">
          {t(key)}
        </span>
      )}
    </div>,
    slot,
  )
}

function Overlay({ ctx }: { ctx: RoomCtx; barShown: boolean }) {
  return (
    <>
      <EffectsSheet ctx={ctx} />
      <AutoOffToast />
    </>
  )
}

export const backgrounds: RoomFeature = {
  id: 'backgrounds',
  more: [
    {
      id: 'effects',
      label: 'effects.title',
      icon: <span aria-hidden>✨</span>,
      roles: ['presenter', 'panel'],
      sheet: true,
      onClick: () => open.set(true),
    },
  ],
  Overlay,
  effect: { order: BG.order, on: bgOn, draw },
  onReset: () => {
    open.set(false)
    reset()
  },
}

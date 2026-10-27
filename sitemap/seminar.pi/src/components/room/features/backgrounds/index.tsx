'use client'
// 배경 효과(SA5, 설계서 15.5) — ⋯ '효과' → 효과 시트(미리보기·배경 : 없음·흐리게·기본 6종·내 이미지). 고르면 바로 적용(미리보기 = 송출본).
// 무대 역할(presenter·panel)만. 효과 순서 10(조명 20 보다 먼저). 성능이 15fps 미만 3초면 자동 끔 + 경고 토스트(rules.slowWatch).
// 조명·소음 줄은 SA3 가 같은 시트에 붙인다(통합 때 이 시트의 '배경' 절 아래)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { featureStore, useStore, type RoomCtx, type RoomFeature } from '../../extensions'
import { canProcessVideo } from '../../effects'
import { autoOff, bgOn, canSegment, choice, choose, draw, reset, status } from './engine'
import { addMine, listMine, removeMine, type MyImage } from './my-images'
import { checkMine, PRESETS } from './rules'

const open = featureStore(false)

function EffectsSheet({ ctx }: { ctx: RoomCtx }) {
  const t = useTranslations('room.effects')
  const isOpen = useStore(open)
  const cur = useStore(choice)
  const busy = useStore(status) === 'loading'
  const ref = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const [mine, setMine] = useState<(MyImage & { url: string })[]>([])
  const [err, setErr] = useState<string | null>(null)
  const cam = ctx.r.localStream?.getVideoTracks()[0]
  const ok = isOpen && canProcessVideo() && canSegment() // 시트가 열렸을 때만 판정(닫힌 시트는 렌더 내용이 보이지 않는다)
  const { hold } = ctx

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
      .then((l) => alive && setMine(l.map((m) => ({ ...m, url: URL.createObjectURL(m.blob) }))))
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
    const e = await choose(`m:${id}`, f)
    if (e) return e === 'superseded' ? undefined : setErr(e) // 디코드 실패면 밀려났어도 저장하지 않는다
    try {
      await addMine(f, id)
      const l = await listMine()
      setMine(l.map((x) => ({ ...x, url: URL.createObjectURL(x.blob) })))
    } catch {
      setErr('bgFailed')
    }
  }
  const del = async (id: string) => {
    if (cur === `m:${id}`) await choose('none')
    await removeMine(id).catch(() => {})
    setMine((l) => l.filter((m) => m.id !== id).map((m) => ({ ...m, url: URL.createObjectURL(m.blob) }))) // 이전 목록 URL 은 정리 effect 가 해제
  }

  const tile = 'relative aspect-video min-h-12 overflow-hidden rounded-lg border-2 text-xs font-semibold'
  // 썸네일 버튼 — 컴포넌트가 아니라 함수 호출(렌더마다 새 컴포넌트가 되어 다시 마운트되지 않게)
  const thumb = (id: string, label: string, img?: string, blob?: Blob) => {
    const sel = cur === id
    return (
      <button
        type="button"
        aria-pressed={sel}
        aria-label={label}
        disabled={busy && !sel && id !== 'none'} // '없음'은 모델을 받는 중에도 눌러 취소할 수 있게(choose 의 pick 토큰)
        onClick={() => void pickIt(id, blob)}
        className={`${tile} bg-surface-raised ${sel ? 'border-accent' : 'border-transparent'}`}
        style={img ? { backgroundImage: `url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {!img && label}
        {sel && busy && <span className="absolute inset-0 grid place-items-center bg-black/60">{t('preparing')}</span>}
        {sel && !busy && <span className="bg-accent absolute top-1 right-1 rounded-full px-1 text-white">✓</span>}
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
        <button type="button" onClick={() => open.set(false)} aria-label={t('close')} className="h-9 w-9 rounded-full">
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
              <div key={p}>{thumb(`p:${p}`, t(`bgs.${p}`), `/backgrounds/${p}.svg`)}</div>
            ))}
            {mine.map((m) => (
              <div key={m.id} className="relative">
                {thumb(`m:${m.id}`, t('myAdd'), m.url, m.blob)}
                <button
                  type="button"
                  onClick={() => void del(m.id)}
                  aria-label={t('myDel')}
                  className="absolute -top-1 -left-1 h-6 w-6 rounded-full bg-black/80 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            <label className={`${tile} bg-surface-raised grid cursor-pointer place-items-center border-dashed border-white/20`}>
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
      {err && (
        <p role="alert" className="text-danger mt-2 text-sm">
          {t(err)}
        </p>
      )}
    </dialog>
  )
}

// 성능 자동 끔 경고 — 3초(polite, 설계 15.5·15.12)
function AutoOffToast() {
  const t = useTranslations('room.effects')
  const at = useStore(autoOff)
  useEffect(() => {
    if (!at) return
    const id = setTimeout(() => autoOff.set(0), 3000)
    return () => clearTimeout(id)
  }, [at])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
      {at > 0 && (
        <span className="bg-warning rounded-full px-4 py-2 text-sm font-semibold text-black">
          {t('autoOff')}
        </span>
      )}
    </div>
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
  effect: { order: 10, on: bgOn, draw },
  onReset: () => {
    open.set(false)
    reset()
  },
}

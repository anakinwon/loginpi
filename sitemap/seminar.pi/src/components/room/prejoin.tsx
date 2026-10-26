'use client'
// 대기실(S3) — 발표자 : 카메라 미리보기·마이크/카메라 토글, 청중 : 카메라 요청 없이 [입장] 하나(권한 팝업 0회). 설계서 5.1·14.5
// 카메라·마이크 권한이 거부돼도 입장은 막지 않는다(카메라 실패 → 음성만, 마이크 실패 → 영상만, 둘 다 실패 → 미디어 없이)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MediaButton } from './control-bar'
import { StreamVideo } from './stage'
import type { MediaKind, Role } from './use-room'

// 장치 상태 — 문구는 우선순위 1개만(둘 다 실패 none → 소리 실패 videoOnly → 영상 실패 audioOnly → 정상 ok, 설계서 14.5)
type MediaStatus = 'pending' | 'ok' | 'audioOnly' | 'videoOnly' | 'none'
type Preview = { role: Role; stream: MediaStream | null; status: MediaStatus }

const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 } }

// 둘 다 → 소리만 → 영상만 순서로 시도 — 마이크만 거부·카메라 정상이면 영상만이라도 보낸다.
// alive() 가 false 면(청중으로 전환·화면 떠남) 다음 시도를 하지 않는다 — 청중은 권한 팝업 0회(설계서 5.1)
async function getPreview(alive: () => boolean): Promise<MediaStream | null> {
  const md = navigator.mediaDevices
  if (!md?.getUserMedia) return null
  for (const c of [{ video: VIDEO, audio: true }, { audio: true }, { video: VIDEO }]) {
    if (!alive()) return null
    const s = await md.getUserMedia(c).catch(() => null)
    if (s) return s
  }
  return null
}

function statusOf(s: MediaStream | null): MediaStatus {
  const a = !!s?.getAudioTracks().length
  const v = !!s?.getVideoTracks().length
  return a && v ? 'ok' : v ? 'videoOnly' : a ? 'audioOnly' : 'none'
}

export function Prejoin({
  room,
  name,
  canPresent,
  role,
  onRole,
  onJoin,
}: {
  room: string
  name: string
  canPresent: boolean
  role: Role
  onRole: (r: Role) => void
  onJoin: (local: MediaStream | null) => void
}) {
  const t = useTranslations('room')
  // 미리보기는 요청한 역할과 묶어 둔다 — 역할을 바꾼 직후(새 미리보기 로딩 중)엔 이전 결과를 쓰지 않는다(입장·토글 경합 방지)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [on, setOn] = useState({ audio: true, video: true })
  const streamRef = useRef<MediaStream | null>(null)
  const handed = useRef(false)

  useEffect(() => {
    if (role !== 'presenter') return
    let alive = true
    getPreview(() => alive).then((s) => {
      if (!alive) return s?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = s
      setOn({ audio: true, video: true }) // 새 트랙은 켜진 상태로 온다 — 토글 표시를 맞춘다
      setPreview({ role, stream: s, status: statusOf(s) })
    })
    return () => {
      alive = false
      // 입장으로 넘긴 스트림은 룸이 소유 — 넘기지 않은 미리보기만 끈다
      if (!handed.current) streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
      setPreview(null) // 다음 역할의 미리보기가 올 때까지 pending — 이전 결과로 입장하지 않게
    }
  }, [role])

  const presenter = role === 'presenter'
  const cur = presenter && preview?.role === role ? preview : null
  const status: MediaStatus = cur?.status ?? 'pending'
  const stream = cur?.stream ?? null

  function toggle(kind: MediaKind) {
    const next = !on[kind]
    stream?.getTracks().forEach((tr) => {
      if (tr.kind === kind) tr.enabled = next
    })
    setOn((p) => ({ ...p, [kind]: next }))
  }

  function join() {
    if (presenter && status === 'pending') return
    handed.current = presenter
    onJoin(presenter ? stream : null)
  }

  // 카메라 없이 입장(설계서 5.1·P7) — 영상 트랙을 끄고 빼서 음성만 발행. 남는 트랙이 없으면 미디어 없이
  function joinNoCam() {
    if (!stream) return join()
    stream.getVideoTracks().forEach((tr) => {
      tr.stop()
      stream.removeTrack(tr)
    })
    if (stream.getTracks().length) return join()
    handed.current = true
    onJoin(null)
  }

  const hasVideo = !!stream?.getVideoTracks().length

  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-bold">{t('title', { room })}</h1>

      {presenter ? (
        <div className="bg-surface relative aspect-video overflow-hidden rounded-xl">
          {hasVideo && <StreamVideo stream={stream} mirror className={on.video ? '' : 'invisible'} />}
          {status !== 'ok' && (
            <p className="text-muted-foreground absolute inset-0 grid place-items-center p-4 text-center text-sm">
              {t(`preview.${status}`)}
            </p>
          )}
          {stream && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
              {(['audio', 'video'] as const).map((k) =>
                stream.getTracks().some((tr) => tr.kind === k) ? (
                  <MediaButton key={k} kind={k} on={on[k]} onClick={() => toggle(k)} />
                ) : null,
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="bg-surface text-muted-foreground rounded-xl p-4 text-sm">{t('audienceHint')}</p>
      )}

      <p className="text-sm">
        <span className="text-muted-foreground">{t('nameLabel')}</span> <b>{name}</b>
      </p>

      {canPresent && (
        <div role="radiogroup" aria-label={t('joinAs')} className="flex gap-2">
          {(['presenter', 'audience'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => onRole(r)}
              className={`flex-1 rounded-full border px-3 py-2 text-sm ${role === r ? 'border-accent bg-accent/20' : 'border-white/15'}`}
            >
              {t(r)}
            </button>
          ))}
        </div>
      )}

      {/* 연결 점검은 입장 후(대기실엔 엔진 연결이 없음 — 설계 편차, connection-check.tsx) */}
      {presenter && <p className="text-muted-foreground text-xs">{t('net.afterJoin')}</p>}

      <button
        type="button"
        onClick={join}
        disabled={presenter && status === 'pending'}
        className="bg-accent h-12 w-full rounded-full font-semibold text-white disabled:opacity-40"
      >
        {/* 카메라를 못 쓰는 발표자에겐 기본 버튼이 곧 "카메라 없이 입장" */}
        {presenter && status !== 'pending' && !hasVideo ? t('joinNoCam') : t('join')}
      </button>
      {presenter && hasVideo && (
        <button
          type="button"
          onClick={joinNoCam}
          className="h-11 w-full rounded-full border border-white/15 text-sm font-medium"
        >
          {t('joinNoCam')}
        </button>
      )}
    </section>
  )
}

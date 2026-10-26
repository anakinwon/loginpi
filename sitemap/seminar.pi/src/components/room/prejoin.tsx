'use client'
// 대기실(S3) — 발표자 : 카메라 미리보기·마이크/카메라 토글, 청중 : 카메라 요청 없이 [입장] 하나(권한 팝업 0회). 설계서 5.1·14.5
// 카메라·마이크 권한이 거부돼도 입장은 막지 않는다(카메라 실패 → 음성만, 둘 다 실패 → 미디어 없이)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MediaButton } from './control-bar'
import { StreamVideo } from './stage'
import type { MediaKind, Role } from './use-room'

type MediaStatus = 'pending' | 'ok' | 'audioOnly' | 'none'

async function getPreview(): Promise<MediaStream | null> {
  const md = navigator.mediaDevices
  if (!md?.getUserMedia) return null
  return md
    .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true })
    .catch(() => md.getUserMedia({ audio: true }).catch(() => null))
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
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<MediaStatus>('pending')
  const [on, setOn] = useState({ audio: true, video: true })
  const streamRef = useRef<MediaStream | null>(null)
  const handed = useRef(false)

  useEffect(() => {
    if (role !== 'presenter') return
    let alive = true
    getPreview().then((s) => {
      if (!alive) return s?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = s
      setStream(s)
      setStatus(!s ? 'none' : s.getVideoTracks().length ? 'ok' : 'audioOnly')
    })
    return () => {
      alive = false
      // 입장으로 넘긴 스트림은 룸이 소유 — 넘기지 않은 미리보기만 끈다
      if (!handed.current) streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
  }, [role])

  function toggle(kind: MediaKind) {
    const next = !on[kind]
    stream?.getTracks().forEach((tr) => {
      if (tr.kind === kind) tr.enabled = next
    })
    setOn((p) => ({ ...p, [kind]: next }))
  }

  function join() {
    handed.current = true
    onJoin(role === 'presenter' ? streamRef.current : null)
  }

  const presenter = role === 'presenter'
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-lg font-bold">{t('title', { room })}</h1>

      {presenter ? (
        <div className="bg-surface relative aspect-video overflow-hidden rounded-xl">
          {status === 'ok' && <StreamVideo stream={stream} mirror className={on.video ? '' : 'invisible'} />}
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

      <button
        type="button"
        onClick={join}
        disabled={presenter && status === 'pending'}
        className="bg-accent h-12 w-full rounded-full font-semibold text-white disabled:opacity-40"
      >
        {t('join')}
      </button>
    </section>
  )
}

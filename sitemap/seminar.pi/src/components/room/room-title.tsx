'use client'
// 룸 제목 줄 — '섬 이름 - 부제'(sql/011·012). 개최자·ADMIN 은 제목을 눌러 부제를 바로 고친다(PATCH /api/seminars/[id], 서버가 권한 재확인).
//  저장 뒤 룸 신호 refresh{what:'title'} 로 다른 참가자 화면이 제목을 다시 읽는다(features/naming)
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { smnTitle, SUB_TTL_MAX } from '@/lib/seminar-rules'
import { useStore } from './extensions'
import { titleNotify, titleVer } from './features/naming'

type Info = { island: string; subTitle: string; isHost: boolean }

export function RoomTitle({ id, island, subTitle }: { id: string; island: string; subTitle: string }) {
  const t = useTranslations('room.roomTitle')
  const ver = useStore(titleVer)
  const [info, setInfo] = useState<Info>({ island, subTitle, isHost: false })
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  // 개최자 여부·최신 부제 — 처음 1번 + 제목 변경 신호를 받을 때마다
  useEffect(() => {
    let live = true
    void readApi<Info>(piFetch(`/api/seminars/${id}`)).then((r) => {
      if (live && r.ok) setInfo({ island: r.data.island, subTitle: r.data.subTitle, isHost: r.data.isHost })
    })
    return () => {
      live = false
    }
  }, [id, ver])

  const title = smnTitle(info.island, info.subTitle)

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const sub = String(new FormData(e.currentTarget).get('sub') ?? '').trim()
    setBusy(true)
    const r = await readApi<{ subTitle: string }>(
      piFetch(`/api/seminars/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subTitle: sub }),
      }),
    )
    setBusy(false)
    if (!r.ok) return setErr(true)
    setInfo((x) => ({ ...x, subTitle: r.data.subTitle }))
    setEdit(false)
    setErr(false)
    void titleNotify.current?.() // 지금 방에 있는 사람은 바로 다시 읽고, 새로 오는 사람은 입장 때 서버에서 최신 제목을 읽는다
  }

  if (edit)
    return (
      <form onSubmit={(e) => void save(e)} className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">{info.island} -</span>
        <input
          name="sub"
          defaultValue={info.subTitle}
          maxLength={SUB_TTL_MAX}
          autoFocus
          aria-label={t('label')}
          placeholder={t('placeholder')}
          onKeyDown={(e) => e.key === 'Escape' && setEdit(false)}
          className="bg-surface-raised h-10 min-w-0 flex-1 rounded-lg px-3"
        />
        <button type="submit" disabled={busy} className="bg-accent h-10 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50">
          {t('save')}
        </button>
        <button type="button" onClick={() => setEdit(false)} className="bg-surface-raised h-10 rounded-full px-4 text-sm">
          {t('cancel')}
        </button>
        {err && (
          <p role="alert" className="text-danger w-full text-sm">
            {t('failed')}
          </p>
        )}
      </form>
    )
  return (
    <h1 className="mb-3 text-lg font-bold break-words">
      {info.isHost ? (
        <button type="button" onClick={() => setEdit(true)} title={t('edit')} className="text-left hover:underline">
          {title} <span aria-hidden className="text-muted-foreground text-sm">✏️</span>
          <span className="sr-only">{t('edit')}</span>
        </button>
      ) : (
        title
      )}
    </h1>
  )
}

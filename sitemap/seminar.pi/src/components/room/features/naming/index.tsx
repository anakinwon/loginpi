'use client'
// 룸 이름 바꾸기(마스터 2026-10-28) — ① ⋯ '내 이름 바꾸기' : 이 세미나 안 별명 저장(sql/014) 후 내 화면은 바로, 다른 사람은 refresh{what:'name'} 신호로
//  ② 룸 제목(섬 이름 - 부제)을 개최자가 눌러 부제 수정(room-title.tsx) — 저장 뒤 refresh{what:'title'} 로 다른 화면이 제목을 다시 읽는다
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { readApi } from '@/lib/client-api'
import { isUuid, NCKNM_MAX, parseNameSignal } from '@/lib/seminar-rules'
import { featureStore, useStore, type RoomCtx, type RoomFeature } from '../../extensions'

const renameOpen = featureStore(false)
export const titleVer = featureStore(0) // 받은 제목 변경 신호 수 — room-title 이 구독해 다시 읽는다
// 룸 밖(제목 줄)에서 신호를 보내려고 룸 맥락의 sendApp 을 잡아 둔다(룸이 없으면 null)
export const roomSend: { current: RoomCtx['sendApp'] | null } = { current: null }

function RenameSheet({ ctx }: { ctx: RoomCtx }) {
  const t = useTranslations('room.rename')
  const isOpen = useStore(renameOpen)
  const ref = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const me = ctx.r.peers.find((p) => p.peerId === ctx.r.selfId)?.name ?? ''
  const { hold } = ctx
  useEffect(() => {
    roomSend.current = ctx.sendApp
  })
  useEffect(() => () => void (roomSend.current = null), [])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (isOpen && !d.open) d.showModal()
    else if (!isOpen && d.open) d.close()
    hold(isOpen)
    if (isOpen) setErr(null)
  }, [isOpen, hold])

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (!name || name === me) return renameOpen.set(false)
    setBusy(true)
    const r = await readApi<{ name: string }>(
      piFetch(`/api/seminars/${ctx.seminarId}/ncknm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    )
    setBusy(false)
    if (!r.ok) return setErr(t(r.body.code === 'NAME_TAKEN' ? 'taken' : 'failed'))
    await ctx.r.renameSelf(r.data.name) // 신호 실패(구 엔진)여도 저장은 됐다 — 다른 사람은 다음 입장부터 새 이름
    renameOpen.set(false)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="rename-title"
      onClose={() => renameOpen.set(false)}
      className="bg-surface text-foreground m-auto w-[min(92vw,360px)] rounded-xl p-5 backdrop:bg-black/50"
    >
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <h2 id="rename-title" className="font-bold">
          {t('title')}
        </h2>
        {isOpen && (
          <input
            name="name"
            defaultValue={me}
            maxLength={NCKNM_MAX}
            required
            autoFocus
            aria-label={t('title')}
            className="bg-surface-raised h-11 w-full rounded-lg px-3"
          />
        )}
        <p className="text-muted-foreground text-xs">{t('hint')}</p>
        {err && (
          <p role="alert" className="text-danger text-sm">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => renameOpen.set(false)} className="bg-surface-raised h-10 rounded-full px-4 text-sm">
            {t('cancel')}
          </button>
          <button type="submit" disabled={busy} className="bg-accent h-10 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export const naming: RoomFeature = {
  id: 'naming',
  more: [
    {
      id: 'rename',
      label: 'rename.menu',
      icon: <span aria-hidden>✏️</span>,
      roles: ['presenter', 'panel', 'audience'],
      sheet: true,
      onClick: (ctx) => {
        if (isUuid(ctx.seminarId)) renameOpen.set(true) // 실험실 방은 세미나가 없어 저장할 곳이 없다
      },
    },
  ],
  Overlay: ({ ctx }) => (isUuid(ctx.seminarId) ? <RenameSheet ctx={ctx} /> : null),
  onApp: (m) => {
    if (m.topic === 'refresh' && parseNameSignal(m.d)?.what === 'title') titleVer.set((v) => v + 1)
  },
  onReset: () => renameOpen.reset(),
}

'use client'
// 부가 기능 공용 시트(설계서 15.2·15.12) — 기본 <dialog>.showModal()(포커스 가둠·Esc 닫기·닫으면 연 버튼으로 포커스 복귀 내장).
// 모바일 = 하단 서랍(최대 80dvh), 데스크톱(sm↑) = 가운데 360px. 열려 있는 동안 하단 바 자동 숨김 보류(ctx.hold)
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ICON, Icon } from '../control-bar'
import type { RoomCtx } from '../extensions'

export function Sheet({
  open,
  onClose,
  title,
  ctx,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  ctx: RoomCtx
  children: ReactNode
}) {
  const t = useTranslations('room')
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  // ctx.hold 는 렌더마다 새 함수라 최신 것을 ref 로 — 효과는 open 이 바뀔 때만
  const hold = useRef(ctx.hold)
  useEffect(() => {
    hold.current = ctx.hold
  })
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
    if (!open) return
    hold.current(true)
    return () => hold.current(false)
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      className="bg-surface text-foreground mx-auto mt-auto mb-0 max-h-[80dvh] w-full rounded-t-xl p-5 backdrop:bg-black/60 sm:m-auto sm:w-[360px] sm:rounded-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id={id} className="font-bold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('sheetClose')}
          className="hover:bg-surface-raised inline-flex h-10 w-10 items-center justify-center rounded-full"
        >
          <Icon d={ICON.close} small />
        </button>
      </div>
      <div className="space-y-3 text-sm">{children}</div>
    </dialog>
  )
}

// 시트 안 켜기/끄기 = 네이티브 체크박스 + role="switch"(15.12)
export function SwitchRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent h-5 w-5"
      />
    </label>
  )
}

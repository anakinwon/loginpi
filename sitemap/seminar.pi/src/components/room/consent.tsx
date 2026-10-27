'use client'
// 마이크 동의(계획서 A-6·M-4, 설계서 15.7) — 말하는 역할(발표자·무대 승격)이 마이크를 처음 송출하기 직전 1회. 청중은 음성을 보내지 않아 대기실 고지만.
// 기록 = 서버(/api/seminars/[id]/consent, piFetch) + 이 기기(localStorage — DB 미적용·네트워크 실패여도 같은 방에서 다시 묻지 않게).
// 취소 = 마이크 꺼진 채 참여 계속(입장은 막지 않음). 음성 처리 기능(consent)이 하나도 등록되지 않으면 enabled=false 로 아무것도 묻지 않는다
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { isUuid } from '@/lib/seminar-rules'

const localKey = (room: string) => `smn.agre.${room}`

function readLocal(room: string) {
  try {
    return !!localStorage.getItem(localKey(room))
  } catch {
    return false
  }
}

// enabled = 음성 처리 기능이 있고 내가 말할 수 있는 역할(발표 가능·무대). 서버 조회는 enabled 가 처음 켜질 때 1번
export function useConsent(room: string, enabled: boolean) {
  const [agreed, setAgreed] = useState(false)
  const [open, setOpen] = useState(false)
  const agreedRef = useRef(false)
  const waiting = useRef<((ok: boolean) => void) | null>(null)
  const mark = () => {
    agreedRef.current = true
    setAgreed(true)
  }

  useEffect(() => {
    if (!enabled || agreedRef.current) return
    if (readLocal(room)) return mark()
    if (!isUuid(room)) return // 실험실 방 — 서버 기록 없음, 묻기만
    let alive = true
    piFetch(`/api/seminars/${room}/consent`)
      .then((r) => (r.ok ? (r.json() as Promise<{ agreed?: boolean }>) : null))
      .then((j) => {
        if (alive && j?.agreed) mark()
      })
      .catch(() => {}) // 모르면 물어본다
    return () => {
      alive = false
    }
  }, [enabled, room])

  // 마이크를 켜기 직전에 부른다 — true = 켜도 됨
  function ask(): Promise<boolean> {
    if (!enabled || agreedRef.current) return Promise.resolve(true)
    waiting.current?.(false) // 이전 질문이 남아 있으면 취소로 끝낸다
    setOpen(true)
    return new Promise((resolve) => {
      waiting.current = resolve
    })
  }

  function answer(ok: boolean) {
    setOpen(false)
    if (ok) {
      mark()
      try {
        localStorage.setItem(localKey(room), new Date().toISOString())
      } catch {
        // localStorage 차단 — 서버 기록만
      }
      // 서버 기록 실패(DB 미적용·네트워크)는 마이크를 막지 않는다 — 이 기기 기록으로 계속 [확인중 : sql/008 적용 후 운영 검증]
      if (isUuid(room)) void piFetch(`/api/seminars/${room}/consent`, { method: 'POST' }).catch(() => {})
    }
    waiting.current?.(ok)
    waiting.current = null
  }

  // needed = 지금 마이크를 켜려면 물어야 하나(동기 판정 — 필요 없을 땐 기존 흐름을 한 틱도 늦추지 않게)
  return { agreed, needed: enabled && !agreed, open, ask, answer }
}

// 동의 대화상자 — 기본 <dialog>(포커스 가둠·Esc = 취소 내장). 처리방침은 새 탭(룸을 떠나지 않게)
export function ConsentDialog({ open, onAnswer }: { open: boolean; onAnswer: (ok: boolean) => void }) {
  const t = useTranslations('room.consent')
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])
  const btn = 'h-9 shrink-0 rounded-full px-4 text-sm font-semibold'
  return (
    <dialog
      ref={ref}
      aria-labelledby="consent-title"
      onCancel={(e) => {
        e.preventDefault()
        onAnswer(false)
      }}
      className="bg-surface text-foreground m-auto w-[min(92vw,440px)] rounded-xl p-6 backdrop:bg-black/60"
    >
      <h2 id="consent-title" className="mb-2 font-bold">
        {t('title')}
      </h2>
      <p className="text-muted-foreground mb-2 text-sm">{t('body')}</p>
      <Link href="/privacy" target="_blank" rel="noopener" className="text-accent mb-4 inline-block text-sm underline">
        {t('privacy')} ↗
      </Link>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onAnswer(false)} className={`${btn} bg-surface-raised`}>
          {t('cancel')}
        </button>
        <button type="button" onClick={() => onAnswer(true)} className={`${btn} bg-accent text-white`}>
          {t('agree')}
        </button>
      </div>
    </dialog>
  )
}

// 대기실 고지(청중 포함 전원) — 입장 버튼 아래 한 줄 + 처리방침(새 탭)
export function ConsentNotice() {
  const t = useTranslations('room.consent')
  return (
    <p className="text-muted-foreground text-xs">
      {t('notice')}{' '}
      <Link href="/privacy" target="_blank" rel="noopener" className="underline">
        {t('privacy')} ↗
      </Link>
    </p>
  )
}

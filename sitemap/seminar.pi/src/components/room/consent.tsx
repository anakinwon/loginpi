'use client'
// 마이크 동의(계획서 A-6·M-4, 설계서 15.7) — 말하는 역할(발표자·무대 승격)이 마이크를 처음 송출하기 직전 1회. 청중은 음성을 보내지 않아 대기실 고지만.
// 기록 정본 = 서버(/api/seminars/[id]/consent → smn_agr, piFetch). 이 기기(localStorage, 사용자별 키)는 서버가 미적용(stored:false)·응답 없음일 때만 대신 쓰고,
//  서버에 기록이 없는데 이 기기엔 동의가 있으면(전에 POST 실패) 1회 다시 기록한다. 음성 조각이 SPEECH_NO_AGR 을 받으면 reset → 다시 묻는다.
// 답 3가지 : 동의 = 마이크 + 음성 처리 / 동의 안 함 = 마이크만(음성 처리 없음 — 선택 동의 거부로 말하기를 막지 않는다, 개인정보 보호법 22조 5항) /
//  닫기(Esc) = 이번 마이크 켜기 취소. 음성 처리 기능(consent)이 하나도 등록되지 않으면 enabled=false 로 아무것도 묻지 않는다
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { isUuid } from '@/lib/seminar-rules'
import { consentPlan } from './room-rules'

// 답 — true 동의 · false 동의 안 함(마이크는 켠다) · null 취소(마이크를 켜지 않는다)
export type ConsentAnswer = boolean | null

const localKey = (room: string, userId: string) => `smn.agr.${room}.${userId}`

function readLocal(key: string) {
  try {
    return !!localStorage.getItem(key)
  } catch {
    return false
  }
}

// enabled = 음성 처리 기능이 있고 내가 말할 수 있는 역할(발표 가능·무대). 서버 조회는 enabled 가 처음 켜질 때 1번
export function useConsent(room: string, userId: string, enabled: boolean) {
  const [agreed, setAgreed] = useState(false)
  const [declined, setDeclined] = useState(false) // 이번 화면에서 '동의 안 함' — 마이크를 켤 때마다 다시 묻지 않는다
  const [open, setOpen] = useState(false)
  const agreedRef = useRef(false)
  const waiting = useRef<((a: ConsentAnswer) => void) | null>(null)
  const key = localKey(room, userId)
  const url = `/api/seminars/${room}/consent`
  const mark = () => {
    agreedRef.current = true
    setAgreed(true)
  }
  const post = () =>
    piFetch(url, { method: 'POST' })
      .then((r) => r.ok)
      .catch(() => false)

  useEffect(() => {
    if (!enabled || agreedRef.current) return
    const local = readLocal(key)
    if (!isUuid(room)) return void (local && mark()) // 실험실 방 — 서버 기록 없음, 이 기기 기록만
    let alive = true
    void (async () => {
      const j = (await piFetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as { agreed?: boolean; stored?: boolean } | null
      if (!alive) return
      const plan = consentPlan(j, local)
      if (plan === 'mark') mark()
      // 서버엔 없고 이 기기엔 있음 = 전에 기록 POST 가 실패 → 1회 다시 기록(실패하면 마이크 켤 때 다시 묻는다)
      else if (plan === 'repost' && (await post()) && alive) mark()
    })()
    return () => {
      alive = false
    }
  }, [enabled, room, key]) // eslint-disable-line react-hooks/exhaustive-deps

  // 마이크를 켜기 직전에 부른다 — 물을 필요가 없으면 바로 true
  function ask(): Promise<ConsentAnswer> {
    if (!enabled || agreedRef.current) return Promise.resolve(true)
    waiting.current?.(null) // 이전 질문이 남아 있으면 취소로 끝낸다
    setOpen(true)
    return new Promise((resolve) => {
      waiting.current = resolve
    })
  }

  function answer(a: ConsentAnswer) {
    setOpen(false)
    if (a === true) {
      mark()
      try {
        localStorage.setItem(key, new Date().toISOString())
      } catch {
        // localStorage 차단 — 서버 기록만
      }
      // 서버 기록 실패(DB 미적용·네트워크)는 마이크를 막지 않는다 — 다음 입장 때 위 조회가 다시 기록하고, 음성 조각이 NO_AGR 이면 다시 묻는다
      if (isUuid(room)) void post()
    } else if (a === false) setDeclined(true)
    waiting.current?.(a)
    waiting.current = null
  }

  // 서버에 동의 기록이 없다(음성 조각 SPEECH_NO_AGR) — 이 기기 기록을 지우고 처음 상태로. 부른 쪽이 이어서 ask()
  function reset() {
    try {
      localStorage.removeItem(key)
    } catch {
      // 무시
    }
    agreedRef.current = false
    setAgreed(false)
    setDeclined(false)
  }

  // needed = 지금 마이크를 켜려면 물어야 하나(동기 판정 — 필요 없을 땐 기존 흐름을 한 틱도 늦추지 않게)
  return { agreed, needed: enabled && !agreed && !declined, open, ask, answer, reset }
}

// 동의 대화상자 — 기본 <dialog>(포커스 가둠·Esc = 이번 켜기 취소 내장). 처리방침은 새 탭(룸을 떠나지 않게)
export function ConsentDialog({ open, onAnswer }: { open: boolean; onAnswer: (a: ConsentAnswer) => void }) {
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
        onAnswer(null)
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
          {t('decline')}
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

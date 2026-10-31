'use client'
// 마이크 동의(계획서 A-6·M-4, 설계서 15.7) — 말하는 역할(발표자·무대 승격)이 마이크를 처음 송출하기 직전 1회. 청중은 음성을 보내지 않아 대기실 고지만.
// 기록 정본 = 서버(/api/seminars/[id]/consent → smn_agr, piFetch). 이 기기(localStorage, 사용자별 키)는 서버가 미적용(stored:false)·응답 없음일 때만 대신 쓰고,
//  서버에 기록이 없는데 이 기기엔 동의가 있으면(전에 POST 실패) 1회 다시 기록한다. 음성 조각이 SPEECH_NO_AGR 을 받으면 reset → 다시 묻는다.
//  기록 POST 를 서버가 거절(4xx — 참가 등록 없음·종료)하면 이 기기 기록·동의를 되돌리고 onFail(상태코드)로 1회 알린다(consentKeepLocal, F-U A3) —
//  전에는 결과를 버려 동의할 때마다 NO_AGR → 다시 묻기가 반복됐다. 네트워크·5xx 는 전처럼 이 기기 기록으로 버틴다.
// 대화상자 : showModal 없는 옛 WebView 는 open 속성 폴백, 첫 포커스는 [동의] 버튼, 처리방침 링크는 Pi Browser(authenticate 성공 신호, UA 아님)면
//  새 탭 대신 같은 탭(Pi Browser 는 새 탭이 막힐 수 있다 — DEVICE_TEST 1절, F-U A4)
// 답 3가지 : 동의 = 마이크 + 음성 처리 / 동의 안 함 = 마이크만(음성 처리 없음 — 선택 동의 거부로 말하기를 막지 않는다, 개인정보 보호법 22조 5항) /
//  닫기(Esc) = 이번 마이크 켜기 취소. 음성 처리 기능(consent)이 하나도 등록되지 않으면 enabled=false 로 아무것도 묻지 않는다
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch, usePiAuth } from '@pi/auth/client'
import { Link } from '@/i18n/navigation'
import { isUuid } from '@/lib/seminar-rules'
import { consentKeepLocal, consentPlan } from './room-rules'

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

// enabled = 음성 처리 기능이 있고 내가 말할 수 있는 역할(발표 가능·무대). 서버 조회는 enabled 가 처음 켜질 때 1번. onFail = 서버가 동의 기록을 거절(HTTP 상태)
export function useConsent(room: string, userId: string, enabled: boolean, onFail?: (status: number) => void) {
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
  // 기록 POST — ok 아니면 status 로 consentKeepLocal 판정(네트워크 = 0)
  const post = () =>
    piFetch(url, { method: 'POST' })
      .then((r) => ({ ok: r.ok, status: r.status }))
      .catch(() => ({ ok: false, status: 0 }))

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
      // 서버엔 없고 이 기기엔 있음 = 전에 기록 POST 가 실패 → 1회 다시 기록(실패하면 마이크 켤 때 다시 묻는다). 서버가 거절(4xx)하면 이 기기 기록도 지운다
      else if (plan === 'repost') {
        const p = await post()
        if (!alive) return
        if (p.ok) mark()
        else if (!consentKeepLocal(p.status)) reset()
      }
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
      // 서버 기록 실패(DB 미적용·네트워크)는 마이크를 막지 않는다 — 다음 입장 때 위 조회가 다시 기록한다.
      //  서버가 거절(4xx)하면 동의를 되돌리고(음성 조각이 나가지 않게) 1회 알린다 — 마이크는 켜진 채(음성 처리만 빠짐)
      if (isUuid(room))
        void post().then((p) => {
          if (p.ok || consentKeepLocal(p.status)) return
          reset()
          onFail?.(p.status)
        })
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

// 동의 대화상자 — 기본 <dialog>(포커스 가둠·Esc = 이번 켜기 취소 내장). 처리방침은 새 탭(룸을 떠나지 않게, Pi Browser 는 같은 탭)
export function ConsentDialog({ open, onAnswer }: { open: boolean; onAnswer: (a: ConsentAnswer) => void }) {
  const t = useTranslations('room.consent')
  const ref = useRef<HTMLDialogElement>(null)
  const agreeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    // ponytail: open 속성 폴백(showModal 없는 옛 WebView [확인중])은 포커스 가둠·backdrop 없음 — 그 기기가 실재하면 폴리필
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
      // 첫 포커스를 처리방침 링크가 아니라 [동의] 버튼으로 — 탭 한 번에 링크가 눌려 룸을 떠나지 않게(React autoFocus 는 마운트 때라 닫힌 dialog 엔 안 먹힘)
      agreeRef.current?.focus()
    } else if (!open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
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
      <PrivacyLink className="text-accent mb-4 inline-block text-sm underline" />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onAnswer(false)} className={`${btn} bg-surface-raised`}>
          {t('decline')}
        </button>
        <button ref={agreeRef} type="button" onClick={() => onAnswer(true)} className={`${btn} bg-accent text-white`}>
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
      <PrivacyLink className="underline" />
    </p>
  )
}

// 처리방침 링크 — 새 탭(룸을 떠나지 않게). Pi Browser(authenticate 성공 신호만 — UA 판정 금지)는 새 탭이 막힐 수 있어 같은 탭 이동(동의는 돌아와 재마운트 때 다시 묻는다)
function PrivacyLink({ className }: { className: string }) {
  const t = useTranslations('room.consent')
  const { isInPiBrowser } = usePiAuth()
  if (isInPiBrowser)
    return (
      <Link href="/privacy" className={className}>
        {t('privacy')}
      </Link>
    )
  return (
    <Link href="/privacy" target="_blank" rel="noopener" className={className}>
      {t('privacy')} <NewTab label={t('newTab')} />
    </Link>
  )
}

// 새 탭 표시 — 화살표는 낭독기가 '오른쪽 위 화살표'로 읽으므로 숨기고, 새 탭에서 열린다는 사실을 글로 알린다(WCAG 3.2.5)
export function NewTab({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden>↗</span>
      <span className="sr-only">{label}</span>
    </>
  )
}

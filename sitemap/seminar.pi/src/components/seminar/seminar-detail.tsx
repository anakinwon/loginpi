'use client'

// S2 세미나 상세 — 정보 + 버튼 1개(UI 설계서 5절). 무료 = "입장"(POST join → /s/[id]/join), 유료 = "Pi 로 결제하고 입장"
//  (Pi createPayment → approve → complete(서버가 참가 등록) → /join), 이미 등록 = "입장" 바로. 정원·종료·취소는 버튼 대신 안내.
//  금액은 서버 상세 값(서버 approve 가 DB 정가로 다시 검증), memo 는 ASCII(™ 금지), 호출은 전부 piFetch(X-Pi-Token). 비로그인 = LoginGate(redirect 없음)
//  결제 가능 판정은 UA 가 아니라 usePiAuth().isInPiBrowser(authenticate 성공 신호)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { piFetch, usePiAuth } from '@pi/auth/client'
import { useAppUser } from '@/components/google-auth'
import { LoginGate } from '@/components/login-gate'
import { Link, useRouter } from '@/i18n/navigation'
import { readApi } from '@/lib/client-api'
import { formatFee } from '@/lib/seminar-rules'
import {
  BTN,
  BTN_PRIMARY,
  useSeminarErrText,
  useStartText,
  type SeminarCard,
} from './shared'

type Detail = SeminarCard & {
  seatsLeft: number
  registered: boolean | null
  isHost: boolean
}

const CALLBACK_TIMEOUT_MS = 120_000 // 지갑 서명 대기 포함 상한

const post = (path: string, body?: unknown) =>
  readApi<{ ok: true }>(
    piFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

export function SeminarDetail({ id }: { id: string }) {
  const t = useTranslations('seminar')
  const errText = useSeminarErrText()
  const start = useStartText()
  const { user } = useAppUser()
  const userId = user?.userId ?? null
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  // 로그인 상태가 바뀌면 내 등록 상태를 다시 받는다
  useEffect(() => {
    let live = true
    void readApi<Detail>(piFetch(`/api/seminars/${id}`)).then((r) => {
      if (!live) return
      if (r.ok) {
        setD(r.data)
        setErr(null)
      } else setErr(r.status === 404 ? t('notFound') : errText(r.body))
    })
    return () => {
      live = false
    }
  }, [id, userId, reload, t, errText])

  if (err)
    return (
      <div role="alert" className="bg-surface space-y-3 rounded-xl p-4 text-sm">
        <p>{err}</p>
        <Link href="/" className={BTN}>
          {t('back')}
        </Link>
      </div>
    )
  if (!d) return <p className="text-muted-foreground text-sm">{t('loading')}</p>

  const fee = formatFee(d.fee)
  return (
    <article className="space-y-6">
      <Link href="/" className="text-muted-foreground text-sm hover:underline">
        ← {t('back')}
      </Link>
      <header className="space-y-2">
        <h1 className="text-2xl font-bold break-words">{d.title}</h1>
        <p className="text-muted-foreground text-sm">{t(`status.${d.status}`)}</p>
      </header>
      <dl className="bg-surface grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl p-4 text-sm">
        <dt className="text-muted-foreground">{t('startAt')}</dt>
        <dd>{start(d.startAt)}</dd>
        <dt className="text-muted-foreground">{t('host')}</dt>
        <dd>{d.host || '—'}</dd>
        <dt className="text-muted-foreground">{t('seats')}</dt>
        <dd>{t('seatsValue', { left: d.seatsLeft, max: d.maxCnt })}</dd>
        <dt className="text-muted-foreground">{t('fee')}</dt>
        <dd>{fee ? t('feeValue', { amount: fee }) : t('free')}</dd>
      </dl>
      {d.isHost && (
        <Link href={`/s/${d.id}/join`} className={BTN}>
          {t('roomLink')}
        </Link>
      )}
      <LoginGate>
        {() => <Action d={d} fee={fee} onChanged={() => setReload((n) => n + 1)} />}
      </LoginGate>
    </article>
  )
}

function Action({
  d,
  fee,
  onChanged,
}: {
  d: Detail
  fee: string | null
  onChanged: () => void
}) {
  const t = useTranslations('seminar')
  const errText = useSeminarErrText()
  const router = useRouter()
  const { isInPiBrowser } = usePiAuth()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settled = useRef(false)
  const joinPath = `/s/${d.id}/join`

  if (d.status === 'CANCELED') return <Notice text={t('canceled')} />
  if (d.status === 'ENDED') return <Notice text={t('closed')} />
  if (d.registered)
    return (
      <div className="space-y-2">
        <p className="text-speaking text-sm">{t('registered')}</p>
        <Link href={joinPath} className={BTN_PRIMARY}>
          {t('enter')}
        </Link>
      </div>
    )
  if (d.seatsLeft <= 0) return <Notice text={t('full')} />

  // 첫 실패 문구만 남긴다 — 서버 거부(FULL 등) 뒤 SDK 가 onCancel·onError 를 이어 불러도 원인 문구를 덮지 않게
  const fail = (text: string) => {
    if (settled.current) return
    settled.current = true
    if (timer.current) clearTimeout(timer.current)
    setMsg(text)
    setBusy(false)
    onChanged() // 좌석·상태가 바뀌었을 수 있다
  }

  async function joinFree() {
    settled.current = false
    setBusy(true)
    setMsg(null)
    const r = await post(`/api/seminars/${d.id}/join`)
    if (r.ok) router.push(joinPath)
    else fail(errText(r.body))
  }

  function pay() {
    // Pi SDK 는 일반 브라우저에도 주입되므로 window.Pi 존재로는 부족 — authenticate 성공 세션만 결제
    if (!isInPiBrowser || !window.Pi) return setMsg(t('piBrowserOnly'))
    settled.current = false
    setBusy(true)
    setMsg(null)
    let currentId: string | null = null
    timer.current = setTimeout(() => fail(t('payTimeout')), CALLBACK_TIMEOUT_MS)
    try {
      window.Pi.createPayment(
        {
          amount: d.fee,
          memo: `seminar.pi entry ${d.id.slice(0, 8)}`,
          metadata: { type: 'SMN_ENT', smn_id: d.id },
        },
        {
          onReadyForServerApproval: async (paymentId) => {
            currentId = paymentId
            const r = await post('/api/payments/approve', { paymentId })
            if (!r.ok) fail(errText(r.body))
          },
          onReadyForServerCompletion: async (paymentId, txid) => {
            const r = await post('/api/payments/complete', { paymentId, txid })
            if (r.ok) {
              settled.current = true
              if (timer.current) clearTimeout(timer.current)
              router.push(joinPath)
            } else fail(errText(r.body))
          },
          onCancel: (paymentId) => {
            void post('/api/payments/cancel', { paymentId: paymentId || currentId })
            fail(t('payCancelled'))
          },
          onError: (e, p) => {
            const pid = p?.identifier || currentId
            if (pid) void post('/api/payments/cancel', { paymentId: pid })
            fail(e?.message || t('payFailed'))
          },
        },
      )
    } catch (e) {
      fail(e instanceof Error ? e.message : t('payFailed'))
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={BTN_PRIMARY}
        disabled={busy}
        onClick={() => (fee ? pay() : void joinFree())}
      >
        {busy ? t(fee ? 'paying' : 'joining') : fee ? t('payEnter', { amount: fee }) : t('enter')}
      </button>
      {fee && !isInPiBrowser && (
        <p className="text-muted-foreground text-xs">{t('piBrowserOnly')}</p>
      )}
      {msg && (
        <p role="alert" className="text-danger text-sm">
          {msg}
        </p>
      )}
    </div>
  )
}

function Notice({ text }: { text: string }) {
  return <p className="bg-surface rounded-xl p-4 text-sm">{text}</p>
}

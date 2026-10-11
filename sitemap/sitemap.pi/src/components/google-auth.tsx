'use client'

// 로그인 통합 클라이언트(마스터 지시 2026-10-11, cafe.pi 방식) — Pi Browser = Pi SDK 세션(usePiAuth), 일반 브라우저 = Google(NextAuth) 세션.
//  useAppUser : 두 세션을 하나의 user 로 합친다(Pi 우선). Google 은 Pi 계정과 연동(sys_usr_auth_lnk)된 경우에만 user 가 된다.
//  연동 흐름 : Pi Browser 로그인 사용자가 코드 발급(PiLinkCodeIssuer) → 일반 브라우저 Google 세션이 코드 입력(LinkCodeForm) → update() 로 세션 갱신.
//  Google 버튼은 NEXT_PUBLIC_GOOGLE_LOGIN=1 일 때만 노출. UA 판정 없음.
import { useCallback, useEffect, useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { piFetch, usePiAuth, type PiSessionUser } from '@pi/auth/client'
import { env } from '@/env'
import { readApi, useApiErrorText } from '@/lib/client-api'

export const googleLoginEnabled = env.NEXT_PUBLIC_GOOGLE_LOGIN === '1'

type MeUser = {
  id: string
  username: string | null
  displayName: string
  role: string
}

// /api/auth/me 응답을 게이트 children 이 기대하는 PiSessionUser 모양으로(Google 경로는 uid·scope 없음)
const toSessionUser = (u: MeUser): PiSessionUser => ({
  userId: u.id,
  uid: '',
  displayName: u.displayName,
  username: u.username,
  walletAddress: null,
  scopesGranted: [],
  tokenValidUntil: '',
  role: u.role,
})

export function useAppUser() {
  const pi = usePiAuth()
  const { data: session, status, update } = useSession()
  const [googleUser, setGoogleUser] = useState<PiSessionUser | null>(null)
  const [meLoading, setMeLoading] = useState(false)
  const linkedId = session?.user?.id || null

  // react-hooks/set-state-in-effect 경고 1건 — 세션 변화에 따른 서버 재조회(외부 시스템 동기화)라 의도된 패턴
  const refresh = useCallback(async () => {
    if (!linkedId) {
      setGoogleUser(null)
      return
    }
    setMeLoading(true)
    const r = await readApi<{ user: MeUser | null }>(
      fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' }),
    )
    setGoogleUser(r.ok && r.data.user ? toSessionUser(r.data.user) : null)
    setMeLoading(false)
  }, [linkedId])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const user = pi.user ?? googleUser
  return {
    user,
    source: pi.user ? ('pi' as const) : googleUser ? ('google' as const) : null,
    isLoading: pi.isLoading || status === 'loading' || meLoading,
    // Google 로그인은 됐지만 Pi 계정 미연동 — 코드 입력 안내 대상
    googleUnlinked: !pi.user && status === 'authenticated' && !linkedId,
    googleEmail: session?.user?.email ?? null,
    piError: pi.error,
    refreshGoogle: async () => {
      await update()
      await refresh()
    },
  }
}

export function GoogleLoginButton({
  className = 'btn',
}: {
  className?: string
}) {
  const t = useTranslations('auth')
  if (!googleLoginEnabled) return null
  return (
    <button
      type="button"
      className={className}
      onClick={() => void signIn('google')}
    >
      {t('google')}
    </button>
  )
}

export function GoogleSignOutButton() {
  const t = useTranslations('auth')
  return (
    <button
      type="button"
      className="btn text-sm"
      onClick={() => void signOut({ callbackUrl: '/' })}
    >
      {t('signOut')}
    </button>
  )
}

// 일반 브라우저(Google 세션, 미연동) — 연동 코드 입력
export function LinkCodeForm({ onLinked }: { onLinked?: () => void }) {
  const t = useTranslations('link')
  const errText = useApiErrorText()
  const { refreshGoogle, googleEmail } = useAppUser()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <form
      className="card flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const r = await readApi(
          piFetch('/api/auth/link-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          }),
        )
        if (r.ok) {
          setMsg({ ok: true, text: t('done') })
          await refreshGoogle()
          onLinked?.()
        } else setMsg({ ok: false, text: errText(r.body) })
        setBusy(false)
      }}
    >
      <p className="font-medium">{t('enterTitle')}</p>
      {googleEmail && (
        <p className="text-muted-foreground text-xs">{googleEmail}</p>
      )}
      <p className="text-sm">{t('enterHint')}</p>
      <input
        className="input font-mono tracking-widest"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-label={t('codeLabel')}
        required
      />
      {msg && (
        <p
          className={msg.ok ? 'text-sm' : 'text-destructive text-sm'}
          role={msg.ok ? 'status' : 'alert'}
        >
          {msg.text}
        </p>
      )}
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={busy || code.length !== 6}
        >
          {t('submit')}
        </button>
        <GoogleSignOutButton />
      </div>
    </form>
  )
}

// Pi Browser(Pi 세션) — 연동 코드 발급
export function PiLinkCodeIssuer() {
  const t = useTranslations('link')
  const errText = useApiErrorText()
  const [issued, setIssued] = useState<{
    code: string
    expiresAt: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 남은 분 — 렌더 중 Date.now() 금지(react-hooks/purity) → 1분 간격으로 state 갱신
  const [minutesLeft, setMinutesLeft] = useState(0)
  useEffect(() => {
    if (!issued) return
    const exp = new Date(issued.expiresAt).getTime()
    const tick = () =>
      setMinutesLeft(Math.max(0, Math.ceil((exp - Date.now()) / 60000)))
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [issued])

  return (
    <div className="card flex flex-col gap-2">
      <p className="font-medium">{t('piIssueTitle')}</p>
      <p className="text-sm">{t('codeHint')}</p>
      {issued ? (
        <>
          <p className="font-mono text-3xl tracking-widest" aria-live="polite">
            {issued.code}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('expiresIn', { min: minutesLeft })}
          </p>
        </>
      ) : null}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const r = await readApi<{ code: string; expiresAt: string }>(
              piFetch('/api/auth/link-start', { method: 'POST' }),
            )
            if (r.ok) setIssued(r.data)
            else setError(errText(r.body))
            setBusy(false)
          }}
        >
          {issued ? t('reissue') : t('piIssue')}
        </button>
      </div>
    </div>
  )
}

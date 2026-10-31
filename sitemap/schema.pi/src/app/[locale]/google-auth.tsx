'use client'
// 로그인 통합 클라이언트(sitemap.pi 승계, 마스터 지시 2026-10-16) — Pi Browser = Pi SDK 세션(usePiAuth), 일반 브라우저 = Google(NextAuth) 세션.
//  useAppUser : 두 세션을 하나의 user 로 합친다(Pi 우선). Google 은 Pi 계정과 연동(sys_usr_auth_lnk)된 경우에만 user 가 된다.
//  연동 흐름 : Pi Browser 로그인 사용자가 코드 발급(PiLinkCodeIssuer) → 일반 브라우저 Google 세션이 코드 입력(LinkCodeForm) → update() 로 세션 갱신.
//  Google 버튼은 NEXT_PUBLIC_GOOGLE_LOGIN=1 일 때만 노출. UA 판정 없음
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useCallback, useEffect, useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { piFetch, usePiAuth, type PiSessionUser } from '@pi/auth/client'

export const googleLoginEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === '1'

type MeUser = { id: string; username: string | null; displayName: string; role: string }

// API 오류 본문 → 표시 문구(schema.pi apiError {message} / @pi/guard {error}), 없으면 화면이 넘긴 번역 문구(fallback)
const errText = (b: unknown, fallback: string) => {
  const o = b as { message?: string; error?: string } | null
  return o?.message ?? o?.error ?? fallback
}
async function readJson<T>(p: Promise<Response>): Promise<{ ok: true; data: T } | { ok: false; body: unknown }> {
  try {
    const r = await p
    const body = (await r.json().catch(() => null)) as unknown
    return r.ok ? { ok: true, data: body as T } : { ok: false, body }
  } catch (e) {
    return { ok: false, body: { message: e instanceof Error ? e.message : undefined } }
  }
}

// /api/auth/me 응답 → 게이트가 기대하는 PiSessionUser 모양(Google 경로는 uid·scope 없음)
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
  const linkUnknown = !!session?.user?.linkUnknown

  const refresh = useCallback(async () => {
    if (!linkedId) {
      setGoogleUser(null)
      return
    }
    setMeLoading(true)
    const r = await readJson<{ user: MeUser | null }>(piFetch('/api/auth/me', { cache: 'no-store' }))
    setGoogleUser(r.ok && r.data.user ? toSessionUser(r.data.user) : null)
    setMeLoading(false)
  }, [linkedId])
  useEffect(() => {
    void refresh()
  }, [refresh])

  // 개발 전용 사용자(쿠키 dev_user, 홈 DevUserSwitch) — 비운영 빌드에서만 마지막 폴백. 운영은 NODE_ENV 상수로 코드 제거 + /api/dev/user 404
  const [devUser, setDevUser] = useState<PiSessionUser | null>(null)
  const [devLoading, setDevLoading] = useState(process.env.NODE_ENV !== 'production')
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    void readJson<{ user: { usr_id: string; pi_usr_nm: string } | null }>(piFetch('/api/dev/user', { cache: 'no-store' })).then((r) => {
      const u = r.ok ? r.data.user : null
      setDevUser(u ? toSessionUser({ id: u.usr_id, username: u.pi_usr_nm, displayName: u.pi_usr_nm, role: 'USER' }) : null)
      setDevLoading(false)
    })
  }, [])

  const user = pi.user ?? googleUser ?? devUser
  return {
    user,
    source: pi.user ? ('pi' as const) : googleUser ? ('google' as const) : devUser ? ('dev' as const) : null,
    isLoading: pi.isLoading || status === 'loading' || meLoading || (devLoading && !pi.user && !googleUser),
    // Google 로그인은 됐지만 Pi 계정 미연동(확정) — 코드 입력 안내 대상
    googleUnlinked: !pi.user && status === 'authenticated' && !linkedId && !linkUnknown,
    // Google 로그인은 됐지만 DB 오류로 연동 여부를 모름 — 새로고침 유도
    googleLinkError: !pi.user && status === 'authenticated' && !linkedId && linkUnknown,
    googleEmail: session?.user?.email ?? null,
    piError: pi.error,
    piSignIn: pi.signIn,
    piSignOut: pi.signOut,
    // 인자를 넘겨야 POST(/api/auth/session) → jwt 콜백 재실행으로 연동 재조회(sitemap.pi 실측 2026-10-11)
    refreshGoogle: async () => {
      await update({ linked: true })
      await refresh()
    },
  }
}

const BTN = 'rounded border border-gray-300 px-3 py-1.5 text-sm'
const BTN_PRIMARY = 'rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50'

export function GoogleLoginButton({ className = BTN }: { className?: string }) {
  const t = useTranslations('auth')
  if (!googleLoginEnabled) return null
  return (
    <button type="button" className={className} onClick={() => void signIn('google')}>
      {t('googleSignIn')}
    </button>
  )
}

export function GoogleSignOutButton() {
  const t = useTranslations('auth')
  return (
    <button type="button" className={BTN} onClick={() => void signOut({ callbackUrl: '/' })}>
      {t('signOut')}
    </button>
  )
}

export function LinkCheckFailed() {
  const t = useTranslations('auth')
  return (
    <p className="text-sm text-red-600" role="alert">
      {t('linkCheckFailed')}
    </p>
  )
}

// 일반 브라우저(Google 세션, 미연동) — 연동 코드 입력
export function LinkCodeForm({ onLinked }: { onLinked?: () => void }) {
  const { refreshGoogle, googleEmail } = useAppUser()
  const t = useTranslations()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <form
      className="flex max-w-sm flex-col gap-2 rounded border border-gray-200 p-4"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const r = await readJson(
          piFetch('/api/auth/link-complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }),
        )
        if (r.ok) {
          setMsg({ ok: true, text: t('link.linked') })
          await refreshGoogle()
          onLinked?.()
        } else setMsg({ ok: false, text: errText(r.body, t('common.requestFailed')) })
        setBusy(false)
      }}
    >
      <p className="font-medium">{t('link.codeFormTitle')}</p>
      {googleEmail && <p className="text-xs text-gray-500">{googleEmail}</p>}
      <p className="text-sm">{t('link.codeFormHint')}</p>
      <input
        className="rounded border border-gray-300 px-2 py-1 font-mono tracking-widest"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-label={t('link.codeLabel')}
        required
      />
      {msg && (
        <p className={msg.ok ? 'text-sm' : 'text-sm text-red-600'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <div className="flex gap-2">
        <button className={BTN_PRIMARY} disabled={busy || code.length !== 6}>
          {t('link.submit')}
        </button>
        <GoogleSignOutButton />
      </div>
    </form>
  )
}

// Pi Browser(Pi 세션) — 연동 코드 발급
export function PiLinkCodeIssuer() {
  const t = useTranslations()
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [minutesLeft, setMinutesLeft] = useState(0)
  useEffect(() => {
    if (!issued) return
    const exp = new Date(issued.expiresAt).getTime()
    const tick = () => setMinutesLeft(Math.max(0, Math.ceil((exp - Date.now()) / 60000)))
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [issued])

  return (
    <div className="flex max-w-sm flex-col gap-2 rounded border border-gray-200 p-4">
      <p className="font-medium">{t('link.issuerTitle')}</p>
      <p className="text-sm">{t('link.issuerHint')}</p>
      {issued && (
        <>
          <p className="font-mono text-3xl tracking-widest" aria-live="polite">
            {issued.code}
          </p>
          <p className="text-xs text-gray-500">{t('link.minutesLeft', { minutes: minutesLeft })}</p>
        </>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const r = await readJson<{ code: string; expiresAt: string }>(piFetch('/api/auth/link-start', { method: 'POST' }))
            if (r.ok) setIssued(r.data)
            else setError(errText(r.body, t('common.requestFailed')))
            setBusy(false)
          }}
        >
          {issued ? t('link.reissue') : t('link.issue')}
        </button>
      </div>
    </div>
  )
}

// 계정 연동 패널(/link) — 세션 종류별 분기 : Pi 세션 = 코드 발급 / Google 미연동 = 코드 입력 / Google 연동됨 = 완료 / 없음 = 로그인 안내
export function LinkPanel() {
  const { user, source, isLoading, googleUnlinked, googleLinkError, piSignIn, piError } = useAppUser()
  const t = useTranslations()
  if (isLoading && !user) return <p className="text-sm text-gray-600">{t('auth.checking')}</p>
  if (googleLinkError) return <LinkCheckFailed />
  if (googleUnlinked) return <LinkCodeForm />
  if (user && source === 'google')
    return (
      <p className="text-sm" role="status">
        {t.rich('link.linkedAs', { name: user.username ?? user.displayName, b: (c) => <b>{c}</b> })}{' '}
        <Link href="/" className="underline">
          {t('common.goHome')}
        </Link>
      </p>
    )
  if (user && source === 'pi') return <PiLinkCodeIssuer />
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm">{t('auth.required')}</p>
      <div className="flex gap-2">
        <button type="button" className={BTN_PRIMARY} onClick={() => void piSignIn()}>
          {t('auth.piSignIn')}
        </button>
        <GoogleLoginButton />
      </div>
      {piError && <p className="text-xs text-red-600">{piError}</p>}
    </div>
  )
}

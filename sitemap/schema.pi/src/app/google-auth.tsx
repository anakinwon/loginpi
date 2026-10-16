'use client'
// 로그인 통합 클라이언트(sitemap.pi 승계, 마스터 지시 2026-10-16) — Pi Browser = Pi SDK 세션(usePiAuth), 일반 브라우저 = Google(NextAuth) 세션.
//  useAppUser : 두 세션을 하나의 user 로 합친다(Pi 우선). Google 은 Pi 계정과 연동(sys_usr_auth_lnk)된 경우에만 user 가 된다.
//  연동 흐름 : Pi Browser 로그인 사용자가 코드 발급(PiLinkCodeIssuer) → 일반 브라우저 Google 세션이 코드 입력(LinkCodeForm) → update() 로 세션 갱신.
//  Google 버튼은 NEXT_PUBLIC_GOOGLE_LOGIN=1 일 때만 노출. UA 판정 없음
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { piFetch, usePiAuth, type PiSessionUser } from '@pi/auth/client'

export const googleLoginEnabled = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === '1'

type MeUser = { id: string; username: string | null; displayName: string; role: string }

// API 오류 본문 → 표시 문구(schema.pi apiError {message} / @pi/guard {error})
const errText = (b: unknown) => {
  const o = b as { message?: string; error?: string } | null
  return o?.message ?? o?.error ?? '요청에 실패했습니다'
}
async function readJson<T>(p: Promise<Response>): Promise<{ ok: true; data: T } | { ok: false; body: unknown }> {
  try {
    const r = await p
    const body = (await r.json().catch(() => null)) as unknown
    return r.ok ? { ok: true, data: body as T } : { ok: false, body }
  } catch (e) {
    return { ok: false, body: { message: e instanceof Error ? e.message : '네트워크 오류' } }
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

  const user = pi.user ?? googleUser
  return {
    user,
    source: pi.user ? ('pi' as const) : googleUser ? ('google' as const) : null,
    isLoading: pi.isLoading || status === 'loading' || meLoading,
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
  if (!googleLoginEnabled) return null
  return (
    <button type="button" className={className} onClick={() => void signIn('google')}>
      Google 로그인
    </button>
  )
}

export function GoogleSignOutButton() {
  return (
    <button type="button" className={BTN} onClick={() => void signOut({ callbackUrl: '/' })}>
      로그아웃
    </button>
  )
}

export function LinkCheckFailed() {
  return (
    <p className="text-sm text-red-600" role="alert">
      연동 상태를 확인하지 못했습니다(일시 오류). 잠시 뒤 새로고침하십시오.
    </p>
  )
}

// 일반 브라우저(Google 세션, 미연동) — 연동 코드 입력
export function LinkCodeForm({ onLinked }: { onLinked?: () => void }) {
  const { refreshGoogle, googleEmail } = useAppUser()
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
          setMsg({ ok: true, text: '연동되었습니다.' })
          await refreshGoogle()
          onLinked?.()
        } else setMsg({ ok: false, text: errText(r.body) })
        setBusy(false)
      }}
    >
      <p className="font-medium">Pi 계정 연동 코드 입력</p>
      {googleEmail && <p className="text-xs text-gray-500">{googleEmail}</p>}
      <p className="text-sm">Pi Browser 에서 로그인한 뒤 계정 연동 화면에서 발급한 6자리 코드를 10분 안에 입력하십시오.</p>
      <input
        className="rounded border border-gray-300 px-2 py-1 font-mono tracking-widest"
        inputMode="numeric"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        aria-label="연동 코드"
        required
      />
      {msg && (
        <p className={msg.ok ? 'text-sm' : 'text-sm text-red-600'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <div className="flex gap-2">
        <button className={BTN_PRIMARY} disabled={busy || code.length !== 6}>
          연동
        </button>
        <GoogleSignOutButton />
      </div>
    </form>
  )
}

// Pi Browser(Pi 세션) — 연동 코드 발급
export function PiLinkCodeIssuer() {
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
      <p className="font-medium">Google 계정 연동 코드 발급</p>
      <p className="text-sm">일반 브라우저에서 Google 로그인 뒤 이 코드를 입력하면 같은 사용자로 연결됩니다(10분 유효).</p>
      {issued && (
        <>
          <p className="font-mono text-3xl tracking-widest" aria-live="polite">
            {issued.code}
          </p>
          <p className="text-xs text-gray-500">남은 시간 약 {minutesLeft}분</p>
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
            else setError(errText(r.body))
            setBusy(false)
          }}
        >
          {issued ? '다시 발급' : '코드 발급'}
        </button>
      </div>
    </div>
  )
}

// 계정 연동 패널(/link) — 세션 종류별 분기 : Pi 세션 = 코드 발급 / Google 미연동 = 코드 입력 / Google 연동됨 = 완료 / 없음 = 로그인 안내
export function LinkPanel() {
  const { user, source, isLoading, googleUnlinked, googleLinkError, piSignIn, piError } = useAppUser()
  if (isLoading && !user) return <p className="text-sm text-gray-600">로그인 확인 중…</p>
  if (googleLinkError) return <LinkCheckFailed />
  if (googleUnlinked) return <LinkCodeForm />
  if (user && source === 'google')
    return (
      <p className="text-sm" role="status">
        Google 계정이 Pi 사용자 <b>{user.username ?? user.displayName}</b> 와 연동되어 있습니다.{' '}
        <Link href="/" className="underline">
          홈으로
        </Link>
      </p>
    )
  if (user && source === 'pi') return <PiLinkCodeIssuer />
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm">로그인이 필요합니다.</p>
      <div className="flex gap-2">
        <button type="button" className={BTN_PRIMARY} onClick={() => void piSignIn()}>
          Pi 계정으로 로그인
        </button>
        <GoogleLoginButton />
      </div>
      {piError && <p className="text-xs text-red-600">{piError}</p>}
    </div>
  )
}

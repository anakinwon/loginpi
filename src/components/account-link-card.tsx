'use client'

import { useEffect, useState } from 'react'
import {
  signIn as googleSignIn,
  signOut as googleSignOut,
  useSession,
} from 'next-auth/react'
import { useLocale } from 'next-intl'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePiAuth } from './pi-auth-provider'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { LinkStatusResponse } from '@/app/api/auth/link-status/route'

export function AccountLinkCard() {
  const {
    user: piUser,
    piAccessToken,
    isLoading: piLoading,
    signIn: piSignIn,
    signOut: piSignOut,
    isInPiBrowser,
  } = usePiAuth()
  const { data: googleSession } = useSession()
  const locale = useLocale()

  // 로그인된 세션(Pi·Google)만 로그아웃 버튼 노출 — 헤더에서 제거한 로그아웃을 여기로 이전.
  const isLoggedIn = !!piUser || !!googleSession?.user

  // 활성 세션 정리: Pi(토큰·쿠키 → router.refresh) + Google(NextAuth → 홈 리다이렉트).
  // 연동 계정이면 양쪽 다 정리. Google이 있으면 리다이렉트가 최종 처리.
  async function handleLogout() {
    if (piUser) await piSignOut()
    if (googleSession?.user) await googleSignOut({ callbackUrl: `/${locale}` })
  }

  const [genStatus, setGenStatus] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle')
  const [code, setCode] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [linkUrlCopied, setLinkUrlCopied] = useState(false)

  // DB 기반 연동 상태
  const [linkStatus, setLinkStatus] = useState<LinkStatusResponse | null>(null)
  const [linkStatusLoading, setLinkStatusLoading] = useState(true)

  const displayCode = code ? `${code.slice(0, 3)}-${code.slice(3)}` : ''

  const generateUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/link?generate=1`
      : 'https://loginpi.vercel.app/link?generate=1'

  // 세션이 준비되면 DB에서 실제 연동 상태 조회
  // Pi Browser WebView는 쿠키 미전송 → X-Pi-Token 헤더 폴백
  useEffect(() => {
    if (piLoading) return
    setLinkStatusLoading(true)
    fetch('/api/auth/link-status', {
      credentials: 'include',
      headers: {
        ...(piAccessToken ? { 'X-Pi-Token': piAccessToken } : {}),
      },
    })
      .then((r) => r.json())
      .then((data: LinkStatusResponse) => setLinkStatus(data))
      .catch(() =>
        setLinkStatus({ linked: false, piUsername: null, googleEmail: null }),
      )
      .finally(() => setLinkStatusLoading(false))
  }, [piLoading, piUser, piAccessToken, googleSession?.user])

  async function generateCode(isRetry = false) {
    setGenStatus('loading')
    setCode('')
    setErrMsg('')
    try {
      const res = await fetch('/api/auth/link-start', {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(piAccessToken ? { 'X-Pi-Token': piAccessToken } : {}),
        },
      })
      const data = (await res.json()) as { code?: string; error?: string }
      if (res.status === 401 && !isRetry) {
        await piSignIn()
        return generateCode(true)
      }
      if (!res.ok || !data.code) throw new Error(data.error ?? '코드 생성 실패')
      setCode(data.code)
      setGenStatus('done')
    } catch (err) {
      setGenStatus('error')
      setErrMsg(err instanceof Error ? err.message : '오류 발생')
    }
  }

  async function copyGenerateUrl() {
    try {
      await navigator.clipboard.writeText(generateUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 복사 실패 시 무시
    }
  }

  // 코드 포함된 연동 URL 복사 — Pi Browser에서 일반 브라우저로 전달하기 위한 유일한 방법
  async function copyLinkUrl() {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://loginpi.vercel.app'
    const url = `${origin}/link?code=${code}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkUrlCopied(true)
      setTimeout(() => setLinkUrlCopied(false), 4000)
    } catch {
      // 복사 실패 시 무시
    }
  }

  // ── 로딩 중 ──────────────────────────────────────────
  if (piLoading || linkStatusLoading) {
    return (
      <Card>
        <LinkCardHeader showLogout={isLoggedIn} onLogout={handleLogout} />
        <CardContent>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <div className="border-muted-foreground h-3 w-3 animate-spin rounded-full border border-t-transparent" />
            연동 상태 확인 중…
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── 연동 완료 ────────────────────────────────────────
  if (linkStatus?.linked) {
    return (
      <Card>
        <LinkCardHeader showLogout={isLoggedIn} onLogout={handleLogout} />
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
              ✓ Pi + Google 계정 연동 완료
            </p>
            {linkStatus.piUsername && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Pi Network</span>
                <span className="font-medium">@{linkStatus.piUsername}</span>
              </div>
            )}
            {linkStatus.googleEmail && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Google</span>
                <span className="max-w-[160px] truncate font-medium">
                  {linkStatus.googleEmail}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── 연동 미완료 ──────────────────────────────────────
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">계정 연동</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <StatusRow
          label="Pi Network"
          connected={!!linkStatus?.piUsername}
          value={
            linkStatus?.piUsername ? `@${linkStatus.piUsername}` : undefined
          }
        />
        <StatusRow
          label="Google"
          connected={!!linkStatus?.googleEmail || !!googleSession?.user}
          value={
            linkStatus?.googleEmail ?? googleSession?.user?.email ?? undefined
          }
        />

        <div className="space-y-3 border-t pt-3">
          {piUser ? (
            /* Pi 세션 있음 → 코드 생성 UI */
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                아래 버튼으로 코드를 생성하고, 일반 브라우저의{' '}
                <span className="text-foreground font-mono">/link</span>{' '}
                페이지에 입력하세요.
              </p>
              <Button
                size="sm"
                className="w-full"
                disabled={genStatus === 'loading'}
                onClick={() => generateCode()}
              >
                {genStatus === 'loading'
                  ? '코드 생성 중…'
                  : genStatus === 'done'
                    ? '새 코드 생성'
                    : '연동 코드 생성'}
              </Button>

              {genStatus === 'done' && displayCode && (
                <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border-2 p-4 text-center">
                  <p className="text-muted-foreground text-xs">
                    연동 코드 (일반 브라우저에서 입력)
                  </p>
                  <p className="text-primary font-mono text-4xl font-bold tracking-widest">
                    {displayCode}
                  </p>
                  <p className="text-muted-foreground text-xs">10분 내 사용</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 w-full"
                    onClick={copyLinkUrl}
                  >
                    {linkUrlCopied
                      ? '✓ 복사됨! 일반 브라우저에서 붙여넣기 하세요'
                      : '연동하러가기 → (URL 복사)'}
                  </Button>
                  {linkUrlCopied && (
                    <p className="text-muted-foreground text-center text-xs">
                      Chrome, Safari 등 일반 브라우저 주소창에 붙여넣어
                      접속하세요
                    </p>
                  )}
                </div>
              )}

              {genStatus === 'error' && (
                <p className="text-destructive text-xs">{errMsg}</p>
              )}
            </div>
          ) : (
            /* Pi 세션 없음 (일반 브라우저) */
            <>
              {!googleSession?.user && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => googleSignIn('google')}
                >
                  Google로 먼저 로그인
                </Button>
              )}

              {/* Pi Browser 진입 안내 — Pi Browser에서만 표시 */}
              {isInPiBrowser && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Pi Browser에서 할 일
                  </p>
                  <p className="text-muted-foreground text-xs">
                    아래 링크를 복사해서 Pi Browser 주소창에 입력하세요.
                  </p>
                  <div className="flex gap-1.5">
                    <code className="bg-background flex-1 truncate rounded border px-2 py-1 font-mono text-xs">
                      {generateUrl}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs"
                      onClick={copyGenerateUrl}
                    >
                      {copied ? '복사됨!' : '복사'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Pi 미연결 상태에서만 코드 입력 버튼 표시 */}
              {!linkStatus?.piUsername && (
                <Link
                  href="/link"
                  className={cn(
                    buttonVariants({ size: 'sm' }),
                    'w-full text-center',
                  )}
                >
                  연동 코드 입력하러 가기 →
                </Link>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// 계정 연동 카드 헤더 — 제목 좌측 + 로그아웃 버튼 우측 상단(로그인 상태에서만 노출).
function LinkCardHeader({
  showLogout,
  onLogout,
}: {
  showLogout: boolean
  onLogout: () => void
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between pb-3">
      <CardTitle className="text-sm">계정 연동</CardTitle>
      {showLogout && (
        <Button
          variant="outline"
          size="sm"
          className="text-muted-foreground h-7 px-2 text-xs"
          onClick={onLogout}
        >
          로그아웃
        </Button>
      )}
    </CardHeader>
  )
}

function StatusRow({
  label,
  connected,
  value,
}: {
  label: string
  connected: boolean
  value?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="flex-1 truncate text-xs">
        {connected ? (value ?? '연결됨') : '—'}
      </span>
      <span
        className={`shrink-0 text-xs ${
          connected
            ? 'text-green-600 dark:text-green-400'
            : 'text-muted-foreground'
        }`}
      >
        {connected ? '✓ 연결됨' : '미연결'}
      </span>
    </div>
  )
}

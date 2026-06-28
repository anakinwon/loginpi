'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { cn } from '@/lib/utils'

interface CommitInfo {
  sha: string
  message: string
}
interface DeployState {
  configured: { promote: boolean; stagingHook: boolean; prodHook: boolean }
  master: CommitInfo | null
  production: CommitInfo | null
  ahead: number
  behind: number
  commits: CommitInfo[]
  error?: string
}

interface DeploymentStatus {
  configured: boolean
  state: string | null
  url: string | null
  inspectorUrl: string | null
  createdAt: number | null
  error?: string
}

const short = (s?: string) => (s ? s.slice(0, 7) : '—')

const TERMINAL = ['READY', 'ERROR', 'CANCELED']
const STATE_UI: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: '⏳ 대기(QUEUED)', cls: 'bg-muted text-foreground' },
  INITIALIZING: { label: '⏳ 준비(INITIALIZING)', cls: 'bg-muted text-foreground' },
  BUILDING: {
    label: '🔨 빌드 중(BUILDING)',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  READY: {
    label: '✅ 완료(READY)',
    cls: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  },
  ERROR: {
    label: '❌ 실패(ERROR)',
    cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  },
  CANCELED: { label: '⛔ 취소(CANCELED)', cls: 'bg-muted text-muted-foreground' },
}

export default function DeployPage() {
  const [state, setState] = useState<DeployState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'staging' | 'production' | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [status, setStatus] = useState<DeploymentStatus | null>(null)
  const [polling, setPolling] = useState(false)
  const pollStart = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/deploy')
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      setState(await res.json())
    } catch {
      toast.error('배포 상태 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStatus = useCallback(async () => {
    try {
      const res = await piFetch('/api/admin/deploy/status')
      if (!res.ok) return
      const s = (await res.json()) as DeploymentStatus
      setStatus(s)
      if (s.state && TERMINAL.includes(s.state)) setPolling(false)
    } catch {
      /* 폴링 중 일시 오류는 무시 */
    }
  }, [])

  useEffect(() => {
    void load()
    void loadStatus()
  }, [load, loadStatus])

  // 트리거 후 자동 폴링(3초) — 종료상태 도달 또는 4분 경과 시 중단
  useEffect(() => {
    if (!polling) return
    const id = setInterval(() => {
      if (Date.now() - pollStart.current > 4 * 60 * 1000) {
        setPolling(false)
        return
      }
      void loadStatus()
    }, 3000)
    return () => clearInterval(id)
  }, [polling, loadStatus])

  const run = useCallback(
    async (target: 'staging' | 'production') => {
      if (target === 'production') {
        const n = state?.ahead ?? 0
        if (
          !window.confirm(
            `운영(cafepi)에 master ${n}개 커밋을 출시합니다.\nStaging에서 검증 완료됐습니까? 계속하려면 확인을 누르세요.`,
          )
        )
          return
      }
      setBusy(target)
      try {
        const res = await piFetch('/api/admin/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        })
        const data = await res.json()
        if (res.ok && data.ok) {
          toast.success(
            target === 'staging'
              ? 'Stage 재배포를 트리거했습니다(loginpi)'
              : `운영 승격 완료(${short(data.sha)}) — cafepi 배포가 시작됩니다`,
          )
          await load()
          // 새 배포가 등록될 시간을 잠깐 준 뒤 진행상태 폴링 시작
          pollStart.current = Date.now()
          setTimeout(() => {
            setPolling(true)
            void loadStatus()
          }, 2500)
        } else {
          toast.error(data.error || '실패')
        }
      } catch {
        toast.error('요청 실패')
      } finally {
        setBusy(null)
      }
    },
    [state, load],
  )

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">배포 컨트롤</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          이 화면은 <b>MASTER</b> 권한 전용입니다.
        </p>
      </div>
    )

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">배포 컨트롤</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Stage(loginpi·master) 재배포 / 운영(cafepi·production) 승격+배포. 승격은
          fast-forward만 허용됩니다.
        </p>
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {state && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs">운영(production) 현재</p>
              <p className="mt-1 font-mono text-sm">{short(state.production?.sha)}</p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {state.production?.message ?? '—'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs">staging(master) 최신</p>
              <p className="mt-1 font-mono text-sm">{short(state.master?.sha)}</p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {state.master?.message ?? '—'}
              </p>
            </div>
          </div>

          {state.error && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              GitHub 연동 미구성 또는 오류: {state.error} — `GITHUB_DEPLOY_TOKEN` 설정 필요
            </p>
          )}

          <div className="rounded-lg border p-4">
            <p className="text-sm">
              운영에 나갈 커밋:{' '}
              <b className={state.ahead > 0 ? 'text-primary' : ''}>{state.ahead}개</b>
              {state.behind > 0 && (
                <span className="ml-2 text-red-600">
                  ⚠ production이 {state.behind}커밋 앞섬(갈라짐) — 승격 불가
                </span>
              )}
            </p>
            {state.commits.length > 0 && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
                {state.commits.map((c) => (
                  <li key={c.sha} className="text-muted-foreground text-xs">
                    <span className="font-mono">{short(c.sha)}</span> {c.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => run('staging')}
              disabled={busy !== null || !state.configured.stagingHook}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === 'staging' ? '배포 중…' : '🧪 Stage 서버 재배포'}
            </button>
            <button
              onClick={() => run('production')}
              disabled={
                busy !== null ||
                !state.configured.promote ||
                state.ahead === 0 ||
                state.behind > 0
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'production' ? '승격 중…' : '🚀 운영 서버 배포(승격)'}
            </button>
          </div>
          {!state.configured.stagingHook && (
            <p className="text-muted-foreground text-xs">
              · Stage 재배포 비활성: `VERCEL_STAGING_DEPLOY_HOOK` 미설정
            </p>
          )}
          {!state.configured.promote && (
            <p className="text-muted-foreground text-xs">
              · 운영 승격 비활성: `GITHUB_DEPLOY_TOKEN` 미설정
            </p>
          )}

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">최근 Stage 배포 상태</p>
              <button
                onClick={() => void loadStatus()}
                className="text-muted-foreground text-xs hover:underline"
              >
                새로고침
              </button>
            </div>
            {!status?.configured ? (
              <p className="text-muted-foreground mt-2 text-xs">
                앱 내 진행상태 표시는 `VERCEL_API_TOKEN`·`VERCEL_STAGING_PROJECT_ID`
                설정 시 활성화됩니다. 그 전엔 Vercel 대시보드 → loginpi →
                Deployments에서 확인하세요.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      STATE_UI[status.state ?? '']?.cls ?? 'bg-muted',
                    )}
                  >
                    {STATE_UI[status.state ?? '']?.label ?? status.state ?? '—'}
                  </span>
                  {polling && (
                    <span className="text-muted-foreground text-xs">
                      자동 갱신 중…
                    </span>
                  )}
                </div>
                {status.inspectorUrl && (
                  <a
                    href={status.inspectorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-xs hover:underline"
                  >
                    Vercel에서 빌드 로그 보기 ↗
                  </a>
                )}
                {status.error && (
                  <p className="text-xs text-amber-600">조회 오류: {status.error}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

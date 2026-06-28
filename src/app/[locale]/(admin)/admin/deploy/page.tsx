'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { cn } from '@/lib/utils'

interface CommitInfo {
  sha: string
  message: string
}
interface DeploymentStatus {
  configured: boolean
  state: string | null
  url: string | null
  inspectorUrl: string | null
  createdAt: number | null
  commitSha: string | null
  commitMessage: string | null
  error?: string
}
interface DeployOverview {
  configured: {
    promote: boolean
    stagingHook: boolean
    stagingStatus: boolean
    prodStatus: boolean
  }
  master: CommitInfo | null
  staging: { deployed: CommitInfo | null; pending: CommitInfo[]; status: DeploymentStatus }
  production: {
    head: CommitInfo | null
    ahead: number
    behind: number
    commits: CommitInfo[]
    status: DeploymentStatus
  }
  ghError?: string
}

const short = (s?: string | null) => (s ? s.slice(0, 7) : '—')
const TERMINAL = ['READY', 'ERROR', 'CANCELED']
const isActive = (s: string | null) => !!s && !TERMINAL.includes(s)
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

function StatusBlock({
  status,
  polling,
  fallbackHint,
}: {
  status: DeploymentStatus | undefined
  polling: boolean
  fallbackHint: string
}) {
  if (!status?.configured)
    return <p className="text-muted-foreground mt-1 text-xs">{fallbackHint}</p>
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium',
            STATE_UI[status.state ?? '']?.cls ?? 'bg-muted',
          )}
        >
          {STATE_UI[status.state ?? '']?.label ?? status.state ?? '—'}
        </span>
        {polling && isActive(status.state) && (
          <span className="text-muted-foreground text-xs">자동 갱신 중…</span>
        )}
      </div>
      {status.commitSha && (
        <p className="text-muted-foreground text-xs">
          배포된 커밋 <span className="font-mono">{short(status.commitSha)}</span>{' '}
          {status.commitMessage}
        </p>
      )}
      {status.inspectorUrl && (
        <a
          href={status.inspectorUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-xs hover:underline"
        >
          Vercel 빌드 로그 ↗
        </a>
      )}
      {status.error && <p className="text-xs text-amber-600">조회 오류: {status.error}</p>}
    </div>
  )
}

function CommitList({ commits, empty }: { commits: CommitInfo[]; empty: string }) {
  if (commits.length === 0)
    return <p className="text-muted-foreground text-xs">{empty}</p>
  return (
    <ul className="max-h-40 space-y-1 overflow-auto">
      {commits.map((c) => (
        <li key={c.sha} className="text-muted-foreground text-xs">
          <span className="font-mono">{short(c.sha)}</span> {c.message}
        </li>
      ))}
    </ul>
  )
}

export default function DeployPage() {
  const [ov, setOv] = useState<DeployOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'staging' | 'production' | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [statuses, setStatuses] = useState<{
    staging?: DeploymentStatus
    production?: DeploymentStatus
  }>({})
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
      const data = (await res.json()) as DeployOverview
      setOv(data)
      setStatuses({ staging: data.staging.status, production: data.production.status })
    } catch {
      toast.error('배포 상태 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStatuses = useCallback(async () => {
    try {
      const res = await piFetch('/api/admin/deploy/status')
      if (!res.ok) return
      const s = (await res.json()) as {
        staging: DeploymentStatus
        production: DeploymentStatus
      }
      setStatuses(s)
      if (!isActive(s.staging?.state ?? null) && !isActive(s.production?.state ?? null))
        setPolling(false)
    } catch {
      /* 폴링 중 일시 오류 무시 */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!polling) return
    const id = setInterval(() => {
      if (Date.now() - pollStart.current > 4 * 60 * 1000) {
        setPolling(false)
        return
      }
      void loadStatuses()
    }, 3000)
    return () => clearInterval(id)
  }, [polling, loadStatuses])

  const run = useCallback(
    async (target: 'staging' | 'production') => {
      if (target === 'production') {
        const n = ov?.production.ahead ?? 0
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
          pollStart.current = Date.now()
          setTimeout(() => {
            setPolling(true)
            void loadStatuses()
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
    [ov, load, loadStatuses],
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">배포 컨트롤</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Stage(loginpi·master) → 운영(cafepi·production) 2단계. 승격은
            fast-forward만 허용.
          </p>
        </div>
        <button
          onClick={() => {
            void load()
            void loadStatuses()
          }}
          className="text-muted-foreground text-xs hover:underline"
        >
          새로고침
        </button>
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중…</p>}
      {ov?.ghError && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          GitHub 연동 미구성/오류: {ov.ghError} — `GITHUB_DEPLOY_TOKEN` 설정 필요
        </p>
      )}

      {ov && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── 1단: Stage ─────────────────────────────── */}
          <section className="space-y-3 rounded-xl border p-4">
            <h2 className="text-lg font-semibold">🧪 Stage 서버 (loginpi · master)</h2>

            <div>
              <p className="text-muted-foreground text-xs">재배포 대상 (master HEAD)</p>
              {ov.master ? (
                <p className="mt-1 text-sm">
                  <span className="font-mono">{short(ov.master.sha)}</span>{' '}
                  {ov.master.message}
                </p>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">GitHub 미구성</p>
              )}
              {ov.staging.deployed && (
                <p className="text-muted-foreground mt-1 text-xs">
                  현재 배포: <span className="font-mono">{short(ov.staging.deployed.sha)}</span>
                </p>
              )}
              {ov.staging.pending.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-amber-600">
                    ⚠ stage가 master보다 {ov.staging.pending.length}커밋 뒤처짐 — 재배포 필요
                  </p>
                  <CommitList commits={ov.staging.pending} empty="" />
                </div>
              )}
              {ov.staging.deployed &&
                ov.master &&
                ov.staging.deployed.sha === ov.master.sha && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    master 최신과 동기 (재배포 = 현 master 재빌드)
                  </p>
                )}
            </div>

            <button
              onClick={() => run('staging')}
              disabled={busy !== null || !ov.configured.stagingHook}
              className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {busy === 'staging' ? '배포 중…' : '🧪 Stage 서버 재배포'}
            </button>
            {!ov.configured.stagingHook && (
              <p className="text-muted-foreground text-xs">
                · 비활성: `VERCEL_STAGING_DEPLOY_HOOK` 미설정
              </p>
            )}

            <div>
              <p className="text-sm font-medium">최근 Stage 배포 상태</p>
              <StatusBlock
                status={statuses.staging}
                polling={polling}
                fallbackHint="앱 내 표시는 VERCEL_API_TOKEN·VERCEL_STAGING_PROJECT_ID 설정 시. 그 전엔 Vercel 대시보드 → loginpi → Deployments."
              />
            </div>
          </section>

          {/* ── 2단: 운영 ─────────────────────────────── */}
          <section className="space-y-3 rounded-xl border border-primary/30 p-4">
            <h2 className="text-lg font-semibold">🚀 운영 서버 (cafepi · production)</h2>

            <div>
              <p className="text-muted-foreground text-xs">
                승격 대상 (production에 없는 master 커밋)
              </p>
              <p className="mt-1 text-sm">
                <b className={ov.production.ahead > 0 ? 'text-primary' : ''}>
                  {ov.production.ahead}개
                </b>
                {ov.production.behind > 0 && (
                  <span className="ml-2 text-red-600">
                    ⚠ production이 {ov.production.behind}커밋 앞섬 — 승격 불가
                  </span>
                )}
              </p>
              {ov.production.head && (
                <p className="text-muted-foreground mt-1 text-xs">
                  현재 운영: <span className="font-mono">{short(ov.production.head.sha)}</span>{' '}
                  {ov.production.head.message}
                </p>
              )}
              <div className="mt-2">
                <CommitList
                  commits={ov.production.commits}
                  empty="승격할 커밋 없음 (운영이 master 최신과 동기)"
                />
              </div>
            </div>

            <button
              onClick={() => run('production')}
              disabled={
                busy !== null ||
                !ov.configured.promote ||
                ov.production.ahead === 0 ||
                ov.production.behind > 0
              }
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'production' ? '승격 중…' : '🚀 운영 서버 배포(승격)'}
            </button>
            {!ov.configured.promote && (
              <p className="text-muted-foreground text-xs">
                · 비활성: `GITHUB_DEPLOY_TOKEN` 미설정
              </p>
            )}

            <div>
              <p className="text-sm font-medium">최근 운영 배포 상태</p>
              <StatusBlock
                status={statuses.production}
                polling={polling}
                fallbackHint="앱 내 표시는 VERCEL_API_TOKEN·VERCEL_PROD_PROJECT_ID 설정 시. 그 전엔 Vercel 대시보드 → cafepi → Deployments."
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

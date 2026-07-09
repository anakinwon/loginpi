'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { cn } from '@/lib/utils'
import {
  useApiErrorMessage,
  type ApiErrorPayload,
} from '@/hooks/use-api-error'

interface CommitInfo {
  sha: string
  message: string
}
// 서버 ops-deploy의 i18n 에러 디스크립터 — 코드+보간값을 뷰어 언어로 해석
type OpsErr = ApiErrorPayload
interface DeploymentStatus {
  configured: boolean
  state: string | null
  url: string | null
  inspectorUrl: string | null
  createdAt: number | null
  commitSha: string | null
  commitMessage: string | null
  error?: OpsErr
}
interface DeployOverview {
  configured: {
    promote: boolean
    stagingHook: boolean
    stagingStatus: boolean
    prodStatus: boolean
  }
  master: CommitInfo | null
  staging: {
    deployed: CommitInfo | null
    pending: CommitInfo[]
    status: DeploymentStatus
  }
  production: {
    head: CommitInfo | null
    ahead: number
    behind: number
    commits: CommitInfo[]
    status: DeploymentStatus
  }
  ghError?: OpsErr
}

const short = (s?: string | null) => (s ? s.slice(0, 7) : '—')
const TERMINAL = ['READY', 'ERROR', 'CANCELED']
const isActive = (s: string | null) => !!s && !TERMINAL.includes(s)
// CSS 클래스만 모듈 스코프 상수로 유지 — 한글 라벨은 StatusBlock 내부에서 t()로 구성
const STATE_CLS: Record<string, string> = {
  QUEUED: 'bg-muted text-foreground',
  INITIALIZING: 'bg-muted text-foreground',
  BUILDING: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  READY: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  ERROR: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  CANCELED: 'bg-muted text-muted-foreground',
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
  const t = useTranslations('adminOps')
  const apiErr = useApiErrorMessage()
  const stateLabels: Record<string, string> = {
    QUEUED: t('deploy.stateQueued'),
    INITIALIZING: t('deploy.stateInitializing'),
    BUILDING: t('deploy.stateBuilding'),
    READY: t('deploy.stateReady'),
    ERROR: t('deploy.stateError'),
    CANCELED: t('deploy.stateCanceled'),
  }
  if (!status?.configured)
    return <p className="text-muted-foreground mt-1 text-xs">{fallbackHint}</p>
  return (
    <div className="mt-1 space-y-1">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium',
            STATE_CLS[status.state ?? ''] ?? 'bg-muted',
          )}
        >
          {stateLabels[status.state ?? ''] ?? status.state ?? '—'}
        </span>
        {polling && isActive(status.state) && (
          <span className="text-muted-foreground text-xs">
            {t('deploy.autoRefreshing')}
          </span>
        )}
      </div>
      {status.commitSha && (
        <p className="text-muted-foreground text-xs">
          {t('deploy.deployedCommit')}{' '}
          <span className="font-mono">{short(status.commitSha)}</span>{' '}
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
          {t('deploy.vercelBuildLog')}
        </a>
      )}
      {status.error && (
        <p className="text-xs text-amber-600">
          {t('deploy.queryError', { error: apiErr(status.error, '') })}
        </p>
      )}
    </div>
  )
}

function CommitList({
  commits,
  empty,
}: {
  commits: CommitInfo[]
  empty: string
}) {
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
  const t = useTranslations('adminOps')
  const tc = useTranslations('common')
  const apiErr = useApiErrorMessage()
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
      setStatuses({
        staging: data.staging.status,
        production: data.production.status,
      })
    } catch {
      toast.error(t('deploy.loadFail'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadStatuses = useCallback(async () => {
    try {
      const res = await piFetch('/api/admin/deploy/status')
      if (!res.ok) return
      const s = (await res.json()) as {
        staging: DeploymentStatus
        production: DeploymentStatus
      }
      setStatuses(s)
      if (
        !isActive(s.staging?.state ?? null) &&
        !isActive(s.production?.state ?? null)
      )
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
        if (!window.confirm(t('deploy.confirmProd', { n }))) return
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
              ? t('deploy.stageTriggered')
              : t('deploy.prodPromoted', { sha: short(data.sha) }),
          )
          await load()
          pollStart.current = Date.now()
          setTimeout(() => {
            setPolling(true)
            void loadStatuses()
          }, 2500)
        } else {
          toast.error(apiErr(data as ApiErrorPayload, t('deploy.fail')))
        }
      } catch {
        toast.error(t('deploy.reqFail'))
      } finally {
        setBusy(null)
      }
    },
    [ov, load, loadStatuses, t],
  )

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">{t('deploy.title')}</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {t.rich('masterOnly', { b: (c) => <b>{c}</b> })}
        </p>
      </div>
    )

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('deploy.title')}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('deploy.subtitle')}
          </p>
        </div>
        <button
          onClick={() => {
            void load()
            void loadStatuses()
          }}
          className="text-muted-foreground text-xs hover:underline"
        >
          {t('deploy.refresh')}
        </button>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{tc('fetching')}</p>
      )}
      {ov?.ghError && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
          {t('deploy.ghError', { error: apiErr(ov.ghError, '') })}
        </p>
      )}

      {ov && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ── 1단: Stage ─────────────────────────────── */}
          <section className="space-y-3 rounded-xl border p-4">
            <h2 className="text-lg font-semibold">
              {t('deploy.stageHeading')}
            </h2>

            <div>
              <p className="text-muted-foreground text-xs">
                {t('deploy.redeployTarget')}
              </p>
              {ov.master ? (
                <p className="mt-1 text-sm">
                  <span className="font-mono">{short(ov.master.sha)}</span>{' '}
                  {ov.master.message}
                </p>
              ) : (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('deploy.githubNotConfigured')}
                </p>
              )}
              {ov.staging.deployed && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('deploy.currentDeploy')}{' '}
                  <span className="font-mono">
                    {short(ov.staging.deployed.sha)}
                  </span>
                </p>
              )}
              {ov.staging.pending.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-amber-600">
                    {t('deploy.stageBehind', { n: ov.staging.pending.length })}
                  </p>
                  <CommitList commits={ov.staging.pending} empty="" />
                </div>
              )}
              {ov.staging.deployed &&
                ov.master &&
                ov.staging.deployed.sha === ov.master.sha && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {t('deploy.stageInSync')}
                  </p>
                )}
            </div>

            <button
              onClick={() => run('staging')}
              disabled={busy !== null || !ov.configured.stagingHook}
              className="hover:bg-muted w-full rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {busy === 'staging'
                ? t('deploy.deploying')
                : t('deploy.stageRedeploy')}
            </button>
            {!ov.configured.stagingHook && (
              <p className="text-muted-foreground text-xs">
                {t('deploy.stageHookDisabled')}
              </p>
            )}

            <div>
              <p className="text-sm font-medium">
                {t('deploy.stageStatusTitle')}
              </p>
              <StatusBlock
                status={statuses.staging}
                polling={polling}
                fallbackHint={t('deploy.stageFallbackHint')}
              />
            </div>
          </section>

          {/* ── 2단: 운영 ─────────────────────────────── */}
          <section className="border-primary/30 space-y-3 rounded-xl border p-4">
            <h2 className="text-lg font-semibold">{t('deploy.prodHeading')}</h2>

            <div>
              <p className="text-muted-foreground text-xs">
                {t('deploy.promoteTarget')}
              </p>
              <p className="mt-1 text-sm">
                <b className={ov.production.ahead > 0 ? 'text-primary' : ''}>
                  {t('deploy.aheadCount', { n: ov.production.ahead })}
                </b>
                {ov.production.behind > 0 && (
                  <span className="ml-2 text-red-600">
                    {t('deploy.prodAhead', { n: ov.production.behind })}
                  </span>
                )}
              </p>
              {ov.production.head && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('deploy.currentProd')}{' '}
                  <span className="font-mono">
                    {short(ov.production.head.sha)}
                  </span>{' '}
                  {ov.production.head.message}
                </p>
              )}
              <div className="mt-2">
                <CommitList
                  commits={ov.production.commits}
                  empty={t('deploy.noPromoteCommits')}
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
              className="bg-primary text-primary-foreground w-full rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'production'
                ? t('deploy.promoting')
                : t('deploy.prodPromote')}
            </button>
            {!ov.configured.promote && (
              <p className="text-muted-foreground text-xs">
                {t('deploy.promoteDisabled')}
              </p>
            )}

            <div>
              <p className="text-sm font-medium">
                {t('deploy.prodStatusTitle')}
              </p>
              <StatusBlock
                status={statuses.production}
                polling={polling}
                fallbackHint={t('deploy.prodFallbackHint')}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

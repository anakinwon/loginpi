import 'server-only'
import { resolveDbTier } from './db-env'
import type { ApiErrorCode, ApiErrorParams } from './api-errors'

// 운영 도구 백엔드 — 배포(2환경: Stage/운영)·Staging DB 스위치.
// 외부 토큰은 서버 env 전용. 미설정 시 각 기능 '미구성' 비활성(graceful).
// 에러는 i18n 코드 디스크립터(OpsErr)로 반환 — route가 apiError()로 조립, 클라이언트가 뷰어 언어로 해석.

const GH = 'https://api.github.com'
const VERCEL = 'https://api.vercel.com'

// i18n 에러 디스크립터 — 문자열 대신 코드+보간값. 소비처(route)에서 apiError로 조립.
export interface OpsErr {
  code: ApiErrorCode
  params?: ApiErrorParams
}
// 예외(네트워크·런타임) 폴백 — 상세 메시지는 진단용 보간값으로 보존.
function unknownErr(e: unknown): OpsErr {
  return {
    code: 'ADM_OPS_UNKNOWN',
    params: { detail: e instanceof Error ? e.message : 'unknown' },
  }
}

function repo(): string {
  return process.env.GITHUB_REPO || 'anakinwon/loginpi'
}
function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}
function teamQs(extra = ''): string {
  const team = process.env.VERCEL_TEAM_ID
  const qs = new URLSearchParams(
    extra ? Object.fromEntries(new URLSearchParams(extra)) : {},
  )
  if (team) qs.set('teamId', team)
  const s = qs.toString()
  return s ? `?${s}` : ''
}
function firstLine(s: string): string {
  return (s || '').split('\n')[0].slice(0, 100)
}

export interface CommitInfo {
  sha: string
  message: string
}

// ── GitHub helpers ──────────────────────────────────────────────
async function ghCommit(ref: string): Promise<CommitInfo | null> {
  const token = process.env.GITHUB_DEPLOY_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`${GH}/repos/${repo()}/commits/${ref}`, {
      headers: ghHeaders(token),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const d = (await res.json()) as { sha: string; commit: { message: string } }
    return { sha: d.sha, message: firstLine(d.commit.message) }
  } catch {
    return null
  }
}

async function ghCompare(
  base: string,
  head: string,
): Promise<{
  ahead: number
  behind: number
  commits: CommitInfo[]
  error?: OpsErr
}> {
  const token = process.env.GITHUB_DEPLOY_TOKEN
  if (!token)
    return {
      ahead: 0,
      behind: 0,
      commits: [],
      error: { code: 'ADM_DEPLOY_GH_TOKEN_MISSING' },
    }
  try {
    const res = await fetch(`${GH}/repos/${repo()}/compare/${base}...${head}`, {
      headers: ghHeaders(token),
      cache: 'no-store',
    })
    if (!res.ok)
      return {
        ahead: 0,
        behind: 0,
        commits: [],
        error: { code: 'ADM_DEPLOY_GH_STATUS', params: { status: res.status } },
      }
    const d = (await res.json()) as {
      ahead_by: number
      behind_by: number
      commits: { sha: string; commit: { message: string } }[]
    }
    const commits = (d.commits ?? [])
      .map((c) => ({ sha: c.sha, message: firstLine(c.commit.message) }))
      .reverse() // 최신 먼저
    return { ahead: d.ahead_by ?? 0, behind: d.behind_by ?? 0, commits }
  } catch (e) {
    return { ahead: 0, behind: 0, commits: [], error: unknownErr(e) }
  }
}

// ── Vercel 배포 상태 ────────────────────────────────────────────
export interface DeploymentStatus {
  configured: boolean
  state: string | null // QUEUED | INITIALIZING | BUILDING | READY | ERROR | CANCELED
  url: string | null
  inspectorUrl: string | null
  createdAt: number | null
  commitSha: string | null // 현재 배포된 커밋
  commitMessage: string | null
  error?: OpsErr
}

export async function getLatestDeployment(
  projectId?: string,
): Promise<DeploymentStatus> {
  const token = process.env.VERCEL_API_TOKEN
  const empty: DeploymentStatus = {
    configured: !!(token && projectId),
    state: null,
    url: null,
    inspectorUrl: null,
    createdAt: null,
    commitSha: null,
    commitMessage: null,
  }
  if (!token || !projectId) return empty
  try {
    const res = await fetch(
      `${VERCEL}/v6/deployments${teamQs(`projectId=${projectId}&limit=1`)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    )
    if (!res.ok)
      return {
        ...empty,
        error: { code: 'ADM_DEPLOY_VERCEL_STATUS', params: { status: res.status } },
      }
    const d = (await res.json()) as {
      deployments?: {
        url?: string
        state?: string
        readyState?: string
        created?: number
        createdAt?: number
        inspectorUrl?: string
        meta?: { githubCommitSha?: string; githubCommitMessage?: string }
      }[]
    }
    const dep = d.deployments?.[0]
    if (!dep) return empty
    return {
      configured: true,
      state: dep.state ?? dep.readyState ?? null,
      url: dep.url ? `https://${dep.url}` : null,
      inspectorUrl: dep.inspectorUrl ?? null,
      createdAt: dep.created ?? dep.createdAt ?? null,
      commitSha: dep.meta?.githubCommitSha ?? null,
      commitMessage: dep.meta?.githubCommitMessage
        ? firstLine(dep.meta.githubCommitMessage)
        : null,
    }
  } catch (e) {
    return { ...empty, error: unknownErr(e) }
  }
}

// 두 환경 배포 상태(폴링용)
export async function getBothStatuses(): Promise<{
  staging: DeploymentStatus
  production: DeploymentStatus
}> {
  const [staging, production] = await Promise.all([
    getLatestDeployment(process.env.VERCEL_STAGING_PROJECT_ID),
    getLatestDeployment(process.env.VERCEL_PROD_PROJECT_ID),
  ])
  return { staging, production }
}

// ── 통합 개요(2단 화면) ─────────────────────────────────────────
export interface DeployOverview {
  configured: {
    promote: boolean
    stagingHook: boolean
    stagingStatus: boolean
    prodStatus: boolean
  }
  master: CommitInfo | null
  staging: {
    deployed: CommitInfo | null // 현재 stage 배포 커밋(Vercel meta)
    pending: CommitInfo[] // 배포SHA...master (보통 0 — auto-deploy)
    status: DeploymentStatus
  }
  production: {
    head: CommitInfo | null // production 브랜치 HEAD
    ahead: number
    behind: number
    commits: CommitInfo[] // production...master (승격 대상)
    status: DeploymentStatus
  }
  ghError?: OpsErr
}

export async function getDeployOverview(): Promise<DeployOverview> {
  const configured = {
    promote: !!process.env.GITHUB_DEPLOY_TOKEN,
    stagingHook: !!process.env.VERCEL_STAGING_DEPLOY_HOOK,
    stagingStatus: !!(
      process.env.VERCEL_API_TOKEN && process.env.VERCEL_STAGING_PROJECT_ID
    ),
    prodStatus: !!(
      process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROD_PROJECT_ID
    ),
  }

  const [master, prodHead, prodCmp, stagingDep, prodDep] = await Promise.all([
    ghCommit('master'),
    ghCommit('production'),
    ghCompare('production', 'master'),
    getLatestDeployment(process.env.VERCEL_STAGING_PROJECT_ID),
    getLatestDeployment(process.env.VERCEL_PROD_PROJECT_ID),
  ])

  // stage 대상: 현재 stage 배포 SHA ... master (배포된 SHA를 알 때만)
  let pending: CommitInfo[] = []
  if (stagingDep.commitSha && master && stagingDep.commitSha !== master.sha) {
    pending = (await ghCompare(stagingDep.commitSha, 'master')).commits
  }

  return {
    configured,
    master,
    staging: {
      deployed: stagingDep.commitSha
        ? { sha: stagingDep.commitSha, message: stagingDep.commitMessage ?? '' }
        : null,
      pending,
      status: stagingDep,
    },
    production: {
      head: prodHead,
      ahead: prodCmp.ahead,
      behind: prodCmp.behind,
      commits: prodCmp.commits,
      status: prodDep,
    },
    ghError: prodCmp.error,
  }
}

// ── 액션 ────────────────────────────────────────────────────────
export async function triggerStagingDeploy(): Promise<{
  ok: boolean
  code?: ApiErrorCode
  params?: ApiErrorParams
}> {
  const hook = process.env.VERCEL_STAGING_DEPLOY_HOOK
  if (!hook) return { ok: false, code: 'ADM_DEPLOY_STAGING_HOOK_MISSING' }
  try {
    const res = await fetch(hook, { method: 'POST', cache: 'no-store' })
    return res.ok
      ? { ok: true }
      : {
          ok: false,
          code: 'ADM_DEPLOY_HOOK_STATUS',
          params: { status: res.status },
        }
  } catch (e) {
    return { ok: false, ...unknownErr(e) }
  }
}

// 운영 승격 — production ref를 master로 fast-forward(force:false). ff 아니면 GitHub 422 → 거부.
export async function promoteToProduction(): Promise<{
  ok: boolean
  sha?: string
  code?: ApiErrorCode
  params?: ApiErrorParams
}> {
  const token = process.env.GITHUB_DEPLOY_TOKEN
  if (!token) return { ok: false, code: 'ADM_DEPLOY_GH_TOKEN_MISSING' }
  const [master, cmp] = await Promise.all([
    ghCommit('master'),
    ghCompare('production', 'master'),
  ])
  if (cmp.error) return { ok: false, ...cmp.error }
  if (cmp.behind > 0)
    return {
      ok: false,
      code: 'ADM_DEPLOY_PROD_DIVERGED',
      params: { n: cmp.behind },
    }
  if (cmp.ahead === 0)
    return { ok: false, code: 'ADM_DEPLOY_NOTHING_TO_PROMOTE' }
  if (!master?.sha) return { ok: false, code: 'ADM_DEPLOY_MASTER_SHA_FAIL' }
  try {
    const res = await fetch(`${GH}/repos/${repo()}/git/refs/heads/production`, {
      method: 'PATCH',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: master.sha, force: false }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return {
        ok: false,
        code: 'ADM_DEPLOY_PROMOTE_FAILED',
        params: { status: res.status, detail: txt.slice(0, 160) },
      }
    }
    if (process.env.VERCEL_PROD_DEPLOY_HOOK) {
      await fetch(process.env.VERCEL_PROD_DEPLOY_HOOK, {
        method: 'POST',
        cache: 'no-store',
      }).catch(() => {})
    }
    return { ok: true, sha: master.sha }
  } catch (e) {
    return { ok: false, ...unknownErr(e) }
  }
}

// ── Staging DB 스위치 ───────────────────────────────────────────
export type DbTarget = 'staging' | 'prod-ro'
export interface DbSwitchState {
  tier: string
  switchable: boolean
  currentTarget: DbTarget
  prodRoConfigured: boolean
  apiConfigured: boolean
}

export function getDbSwitchState(): DbSwitchState {
  const tier = resolveDbTier()
  const apiConfigured =
    !!process.env.VERCEL_API_TOKEN &&
    !!process.env.VERCEL_STAGING_PROJECT_ID &&
    !!process.env.VERCEL_STAGING_DEPLOY_HOOK
  const prodRoConfigured =
    !!process.env.PROD_RO_SUPABASE_URL && !!process.env.PROD_RO_SUPABASE_KEY
  return {
    tier,
    switchable: tier === 'staging' && apiConfigured,
    currentTarget:
      process.env.STAGING_DB_TARGET === 'prod-ro' ? 'prod-ro' : 'staging',
    prodRoConfigured,
    apiConfigured,
  }
}

export async function setStagingDbTarget(
  target: DbTarget,
): Promise<{ ok: boolean; code?: ApiErrorCode; params?: ApiErrorParams }> {
  const st = getDbSwitchState()
  if (st.tier !== 'staging') return { ok: false, code: 'ADM_DB_NOT_STAGING' }
  if (!st.apiConfigured) return { ok: false, code: 'ADM_DB_API_MISSING' }
  if (target === 'prod-ro' && !st.prodRoConfigured)
    return { ok: false, code: 'ADM_DB_PROD_RO_MISSING' }
  const projectId = process.env.VERCEL_STAGING_PROJECT_ID!
  try {
    const res = await fetch(
      `${VERCEL}/v10/projects/${projectId}/env${teamQs('upsert=true')}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'STAGING_DB_TARGET',
          value: target,
          type: 'plain',
          target: ['production'],
        }),
        cache: 'no-store',
      },
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return {
        ok: false,
        code: 'ADM_DB_ENV_UPDATE_FAILED',
        params: { status: res.status, detail: txt.slice(0, 120) },
      }
    }
    const dep = await triggerStagingDeploy()
    if (!dep.ok) return { ok: false, code: 'ADM_DB_ENV_OK_REDEPLOY_FAILED' }
    return { ok: true }
  } catch (e) {
    return { ok: false, ...unknownErr(e) }
  }
}

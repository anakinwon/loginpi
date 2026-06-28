import 'server-only'
import { resolveDbTier } from './db-env'

// 운영 도구 백엔드 — 배포(staging 재배포 / production 승격)·Staging DB 스위치.
// 모든 외부 토큰은 서버 env 전용. 미설정 시 각 기능은 '미구성'으로 비활성(graceful).

const GH = 'https://api.github.com'
const VERCEL = 'https://api.vercel.com'

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
  const qs = new URLSearchParams(extra ? Object.fromEntries(new URLSearchParams(extra)) : {})
  if (team) qs.set('teamId', team)
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export interface CommitInfo {
  sha: string
  message: string
}
export interface DeployState {
  configured: { promote: boolean; stagingHook: boolean; prodHook: boolean }
  master: CommitInfo | null
  production: CommitInfo | null
  ahead: number
  behind: number
  commits: CommitInfo[]
  error?: string
}

// master vs production 비교 — 무엇이 운영에 나갈지 + ff 가능 여부.
export async function getDeployState(): Promise<DeployState> {
  const token = process.env.GITHUB_DEPLOY_TOKEN
  const state: DeployState = {
    configured: {
      promote: !!token,
      stagingHook: !!process.env.VERCEL_STAGING_DEPLOY_HOOK,
      prodHook: !!process.env.VERCEL_PROD_DEPLOY_HOOK,
    },
    master: null,
    production: null,
    ahead: 0,
    behind: 0,
    commits: [],
  }
  if (!token) return state
  try {
    const res = await fetch(`${GH}/repos/${repo()}/compare/production...master`, {
      headers: ghHeaders(token),
      cache: 'no-store',
    })
    if (!res.ok) {
      state.error = `GitHub ${res.status}`
      return state
    }
    const d = (await res.json()) as {
      ahead_by: number
      behind_by: number
      base_commit: { sha: string; commit: { message: string } }
      commits: { sha: string; commit: { message: string } }[]
    }
    state.ahead = d.ahead_by ?? 0
    state.behind = d.behind_by ?? 0
    state.production = {
      sha: d.base_commit.sha,
      message: firstLine(d.base_commit.commit.message),
    }
    const list = (d.commits ?? []).map((c) => ({
      sha: c.sha,
      message: firstLine(c.commit.message),
    }))
    state.commits = list.slice().reverse() // 최신 먼저
    state.master = list.length ? list[list.length - 1] : state.production
    return state
  } catch (e) {
    state.error = e instanceof Error ? e.message : 'unknown'
    return state
  }
}

// Stage 재배포 — Vercel Deploy Hook POST(master 재빌드).
export async function triggerStagingDeploy(): Promise<{ ok: boolean; error?: string }> {
  const hook = process.env.VERCEL_STAGING_DEPLOY_HOOK
  if (!hook) return { ok: false, error: 'VERCEL_STAGING_DEPLOY_HOOK 미설정' }
  try {
    const res = await fetch(hook, { method: 'POST', cache: 'no-store' })
    return res.ok ? { ok: true } : { ok: false, error: `Deploy Hook ${res.status}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

// 운영 승격 — production ref를 master로 fast-forward(force:false). ff 아니면 GitHub 422 → 거부.
// 승격 성공 시 cafepi(production 브랜치 감시)가 자동 배포. prod hook 있으면 보조 트리거.
export async function promoteToProduction(): Promise<{
  ok: boolean
  sha?: string
  error?: string
}> {
  const token = process.env.GITHUB_DEPLOY_TOKEN
  if (!token) return { ok: false, error: 'GITHUB_DEPLOY_TOKEN 미설정' }
  const state = await getDeployState()
  if (state.error) return { ok: false, error: state.error }
  if (state.behind > 0)
    return {
      ok: false,
      error: `production이 master보다 ${state.behind}커밋 앞섬(갈라짐) — fast-forward 불가`,
    }
  if (state.ahead === 0) return { ok: false, error: '승격할 커밋 없음(이미 최신)' }
  const masterSha = state.master?.sha
  if (!masterSha) return { ok: false, error: 'master SHA 조회 실패' }
  try {
    const res = await fetch(`${GH}/repos/${repo()}/git/refs/heads/production`, {
      method: 'PATCH',
      headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: masterSha, force: false }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return { ok: false, error: `승격 실패 GitHub ${res.status} ${txt.slice(0, 120)}` }
    }
    // 보조: 운영 deploy hook(있으면)
    if (process.env.VERCEL_PROD_DEPLOY_HOOK) {
      await fetch(process.env.VERCEL_PROD_DEPLOY_HOOK, { method: 'POST', cache: 'no-store' }).catch(
        () => {},
      )
    }
    return { ok: true, sha: masterSha }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

export type DbTarget = 'staging' | 'prod-ro'

export interface DbSwitchState {
  tier: string
  switchable: boolean // staging tier + Vercel API 구성 시에만
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
    currentTarget: process.env.STAGING_DB_TARGET === 'prod-ro' ? 'prod-ro' : 'staging',
    prodRoConfigured,
    apiConfigured,
  }
}

// Staging DB 타깃 전환 — STAGING_DB_TARGET env upsert(Vercel API) + 재배포 트리거.
// ⛔ tier=staging에서만, prod-ro는 PROD_RO_* 자격증명 있을 때만(읽기전용 강제).
export async function setStagingDbTarget(
  target: DbTarget,
): Promise<{ ok: boolean; error?: string }> {
  const st = getDbSwitchState()
  if (st.tier !== 'staging')
    return { ok: false, error: '스테이징 환경에서만 전환 가능(운영 WAS 불변)' }
  if (!st.apiConfigured)
    return { ok: false, error: 'Vercel API 토큰/프로젝트ID/Deploy Hook 미설정' }
  if (target === 'prod-ro' && !st.prodRoConfigured)
    return {
      ok: false,
      error: '운영DB(prod-ro) 읽기전용 자격증명(PROD_RO_SUPABASE_URL/KEY) 미설정 — 쓰기 사고 방지로 차단',
    }
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
      return { ok: false, error: `env 변경 실패 Vercel ${res.status} ${txt.slice(0, 120)}` }
    }
    const dep = await triggerStagingDeploy()
    if (!dep.ok) return { ok: false, error: `env는 변경됐으나 재배포 실패: ${dep.error}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' }
  }
}

function firstLine(s: string): string {
  return (s || '').split('\n')[0].slice(0, 100)
}

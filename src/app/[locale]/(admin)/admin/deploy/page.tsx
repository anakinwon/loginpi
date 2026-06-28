'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

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

const short = (s?: string) => (s ? s.slice(0, 7) : '—')

export default function DeployPage() {
  const [state, setState] = useState<DeployState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'staging' | 'production' | null>(null)
  const [forbidden, setForbidden] = useState(false)

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

  useEffect(() => {
    void load()
  }, [load])

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
        </>
      )}
    </div>
  )
}

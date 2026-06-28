'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface SwitchState {
  tier: string
  switchable: boolean
  currentTarget: 'staging' | 'prod-ro'
  prodRoConfigured: boolean
  apiConfigured: boolean
  tierInfo?: { tier: string; readOnly: boolean }
  connTest?: { ok: boolean; count?: number; error?: string }
}

export default function DbSwitchPage() {
  const [state, setState] = useState<SwitchState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/db-switch')
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      setState(await res.json())
    } catch {
      toast.error('DB 스위치 상태 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const switchTo = useCallback(
    async (target: 'staging' | 'prod-ro') => {
      if (target === state?.currentTarget) return
      if (target === 'prod-ro') {
        if (
          !window.confirm(
            'Staging을 운영DB(읽기전용)에 연결합니다.\n실데이터를 staging에서 미리보기하게 됩니다(쓰기는 차단). 계속하시겠습니까?',
          )
        )
          return
      }
      setBusy(true)
      try {
        const res = await piFetch('/api/admin/db-switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target }),
        })
        const data = await res.json()
        if (res.ok && data.ok) {
          toast.success('전환 요청됨 — loginpi 재배포 후(~1분) 반영됩니다')
          setTimeout(() => void load(), 1500)
        } else {
          toast.error(data.error || '실패')
        }
      } catch {
        toast.error('요청 실패')
      } finally {
        setBusy(false)
      }
    },
    [state, load],
  )

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Staging DB 스위치</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          이 화면은 <b>MASTER</b> 권한 전용입니다.
        </p>
      </div>
    )

  const isProdRo = state?.currentTarget === 'prod-ro'

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Staging DB 스위치</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Staging WAS(loginpi)가 바라보는 DB 전환: <b>Stage DB(RW)</b> ⇄{' '}
          <b>운영DB(읽기전용)</b>. 운영 WAS는 영향받지 않습니다.
        </p>
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {state && (
        <>
          {state.tier !== 'staging' && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              ⛔ 이 스위치는 <b>스테이징 환경에서만</b> 동작합니다. 현재 tier =
              <b> {state.tier}</b> (운영/개발에선 전환 불가 — 안전장치).
            </p>
          )}

          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">현재 연결</p>
            <p className="mt-1 text-lg font-semibold">
              {isProdRo ? '🔒 운영DB (읽기전용)' : '🧪 Stage DB (읽기·쓰기)'}
            </p>
            {/* 라이브 진단 — RO 연결의 read가 실제로 되는지 */}
            <div className="mt-2 space-y-0.5 text-xs">
              <p className="text-muted-foreground">
                tier=<b>{state.tierInfo?.tier ?? state.tier}</b> · readOnly=
                <b>{String(state.tierInfo?.readOnly ?? false)}</b>
              </p>
              {state.connTest?.ok ? (
                <p className="text-green-600 dark:text-green-400">
                  ✅ DB read 정상 (sys_user {state.connTest.count}건) — 세션 검증 가능
                </p>
              ) : (
                <p className="text-red-600 dark:text-red-400">
                  ❌ DB read 실패: {state.connTest?.error ?? '—'}
                  {isProdRo &&
                    ' → RO 키(JWT)가 PostgREST에서 거부됨일 가능성. 세션 끊김의 원인.'}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => switchTo('staging')}
              disabled={busy || !state.switchable || state.currentTarget === 'staging'}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              🧪 Stage DB (RW)
            </button>
            <button
              onClick={() => switchTo('prod-ro')}
              disabled={
                busy ||
                !state.switchable ||
                !state.prodRoConfigured ||
                state.currentTarget === 'prod-ro'
              }
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              🔒 운영DB (읽기전용)
            </button>
          </div>

          <div className="space-y-1">
            {!state.apiConfigured && (
              <p className="text-muted-foreground text-xs">
                · 비활성: `VERCEL_API_TOKEN`·`VERCEL_STAGING_PROJECT_ID`·`VERCEL_STAGING_DEPLOY_HOOK`
                미설정
              </p>
            )}
            {!state.prodRoConfigured && (
              <p className="text-muted-foreground text-xs">
                · 운영DB(읽기전용) 비활성: `PROD_RO_SUPABASE_URL`·`PROD_RO_SUPABASE_KEY`(읽기전용
                롤) 미설정 — 운영 원장 쓰기 사고 방지
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface HistoryRow {
  audit_id: string
  old_mode: string
  new_mode: string
  changed_by: string
  changed_at: string
  reason_memo: string | null
}
interface FeeModeState {
  active_mode: 'BEAN' | 'PI'
  history: HistoryRow[]
}

export default function FeeModePage() {
  const [state, setState] = useState<FeeModeState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/fee-mode')
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      setState(await res.json())
    } catch {
      toast.error('요금제 모드 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const post = useCallback(
    async (body: Record<string, unknown>, okMsg: string) => {
      setBusy(true)
      try {
        const res = await piFetch('/api/admin/fee-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (res.ok && data.ok) {
          toast.success(okMsg)
          setTimeout(() => void load(), 500)
        } else {
          toast.error(data.error || '실패')
        }
      } catch {
        toast.error('요청 실패')
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const switchMode = useCallback(
    (newMode: 'BEAN' | 'PI') => {
      if (newMode === state?.active_mode) return
      if (newMode === 'PI') {
        if (
          !window.confirm(
            'Pi Coin 요금제로 전환합니다.\n모든 플랫폼 거래가 Pi 직접결제로, 마이크로 요금은 무료화됩니다(메인넷 A-5 대응). 계속하시겠습니까?',
          )
        )
          return
      }
      const reason =
        window.prompt(
          '전환 사유(선택):',
          newMode === 'PI' ? '메인넷 등재 준비' : 'Bean 요금제 복귀',
        ) ?? ''
      void post(
        { action: 'switch', new_mode: newMode, reason },
        `${newMode === 'PI' ? 'Pi Coin' : 'Bean Token'} 요금제로 전환됨`,
      )
    },
    [state, post],
  )

  const rollback = useCallback(() => {
    if (!window.confirm('직전 요금제로 되돌립니다. 계속하시겠습니까?')) return
    void post(
      { action: 'rollback', reason: '직전 요금제 복귀' },
      '직전 요금제로 복귀됨',
    )
  }, [post])

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">요금제 모드</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          이 화면은 <b>MASTER</b> 권한 전용입니다.
        </p>
      </div>
    )

  const isPi = state?.active_mode === 'PI'

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">요금제 모드 (Bean ↔ Pi)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          플랫폼 요금·보상 결제 단위 전환: <b>Bean Token</b> ⇄ <b>Pi Coin</b>{' '}
          (1:100). 메인넷 등재 A-5 대응 — 버튼 하나로 즉시 전환·복귀.
        </p>
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {state && (
        <>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">현재 활성 요금제</p>
            <p className="mt-1 text-lg font-semibold">
              {isPi
                ? 'Pi Coin 요금제 (메인넷 모드 — Pi 직접결제·마이크로 무료)'
                : 'Bean Token 요금제 (평상시 — Bean 차감)'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => switchMode('BEAN')}
              disabled={busy || state.active_mode === 'BEAN'}
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Bean Token 요금제
            </button>
            <button
              onClick={() => switchMode('PI')}
              disabled={busy || state.active_mode === 'PI'}
              className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            >
              Pi Coin 요금제 (메인넷)
            </button>
            <button
              onClick={rollback}
              disabled={busy || !state.history.length}
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              ↩ 직전 요금제 복귀
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">전환 이력 (최근 20)</p>
            {state.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                전환 이력이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">변경</th>
                      <th className="px-3 py-2 text-left">수행자</th>
                      <th className="px-3 py-2 text-left">사유</th>
                      <th className="px-3 py-2 text-left">시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.history.map((h) => (
                      <tr key={h.audit_id} className="border-t">
                        <td className="px-3 py-2 font-mono">
                          {h.old_mode} → {h.new_mode}
                        </td>
                        <td className="px-3 py-2">{h.changed_by}</td>
                        <td className="text-muted-foreground px-3 py-2">
                          {h.reason_memo ?? '—'}
                        </td>
                        <td className="text-muted-foreground px-3 py-2">
                          {new Date(h.changed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

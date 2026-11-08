'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations()
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
      toast.error(t('adminFeeMode.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

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
          toast.error(data.error || t('adminFeeMode.fail'))
        }
      } catch {
        toast.error(t('adminFeeMode.reqFail'))
      } finally {
        setBusy(false)
      }
    },
    [load, t],
  )

  const switchMode = useCallback(
    (newMode: 'BEAN' | 'PI') => {
      if (newMode === state?.active_mode) return
      if (newMode === 'PI') {
        if (!window.confirm(t('adminFeeMode.switchPiConfirm'))) return
      }
      const reason =
        window.prompt(
          t('adminFeeMode.switchReasonPrompt'),
          newMode === 'PI'
            ? t('adminFeeMode.switchReasonPiDefault')
            : t('adminFeeMode.switchReasonBeanDefault'),
        ) ?? ''
      void post(
        { action: 'switch', new_mode: newMode, reason },
        t('adminFeeMode.switchSuccess', {
          mode:
            newMode === 'PI'
              ? t('adminFeeMode.piCoin')
              : t('adminFeeMode.beanToken'),
        }),
      )
    },
    [state, post, t],
  )

  const rollback = useCallback(() => {
    if (!window.confirm(t('adminFeeMode.rollbackConfirm'))) return
    void post(
      { action: 'rollback', reason: t('adminFeeMode.rollbackReason') },
      t('adminFeeMode.rollbackSuccess'),
    )
  }, [post, t])

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">
          {t('adminFeeMode.forbiddenTitle')}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {t.rich('adminFeeMode.forbiddenBody', {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>
      </div>
    )

  const isPi = state?.active_mode === 'PI'

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('adminFeeMode.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t.rich('adminFeeMode.subtitle', {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      )}

      {state && (
        <>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">
              {t('adminFeeMode.currentMode')}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {isPi
                ? t('adminFeeMode.piModeDesc')
                : t('adminFeeMode.beanModeDesc')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => switchMode('BEAN')}
              disabled={busy || state.active_mode === 'BEAN'}
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t('adminFeeMode.beanBtn')}
            </button>
            <button
              onClick={() => switchMode('PI')}
              disabled={busy || state.active_mode === 'PI'}
              className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            >
              {t('adminFeeMode.piBtn')}
            </button>
            <button
              onClick={rollback}
              disabled={busy || !state.history.length}
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t('adminFeeMode.rollbackBtn')}
            </button>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              {t('adminFeeMode.historyTitle')}
            </p>
            {state.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('adminFeeMode.noHistory')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        {t('adminFeeMode.colChange')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminFeeMode.colActor')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminFeeMode.colReason')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminFeeMode.colDtm')}
                      </th>
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

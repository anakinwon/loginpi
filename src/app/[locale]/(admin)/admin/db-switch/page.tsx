'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import {
  useApiErrorMessage,
  type ApiErrorPayload,
} from '@/hooks/use-api-error'

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
  const t = useTranslations('adminOps')
  const tc = useTranslations('common')
  const apiErr = useApiErrorMessage()
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
      toast.error(t('dbSwitch.loadFail'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const switchTo = useCallback(
    async (target: 'staging' | 'prod-ro') => {
      if (target === state?.currentTarget) return
      if (target === 'prod-ro') {
        if (!window.confirm(t('dbSwitch.confirmProdRo'))) return
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
          toast.success(t('dbSwitch.switchRequested'))
          setTimeout(() => void load(), 1500)
        } else {
          toast.error(apiErr(data as ApiErrorPayload, t('dbSwitch.fail')))
        }
      } catch {
        toast.error(t('dbSwitch.reqFail'))
      } finally {
        setBusy(false)
      }
    },
    [state, load, t],
  )

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">{t('dbSwitch.title')}</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {t.rich('masterOnly', { b: (c) => <b>{c}</b> })}
        </p>
      </div>
    )

  const isProdRo = state?.currentTarget === 'prod-ro'

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('dbSwitch.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t.rich('dbSwitch.subtitle', { b: (c) => <b>{c}</b> })}
        </p>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{tc('fetching')}</p>
      )}

      {state && (
        <>
          {state.tier !== 'staging' && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              {t.rich('dbSwitch.notStagingWarn', {
                b: (c) => <b>{c}</b>,
                tier: state.tier,
              })}
            </p>
          )}

          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">
              {t('dbSwitch.currentConn')}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {isProdRo
                ? t('dbSwitch.prodRoLabel')
                : t('dbSwitch.stageRwLabel')}
            </p>
            {/* 라이브 진단 — RO 연결의 read가 실제로 되는지 */}
            <div className="mt-2 space-y-0.5 text-xs">
              <p className="text-muted-foreground">
                tier=<b>{state.tierInfo?.tier ?? state.tier}</b> · readOnly=
                <b>{String(state.tierInfo?.readOnly ?? false)}</b>
              </p>
              {state.connTest?.ok ? (
                <p className="text-green-600 dark:text-green-400">
                  {t('dbSwitch.readOk', { count: state.connTest.count ?? 0 })}
                </p>
              ) : (
                <p className="text-red-600 dark:text-red-400">
                  {t('dbSwitch.readFail', {
                    error: state.connTest?.error ?? '—',
                  })}
                  {isProdRo && t('dbSwitch.readFailRoHint')}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => switchTo('staging')}
              disabled={
                busy || !state.switchable || state.currentTarget === 'staging'
              }
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t('dbSwitch.btnStageRw')}
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
              {t('dbSwitch.btnProdRo')}
            </button>
          </div>

          <div className="space-y-1">
            {!state.apiConfigured && (
              <p className="text-muted-foreground text-xs">
                {t('dbSwitch.apiDisabled')}
              </p>
            )}
            {!state.prodRoConfigured && (
              <p className="text-muted-foreground text-xs">
                {t('dbSwitch.prodRoDisabled')}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

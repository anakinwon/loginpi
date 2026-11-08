'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'

// 오픈기념행사 무료요금 OneKey 토글 — PRD_26. MASTER 전용.
//   활성화 시 모든 요금 품목 무료, 종료 시 즉시 정상요금 복귀(bean_fee_plan 비파괴).

interface HistoryRow {
  audit_id: string
  old_active_yn: string | null
  new_active_yn: string
  old_start_dtm: string | null
  new_start_dtm: string | null
  old_end_dtm: string | null
  new_end_dtm: string | null
  changed_by: string
  changed_at: string
  reason_memo: string | null
}
interface CurrentRow {
  promo_fee_id: string
  promo_active_yn: string
  promo_start_dtm: string | null
  promo_end_dtm: string | null
  reason_memo: string | null
  status_label: string
  is_active_now: boolean
}
interface PromoState {
  current: CurrentRow | null
  history: HistoryRow[]
}

// ISO → datetime-local(YYYY-MM-DDTHH:mm) 로컬 표기 (input value용)
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function OpenPromoPage() {
  const t = useTranslations()
  const [state, setState] = useState<PromoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')
  // D-day 기준 시각 — 렌더 중 Date.now() 호출 금지(react-compiler) → 조회 시점 스냅샷
  const [nowTs, setNowTs] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await piFetch('/api/admin/open-promo')
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      const data = (await res.json()) as PromoState
      setState(data)
      setNowTs(Date.now())
      // 현재 설정된 시작/종료 시각을 입력 폼에 반영
      setStartInput(isoToLocalInput(data.current?.promo_start_dtm ?? null))
      setEndInput(isoToLocalInput(data.current?.promo_end_dtm ?? null))
    } catch {
      toast.error(t('adminPromo.loadError'))
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
        const res = await piFetch('/api/admin/open-promo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (res.ok && data.ok) {
          toast.success(okMsg)
          setTimeout(() => void load(), 500)
        } else {
          toast.error(data.error || t('adminPromo.fail'))
        }
      } catch {
        toast.error(t('adminPromo.reqFail'))
      } finally {
        setBusy(false)
      }
    },
    [load, t],
  )

  const activate = useCallback(() => {
    const start = startInput ? new Date(startInput).toISOString() : null
    const end = endInput ? new Date(endInput).toISOString() : null
    if (start && end && new Date(end) <= new Date(start)) {
      toast.error(t('adminPromo.endAfterStartError'))
      return
    }
    if (!window.confirm(t('adminPromo.activateConfirm'))) return
    const reason =
      window.prompt(
        t('adminPromo.activateReasonPrompt'),
        t('adminPromo.activateReasonDefault'),
      ) ?? ''
    void post(
      { action: 'activate', start_dtm: start, end_dtm: end, reason },
      t('adminPromo.activateSuccess'),
    )
  }, [startInput, endInput, post, t])

  const deactivate = useCallback(() => {
    if (!window.confirm(t('adminPromo.deactivateConfirm'))) return
    const reason =
      window.prompt(
        t('adminPromo.deactivateReasonPrompt'),
        t('adminPromo.deactivateReasonDefault'),
      ) ?? ''
    void post(
      { action: 'deactivate', reason },
      t('adminPromo.deactivateSuccess'),
    )
  }, [post, t])

  const saveTimes = useCallback(() => {
    const start = startInput ? new Date(startInput).toISOString() : null
    const end = endInput ? new Date(endInput).toISOString() : null
    if (start && end && new Date(end) <= new Date(start)) {
      toast.error(t('adminPromo.endAfterStartError'))
      return
    }
    void post(
      { action: 'set-times', start_dtm: start, end_dtm: end },
      t('adminPromo.setTimesSuccess'),
    )
  }, [startInput, endInput, post, t])

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">
          {t('adminPromo.forbiddenTitle')}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {t.rich('adminPromo.forbiddenBody', {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>
      </div>
    )

  const cur = state?.current
  const active = cur?.is_active_now === true

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">{t('adminPromo.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t.rich('adminPromo.subtitle', {
            b: (chunks) => <b>{chunks}</b>,
          })}
        </p>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      )}

      {state && (
        <>
          {/* 현재 상태 */}
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">
              {t('adminPromo.currentStatus')}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {active ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {t('adminPromo.activeStatus')}
                </span>
              ) : (
                <span>{t('adminPromo.normalStatus')}</span>
              )}
            </p>
            {/* 종료시각 강조 — KST 명시 + 남은 일수(D-day). 영어 locale에서도 동일 KST 기준 */}
            {active &&
              (cur?.promo_end_dtm ? (
                <p className="mt-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  {t('adminPromo.endAt', {
                    date: new Date(cur.promo_end_dtm).toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                  {(() => {
                    const days = Math.ceil(
                      (new Date(cur.promo_end_dtm).getTime() - nowTs) /
                        86_400_000,
                    )
                    return days > 0
                      ? t('adminPromo.dDay', { days })
                      : t('adminPromo.endingSoon')
                  })()}
                </p>
              ) : (
                <p className="mt-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  {t('adminPromo.endUnlimited')}
                </p>
              ))}
            {cur && (
              <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt>{t('adminPromo.judgeStatus')}</dt>
                <dd className="text-foreground">{cur.status_label}</dd>
                <dt>{t('adminPromo.startLabel')}</dt>
                <dd>
                  {cur.promo_start_dtm
                    ? new Date(cur.promo_start_dtm).toLocaleString()
                    : t('adminPromo.startNotSet')}
                </dd>
                <dt>{t('adminPromo.endLabel')}</dt>
                <dd>
                  {cur.promo_end_dtm
                    ? new Date(cur.promo_end_dtm).toLocaleString()
                    : t('adminPromo.endNotSet')}
                </dd>
                {cur.reason_memo && (
                  <>
                    <dt>{t('adminPromo.reasonLabel')}</dt>
                    <dd>{cur.reason_memo}</dd>
                  </>
                )}
              </dl>
            )}
          </div>

          {/* 기간 설정 */}
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">{t('adminPromo.periodTitle')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted-foreground mb-1 block text-xs">
                  {t('adminPromo.startTime')}
                </span>
                <input
                  type="datetime-local"
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="text-muted-foreground mb-1 block text-xs">
                  {t('adminPromo.endTime')}
                </span>
                <input
                  type="datetime-local"
                  value={endInput}
                  min={startInput || undefined}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
            </div>
            {active && (
              <button
                onClick={saveTimes}
                disabled={busy}
                className="hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {t('adminPromo.saveTimesBtn')}
              </button>
            )}
          </div>

          {/* OneKey 토글 */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={activate}
              disabled={busy || active}
              className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
            >
              {t('adminPromo.activateBtn')}
            </button>
            <button
              onClick={deactivate}
              disabled={busy || !active}
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {t('adminPromo.deactivateBtn')}
            </button>
          </div>

          {/* 변경 이력 */}
          <div>
            <p className="mb-2 text-sm font-medium">
              {t('adminPromo.historyTitle')}
            </p>
            {state.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t('adminPromo.noHistory')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        {t('adminPromo.colChange')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminPromo.colStartDtm')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminPromo.colEndDtm')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminPromo.colActor')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminPromo.colReason')}
                      </th>
                      <th className="px-3 py-2 text-left">
                        {t('adminPromo.colChangeDtm')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.history.map((h) => (
                      <tr key={h.audit_id} className="border-t">
                        <td className="px-3 py-2 font-mono">
                          {(h.old_active_yn ?? '—') === 'Y'
                            ? t('adminPromo.free')
                            : (h.old_active_yn ?? '—') === 'N'
                              ? t('adminPromo.normal')
                              : '—'}{' '}
                          →{' '}
                          {h.new_active_yn === 'Y'
                            ? t('adminPromo.free')
                            : t('adminPromo.normal')}
                        </td>
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {h.new_start_dtm
                            ? new Date(h.new_start_dtm).toLocaleString()
                            : t('adminPromo.immediate')}
                        </td>
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {h.new_end_dtm
                            ? new Date(h.new_end_dtm).toLocaleString()
                            : t('adminPromo.unlimited')}
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

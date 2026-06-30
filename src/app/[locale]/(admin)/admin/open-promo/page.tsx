'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
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
  const [state, setState] = useState<PromoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [startInput, setStartInput] = useState('')
  const [endInput, setEndInput] = useState('')

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
      // 현재 설정된 시작/종료 시각을 입력 폼에 반영
      setStartInput(isoToLocalInput(data.current?.promo_start_dtm ?? null))
      setEndInput(isoToLocalInput(data.current?.promo_end_dtm ?? null))
    } catch {
      toast.error('프로모션 상태 조회 실패')
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

  const activate = useCallback(() => {
    const start = startInput ? new Date(startInput).toISOString() : null
    const end = endInput ? new Date(endInput).toISOString() : null
    if (start && end && new Date(end) <= new Date(start)) {
      toast.error('종료 시각은 시작 시각보다 뒤여야 합니다')
      return
    }
    if (
      !window.confirm(
        '오픈기념 무료요금을 활성화합니다.\n전 요금 품목이 무료가 됩니다(정상요금은 보존, 종료 시 자동 복귀). 계속하시겠습니까?',
      )
    )
      return
    const reason = window.prompt('활성화 사유(선택):', '오픈기념행사') ?? ''
    void post(
      { action: 'activate', start_dtm: start, end_dtm: end, reason },
      '오픈 프로모 활성화됨 — 전 품목 무료',
    )
  }, [startInput, endInput, post])

  const deactivate = useCallback(() => {
    if (
      !window.confirm(
        '오픈 프로모를 종료합니다.\n즉시 정상요금으로 복귀합니다. 계속하시겠습니까?',
      )
    )
      return
    const reason = window.prompt('종료 사유(선택):', '오픈기념행사 종료') ?? ''
    void post({ action: 'deactivate', reason }, '프로모 종료 — 정상요금 복귀')
  }, [post])

  const saveTimes = useCallback(() => {
    const start = startInput ? new Date(startInput).toISOString() : null
    const end = endInput ? new Date(endInput).toISOString() : null
    if (start && end && new Date(end) <= new Date(start)) {
      toast.error('종료 시각은 시작 시각보다 뒤여야 합니다')
      return
    }
    void post(
      { action: 'set-times', start_dtm: start, end_dtm: end },
      '프로모 기간 변경됨',
    )
  }, [startInput, endInput, post])

  if (forbidden)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">오픈 프로모 무료요금</h1>
        <p className="text-muted-foreground mt-3 text-sm">
          이 화면은 <b>MASTER</b> 권한 전용입니다.
        </p>
      </div>
    )

  const cur = state?.current
  const active = cur?.is_active_now === true

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">오픈 프로모 무료요금 (OneKey)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          오픈기념행사 기간 동안 <b>전 요금 품목 무료</b>.
          정상요금(bean_fee_plan)은 보존되며, 종료 시 <b>즉시 자동 복귀</b>
          합니다. — PRD_26
        </p>
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중…</p>}

      {state && (
        <>
          {/* 현재 상태 */}
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">현재 상태</p>
            <p className="mt-1 text-lg font-semibold">
              {active ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  🎉 오픈 프로모 진행중 — 전 품목 무료
                </span>
              ) : (
                <span>정상요금 적용 중</span>
              )}
            </p>
            {/* 종료시각 강조 — KST 명시 + 남은 일수(D-day). 영어 locale에서도 동일 KST 기준 */}
            {active &&
              (cur?.promo_end_dtm ? (
                <p className="mt-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  ⏰ 종료:{' '}
                  {new Date(cur.promo_end_dtm).toLocaleString('ko-KR', {
                    timeZone: 'Asia/Seoul',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  (KST)
                  {(() => {
                    const days = Math.ceil(
                      (new Date(cur.promo_end_dtm).getTime() - Date.now()) /
                        86_400_000,
                    )
                    return days > 0 ? ` · D-${days}` : ' · 곧 종료'
                  })()}
                </p>
              ) : (
                <p className="mt-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                  ⏰ 종료: 무제한 (수동 종료까지)
                </p>
              ))}
            {cur && (
              <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt>판정 상태</dt>
                <dd className="text-foreground">{cur.status_label}</dd>
                <dt>시작</dt>
                <dd>
                  {cur.promo_start_dtm
                    ? new Date(cur.promo_start_dtm).toLocaleString()
                    : '— (지정 안 됨, 즉시)'}
                </dd>
                <dt>종료</dt>
                <dd>
                  {cur.promo_end_dtm
                    ? new Date(cur.promo_end_dtm).toLocaleString()
                    : '— (무제한, 수동 종료까지)'}
                </dd>
                {cur.reason_memo && (
                  <>
                    <dt>사유</dt>
                    <dd>{cur.reason_memo}</dd>
                  </>
                )}
              </dl>
            )}
          </div>

          {/* 기간 설정 */}
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">
              프로모 기간 (선택 — 비우면 무제한)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted-foreground mb-1 block text-xs">
                  시작 시각
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
                  종료 시각 (도달 시 자동 정상요금 복귀)
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
                기간만 저장 (활성 유지)
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
              🎉 오픈 프로모 활성화 (전 품목 무료)
            </button>
            <button
              onClick={deactivate}
              disabled={busy || !active}
              className="hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              ↩ 종료 (정상요금 복귀)
            </button>
          </div>

          {/* 변경 이력 */}
          <div>
            <p className="mb-2 text-sm font-medium">변경 이력 (최근 20)</p>
            {state.history.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                변경 이력이 없습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">변경</th>
                      <th className="px-3 py-2 text-left">시작일시</th>
                      <th className="px-3 py-2 text-left">종료일시</th>
                      <th className="px-3 py-2 text-left">수행자</th>
                      <th className="px-3 py-2 text-left">사유</th>
                      <th className="px-3 py-2 text-left">변경시각</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.history.map((h) => (
                      <tr key={h.audit_id} className="border-t">
                        <td className="px-3 py-2 font-mono">
                          {(h.old_active_yn ?? '—') === 'Y'
                            ? '무료'
                            : (h.old_active_yn ?? '—') === 'N'
                              ? '정상'
                              : '—'}{' '}
                          → {h.new_active_yn === 'Y' ? '무료' : '정상'}
                        </td>
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {h.new_start_dtm
                            ? new Date(h.new_start_dtm).toLocaleString()
                            : '— (즉시)'}
                        </td>
                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {h.new_end_dtm
                            ? new Date(h.new_end_dtm).toLocaleString()
                            : '— (무제한)'}
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

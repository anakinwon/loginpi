'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { AdminPagination } from '@/components/admin/admin-pagination'

interface FbckRow {
  fbck_id: string
  usr_id: string
  display_name: string
  raw_username: string | null
  shop_id: string | null
  order_id: string | null
  fbck_scr: number
  fbck_cn: string
  bean_rwrd_qty: number
  rwrd_yn: string
  hide_yn: string
  hide_reason_txt: string | null
  del_yn: string
  reg_dtm: string
}

const SCORE_FILTERS = ['', '5', '4', '3', '2', '1'] as const
const HIDE_FILTERS = ['', 'N', 'Y'] as const

const STAR = ['', '★', '★★', '★★★', '★★★★', '★★★★★']

export default function AdminFeedbackPage() {
  const t = useTranslations('adminMgmt.feedback')
  const tc = useTranslations('common')
  const [rows, setRows] = useState<FbckRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [scoreFilter, setScoreFilter] = useState('')
  const [hideFilter, setHideFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [hideModal, setHideModal] = useState<{
    fbck_id: string
    current: string
  } | null>(null)
  const [hideReason, setHideReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (scoreFilter) params.set('score', scoreFilter)
      if (hideFilter) params.set('hide_yn', hideFilter)
      const res = await piFetch(`/api/admin/feedback?${params}`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as {
        data: FbckRow[]
        pagination: { total: number }
      }
      setRows(d.data)
      setTotal(d.pagination.total)
    } catch {
      toast.error(t('loadFail'))
    } finally {
      setLoading(false)
    }
  }, [page, scoreFilter, hideFilter])

  useEffect(() => {
    void load()
  }, [load])

  function openHideModal(row: FbckRow) {
    setHideReason(row.hide_reason_txt ?? '')
    setHideModal({ fbck_id: row.fbck_id, current: row.hide_yn })
  }

  async function submitHide() {
    if (!hideModal) return
    const toHide = hideModal.current === 'N'

    if (toHide && !hideReason.trim()) {
      toast.error(t('enterHideReason'))
      return
    }

    setSaving(true)
    try {
      const res = await piFetch('/api/admin/feedback/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fbck_id: hideModal.fbck_id,
          hide_yn: toHide ? 'Y' : 'N',
          hide_reason_txt: toHide ? hideReason.trim() : undefined,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(toHide ? t('hidden') : t('unhidden'))
      setHideModal(null)
      void load()
    } catch {
      toast.error(t('processFail'))
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('total', { total: total.toLocaleString() })}
        </p>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-wrap gap-1">
          {SCORE_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setPage(1)
                setScoreFilter(s)
              }}
              className={`rounded-full border px-3 py-1 text-xs ${scoreFilter === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {s === '' ? t('scoreAll') : `${s}★`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {HIDE_FILTERS.map((value) => (
            <button
              key={value}
              onClick={() => {
                setPage(1)
                setHideFilter(value)
              }}
              className={`rounded-full border px-3 py-1 text-xs ${hideFilter === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {value === '' ? tc('all') : t(`hideFilter.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <p className="text-muted-foreground p-6 text-sm">{tc('fetching')}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          {t('empty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.fbck_id}
              className={`space-y-2 rounded-lg border p-3 ${r.hide_yn === 'Y' ? 'opacity-50' : ''} ${r.del_yn === 'Y' ? 'line-through opacity-30' : ''}`}
            >
              {/* 상단: 사용자 + 별점 + 날짜 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-amber-500">
                    {STAR[r.fbck_scr]}
                  </span>
                  <span className="font-medium">
                    {r.raw_username ?? r.display_name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    ({r.display_name})
                  </span>
                  {r.rwrd_yn === 'Y' && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      {t('beanReward', { qty: r.bean_rwrd_qty })}
                    </span>
                  )}
                  {r.hide_yn === 'Y' && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-600 dark:bg-red-900 dark:text-red-300">
                      {t('badgeHidden')}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(r.reg_dtm).toLocaleString('ko-KR')}
                </span>
              </div>

              {/* 후기 본문 */}
              <p className="text-sm leading-relaxed">{r.fbck_cn}</p>

              {/* 메타 정보 */}
              <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                {r.shop_id && (
                  <span>
                    {t('cafe')}{' '}
                    <code className="bg-muted rounded px-1">
                      {r.shop_id.slice(0, 8)}…
                    </code>
                  </span>
                )}
                {r.order_id && (
                  <span>
                    {t('order')}{' '}
                    <code className="bg-muted rounded px-1">
                      {r.order_id.slice(0, 8)}…
                    </code>
                  </span>
                )}
                {r.hide_reason_txt && (
                  <span className="text-red-500">
                    {t('reasonPrefix', { reason: r.hide_reason_txt })}
                  </span>
                )}
              </div>

              {/* 액션 */}
              {r.del_yn === 'N' && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openHideModal(r)}
                    className={`text-xs hover:underline ${r.hide_yn === 'Y' ? 'text-green-600' : 'text-destructive'}`}
                  >
                    {r.hide_yn === 'Y' ? t('restorePublic') : t('hideAction')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <AdminPagination page={page} totalPages={totalPages} onPage={setPage} />

      {/* 숨김 처리 모달 */}
      {hideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card w-full max-w-sm space-y-4 rounded-xl border p-5 shadow-xl">
            <h2 className="font-semibold">
              {hideModal.current === 'N'
                ? t('modalHideTitle')
                : t('modalRestoreTitle')}
            </h2>

            {hideModal.current === 'N' && (
              <div className="space-y-1">
                <label className="text-muted-foreground text-sm">
                  {t('hideReasonLabel')}
                </label>
                <select
                  value={hideReason}
                  onChange={(e) => setHideReason(e.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">{t('reasonSelect')}</option>
                  <option value="욕설·비방">{t('reason.abuse')}</option>
                  <option value="스팸·광고">{t('reason.spam')}</option>
                  <option value="허위 정보">{t('reason.false')}</option>
                  <option value="음란·선정성">{t('reason.sexual')}</option>
                  <option value="기타">{t('reason.etc')}</option>
                </select>
              </div>
            )}

            {hideModal.current === 'Y' && (
              <p className="text-muted-foreground text-sm">
                {t('restoreConfirm')}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setHideModal(null)}
                disabled={saving}
                className="border-input hover:bg-accent rounded-md border px-4 py-2 text-sm disabled:opacity-50"
              >
                {tc('cancel')}
              </button>
              <button
                type="button"
                onClick={submitHide}
                disabled={saving}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${hideModal.current === 'N' ? 'bg-destructive hover:bg-destructive/90' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {saving
                  ? tc('processing')
                  : hideModal.current === 'N'
                    ? t('hideAction')
                    : t('restorePublic')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

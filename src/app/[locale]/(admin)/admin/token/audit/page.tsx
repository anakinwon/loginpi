'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { BeanIcon } from '@/components/ui/bean-icon'

interface AuditRow {
  audit_id: string
  usr_id: string
  adj_before: number
  adj_bean: number
  adj_after: number
  reason_txt: string
  adj_admin_id: string
  evidence_url: string | null
  reg_dtm: string
  sys_user: {
    pi_username: string | null
    nick_nm: string | null
    real_nm: string | null
  } | null
}

// 조정 사유 코드값 — 표시 라벨은 i18n(adminToken.wallets.reason.*) 공용
const REASON_CODES = [
  'REFUND_PI_PAYMENT',
  'REWARD_EVENT',
  'REWARD_PROMOTION',
  'CORRECTION_OVERPAY',
  'CORRECTION_UNDERPAY',
  'PENALTY_ABUSE',
  'TEST_ADMIN',
]

export default function BeanAuditLogPage() {
  const t = useTranslations()
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterUsrId, setFilterUsrId] = useState('')

  const load = (usrId?: string) => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ limit: '100' })
    if (usrId) params.set('usr_id', usrId)
    fetch(`/api/admin/token/audit?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ data: AuditRow[]; total: number }>
      })
      .then((d) => {
        setRows(d.data)
        setTotal(d.total)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleFilter = () => {
    load(filterUsrId.trim() || undefined)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BeanIcon className="inline-block h-6 w-6" />{' '}
          {t('adminToken.audit.title')}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('adminToken.audit.subtitle')}
        </p>
      </div>

      {/* 사용자 필터 */}
      <div className="flex items-end gap-2">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs">
            {t('adminToken.audit.usrIdFilterLabel')}
          </label>
          <input
            type="text"
            value={filterUsrId}
            onChange={(e) => setFilterUsrId(e.target.value)}
            placeholder={t('adminToken.audit.usrIdFilterPlaceholder')}
            className="border-input bg-background h-9 w-72 rounded-md border px-3 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <button
          onClick={handleFilter}
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium hover:opacity-90"
        >
          {t('adminToken.audit.query')}
        </button>
        {filterUsrId && (
          <button
            onClick={() => {
              setFilterUsrId('')
              load()
            }}
            className="text-muted-foreground hover:bg-muted h-9 rounded-md border px-3 text-sm"
          >
            {t('common.reset')}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">{t('common.fetching')}</p>
      )}
      {error && (
        <p className="text-sm text-red-500">
          {t('adminToken.errorMsg', { msg: error })}
        </p>
      )}

      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-xs">
            {t('adminToken.audit.totalCount', {
              count: total.toLocaleString(),
            })}
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('adminToken.audit.noRecord')}
            </p>
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">
                      {t('adminToken.audit.colDtm')}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t('adminToken.audit.colTargetUser')}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t('adminToken.audit.colBefore')}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t('adminToken.audit.colAdj')}
                    </th>
                    <th className="px-4 py-2 text-right font-medium">
                      {t('adminToken.audit.colAfter')}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t('adminToken.audit.colReason')}
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      {t('adminToken.audit.colEvidence')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => {
                    const isGrant = row.adj_bean > 0
                    // javascript:/data: URL Stored XSS 방어 — http(s)만 허용
                    const safeEvidenceUrl = (() => {
                      if (!row.evidence_url) return null
                      try {
                        const u = new URL(row.evidence_url)
                        return u.protocol === 'https:' || u.protocol === 'http:'
                          ? u.toString()
                          : null
                      } catch {
                        return null
                      }
                    })()
                    return (
                      <tr
                        key={row.audit_id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="text-muted-foreground px-4 py-3 text-xs whitespace-nowrap">
                          {new Date(row.reg_dtm).toLocaleString('ko-KR')}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">
                            {row.sys_user?.nick_nm ||
                              row.sys_user?.real_nm ||
                              '—'}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {row.sys_user?.pi_username
                              ? `@${row.sys_user.pi_username}`
                              : row.usr_id.slice(0, 8)}
                          </p>
                        </td>
                        <td className="text-muted-foreground px-4 py-3 text-right tabular-nums">
                          {row.adj_before.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span
                            className={`font-semibold ${isGrant ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                          >
                            {isGrant ? '+' : ''}
                            {row.adj_bean.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {row.adj_after.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="bg-muted rounded px-1.5 py-0.5 text-xs">
                            {REASON_CODES.includes(row.reason_txt)
                              ? t(`adminToken.wallets.reason.${row.reason_txt}`)
                              : row.reason_txt}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {safeEvidenceUrl ? (
                            <a
                              href={safeEvidenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline dark:text-blue-400"
                            >
                              {t('adminToken.audit.viewEvidence')}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
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

const REASON_LABEL: Record<string, string> = {
  REFUND_PI_PAYMENT: 'Pi 결제 환불 보상',
  REWARD_EVENT: '이벤트 보상',
  REWARD_PROMOTION: '프로모션 보상',
  CORRECTION_OVERPAY: '과충전 정정',
  CORRECTION_UNDERPAY: '미충전 정정',
  PENALTY_ABUSE: '어뷰징 패널티',
  TEST_ADMIN: '관리자 테스트',
}

export default function BeanAuditLogPage() {
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
          <BeanIcon className="inline-block h-6 w-6" /> Bean 수동 조정 감사 로그
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          어드민이 실행한 모든 Bean 수동 조정 내역 (P0-4 · PRD_16 §14)
        </p>
      </div>

      {/* 사용자 필터 */}
      <div className="flex items-end gap-2">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs">
            usr_id 필터 (선택)
          </label>
          <input
            type="text"
            value={filterUsrId}
            onChange={(e) => setFilterUsrId(e.target.value)}
            placeholder="UUID 입력 후 조회"
            className="border-input bg-background h-9 w-72 rounded-md border px-3 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
          />
        </div>
        <button
          onClick={handleFilter}
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium hover:opacity-90"
        >
          조회
        </button>
        {filterUsrId && (
          <button
            onClick={() => {
              setFilterUsrId('')
              load()
            }}
            className="text-muted-foreground h-9 rounded-md border px-3 text-sm hover:bg-muted"
          >
            초기화
          </button>
        )}
      </div>

      {loading && <p className="text-muted-foreground text-sm">불러오는 중...</p>}
      {error && <p className="text-sm text-red-500">오류: {error}</p>}

      {!loading && !error && (
        <>
          <p className="text-muted-foreground text-xs">
            총 {total.toLocaleString()}건 (최근 100건 표시)
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">조정 내역이 없습니다.</p>
          ) : (
            <div className="overflow-hidden overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">일시</th>
                    <th className="px-4 py-2 text-left font-medium">대상 사용자</th>
                    <th className="px-4 py-2 text-right font-medium">조정 전</th>
                    <th className="px-4 py-2 text-right font-medium">조정량</th>
                    <th className="px-4 py-2 text-right font-medium">조정 후</th>
                    <th className="px-4 py-2 text-left font-medium">사유</th>
                    <th className="px-4 py-2 text-left font-medium">증빙</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => {
                    const isGrant = row.adj_bean > 0
                    return (
                      <tr
                        key={row.audit_id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap text-xs">
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
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {REASON_LABEL[row.reason_txt] ?? row.reason_txt}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.evidence_url ? (
                            <a
                              href={row.evidence_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline dark:text-blue-400"
                            >
                              증빙 보기
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

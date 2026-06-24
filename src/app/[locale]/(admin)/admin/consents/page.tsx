'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface Row {
  consent_id: string
  user_str_id: string
  user_nm: string
  pi_username: string | null
  consent_tp_cd: string
  consent_yn: string
  consent_ver: string | null
  client_ip: string | null
  reg_dtm: string
}

const TYPE_LABEL: Record<string, string> = {
  TERMS: '이용약관',
  PRIVACY: '개인정보',
  LBS: '위치정보',
  MKT: '마케팅',
  AGE14: '연령(만14세)',
  GUARDIAN: '법정대리인',
}
const TYPE_FILTERS = ['', 'TERMS', 'PRIVACY', 'LBS', 'MKT', 'AGE14', 'GUARDIAN'] as const

export default function ConsentsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (type) params.set('type', type)
      if (search) params.set('q', search)
      const res = await piFetch(`/api/admin/consents?${params}`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { rows: Row[]; total: number }
      setRows(d.rows)
      setTotal(d.total)
    } catch {
      toast.error('동의 내역을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [page, type, search])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">📜 약관 동의 내역</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          사용자별 약관·개인정보·위치·마케팅·연령 동의 이력 (총 {total.toLocaleString()}건)
        </p>
      </div>

      {/* 검색 */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setSearch(q)
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="요원명·닉네임 검색"
          className="border-input bg-background min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
        >
          검색
        </button>
      </form>

      {/* 유형 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            onClick={() => {
              setPage(1)
              setType(t)
            }}
            className={`rounded-full border px-3 py-1 text-xs ${type === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {t === '' ? '전체' : TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground p-6 text-sm">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          동의 내역이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">사용자</th>
                <th className="px-3 py-2 text-left font-medium">유형</th>
                <th className="px-3 py-2 text-center font-medium">동의</th>
                <th className="px-3 py-2 text-left font-medium">버전</th>
                <th className="px-3 py-2 text-left font-medium">일시</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.consent_id}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.user_nm}</span>
                    {r.pi_username && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        @{r.pi_username}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {TYPE_LABEL[r.consent_tp_cd] ?? r.consent_tp_cd}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.consent_yn === 'Y' ? (
                      <span className="text-green-600 dark:text-green-400">✓ 동의</span>
                    ) : (
                      <span className="text-muted-foreground">✕ 철회</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {r.consent_ver ?? '—'}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {new Date(r.reg_dtm).toLocaleString()}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {r.client_ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-muted-foreground text-xs">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}

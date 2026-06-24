'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

interface Row {
  user_str_id: string
  user_nm: string
  pi_username: string | null
  status: Record<string, string | null> // type → 'Y'|'N'|null
  latest_dtm: string
}

// 표시 유형 열 (약관·개인정보·위치=필수 / 마케팅·연령·보호자)
const COLS: { key: string; label: string }[] = [
  { key: 'TERMS', label: '약관' },
  { key: 'PRIVACY', label: '개인정보' },
  { key: 'LBS', label: '위치' },
  { key: 'MKT', label: '마케팅' },
  { key: 'AGE14', label: '연령' },
  { key: 'GUARDIAN', label: '보호자' },
]

function Cell({ v }: { v: string | null }) {
  if (v === 'Y') return <span className="text-green-600 dark:text-green-400">✓</span>
  if (v === 'N') return <span className="text-red-500">✕</span>
  return <span className="text-muted-foreground">—</span>
}

export default function ConsentsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
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
  }, [page, search])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / 30))

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold">📜 약관 동의 내역</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          사용자별 동의 현황 (유형별 최신 상태 · 총 {total.toLocaleString()}명)
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
                {COLS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-center font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium">최근 동의</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.user_str_id}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-medium">{r.user_nm}</span>
                    {r.pi_username && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        @{r.pi_username}
                      </span>
                    )}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-2 py-2 text-center">
                      <Cell v={r.status[c.key] ?? null} />
                    </td>
                  ))}
                  <td className="text-muted-foreground px-3 py-2 text-xs whitespace-nowrap">
                    {new Date(r.latest_dtm).toLocaleString()}
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

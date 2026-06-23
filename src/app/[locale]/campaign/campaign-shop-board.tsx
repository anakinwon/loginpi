'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { piFetch } from '@/lib/pi-fetch'
import type { ShopConditionRow } from '@/app/api/campaign/shops/route'

interface ShopsResponse {
  shops: ShopConditionRow[]
  is_admin: boolean
  my_seller_id: string | null
}

const COND_LABELS: { key: keyof ShopConditionRow['conditions']; label: string }[] = [
  { key: 'shop',      label: 'M1 매장' },
  { key: 'item',      label: 'M2 상품' },
  { key: 'telegram',  label: 'M3 연동' },
  { key: 'tlgm_alrt', label: 'M4 알림' },
]

const PAGE_SIZE = 20 // 페이지당 매장 수

// 마지막 수행일시 — 현지 시간대 날짜+시·분 (메모리: 현지 형식 표시 규칙)
function fmtLastDtm(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export function CampaignShopBoard() {
  const [rows, setRows] = useState<ShopConditionRow[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [mySellerId, setMySellerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granting, setGranting] = useState(false) // 관리자 일괄 지급 진행
  const [search, setSearch] = useState('') // 요원명(username) 검색
  const [page, setPage] = useState(1) // 페이지네이션

  // q: 요원명 검색 — 서버에서 pg_trgm(.ilike)로 필터 (sql/086·101)
  const loadShops = useCallback(async (q = '') => {
    try {
      const url = q.trim()
        ? `/api/campaign/shops?q=${encodeURIComponent(q.trim())}`
        : '/api/campaign/shops'
      const res = await piFetch(url)
      if (!res.ok) throw new Error((await res.json()).error ?? '오류')
      const data = (await res.json()) as ShopsResponse
      setRows(data.shops ?? [])
      setIsAdmin(!!data.is_admin)
      setMySellerId(data.my_seller_id ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadShops()
  }, [loadShops])

  // 요원명 검색 — 입력 즉시(300ms debounce) 서버 trgm 검색. 초기 로드는 위 useEffect가 담당(첫 렌더 스킵)
  const firstSearchRef = useRef(true)
  useEffect(() => {
    if (firstSearchRef.current) {
      firstSearchRef.current = false
      return
    }
    const id = setTimeout(() => {
      setPage(1)
      void loadShops(search)
    }, 300)
    return () => clearTimeout(id)
  }, [search, loadShops])

  // 관리자 전용: 3조건 완수 매장 전원에게 보상 일괄 지급 (Event #1 보상 버튼과 동일 패턴)
  const handleGrantAll = async () => {
    if (granting) return
    if (
      !window.confirm(
        `${totalConds}조건(매장·상품·텔레그램·알림확인)을 완수한 매장 전원에게 보상을 지급합니다.\n이미 지급된 매장은 자동으로 제외됩니다. 진행할까요?`,
      )
    )
      return
    setGranting(true)
    try {
      const res = await piFetch('/api/admin/campaign/grant-all', {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? '보상 지급에 실패했습니다')
        return
      }
      alert(
        `보상 지급 완료\n` +
          `· 자격자(${totalConds}조건 완수): ${data.eligible}명\n` +
          `· 신규 지급: ${data.granted}명\n` +
          `· 이미 지급(건너뜀): ${data.already}명` +
          (data.failed ? `\n· 실패: ${data.failed}명` : ''),
      )
      await loadShops()
    } catch {
      alert('네트워크 오류가 발생했습니다')
    } finally {
      setGranting(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  if (error)
    return <p className="text-muted-foreground text-center text-sm">{error}</p>
  if (!rows.length)
    return (
      <p className="text-muted-foreground text-center text-sm">
        등록된 매장이 없습니다
      </p>
    )

  const totalConds = COND_LABELS.length
  const fullCnt = rows.filter(
    (r) => Object.values(r.conditions).every(Boolean),
  ).length

  // 순위는 페이징 전에 부여(1~N 유지). rows는 route에서 완료수 desc 정렬됨.
  // 요원명 검색은 서버(pg_trgm .ilike)에서 필터됨 — rows가 이미 검색 결과
  const filtered = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const curPage = Math.min(page, totalPages) // 범위 보정(렌더 중 setState 금지)
  const paged = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          참여 매장주 현황{' '}
          <span className="text-muted-foreground text-sm font-normal">
            ({rows.length}명 · {totalConds}조건 완료{' '}
            <span className="text-primary font-semibold">{fullCnt}</span>명)
          </span>
        </h3>
        {isAdmin && (
          <button
            type="button"
            onClick={handleGrantAll}
            disabled={granting}
            title={`${totalConds}조건(매장·상품·텔레그램·알림확인) 완수 매장 전원에게 보상 일괄 지급 (관리자 전용)`}
            className="rounded-md border border-amber-500 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          >
            {granting ? '지급 중…' : '🎁 완수자 일괄 지급'}
          </button>
        )}
      </div>

      {/* 요원명(username) 검색 — 입력 시 1페이지로 리셋 */}
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
        placeholder="요원명(username)·매장명 검색"
        className="border-input bg-background focus:ring-primary/30 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none sm:max-w-xs"
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th className="bg-muted sticky left-0 z-10 w-12 px-2 py-2.5 text-center font-semibold">
                순위
              </th>
              <th className="bg-muted sticky left-12 z-10 px-3 py-2.5 text-left font-semibold">
                매장명
              </th>
              {/* 완료 — M1 매장 왼쪽으로 이동 */}
              <th className="px-3 py-2.5 text-center font-semibold">완료</th>
              {COND_LABELS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2.5 text-center font-semibold whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                마지막 수행일시
              </th>
              <th className="px-3 py-2.5 text-center font-semibold">보상</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const doneCnt = Object.values(r.conditions).filter(Boolean).length
              const allDone = doneCnt === totalConds
              const isMe = !!mySellerId && r.seller_id === mySellerId
              return (
                <tr
                  key={r.shop_id}
                  className={[
                    'hover:bg-muted/50 border-b transition-colors',
                    allDone ? 'bg-green-50/60 dark:bg-green-950/20' : '',
                    isMe ? 'ring-primary/40 ring-inset ring-2' : '',
                  ].join(' ')}
                >
                  {/* 순위 */}
                  <td className="bg-card sticky left-0 z-10 w-12 px-2 py-2.5 text-center font-semibold tabular-nums">
                    {r.rank}
                  </td>

                  {/* 대표 매장명 + 판매자 */}
                  <td className="bg-card sticky left-12 z-10 px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{r.shop_nm}</span>
                      {isMe && (
                        <span className="bg-primary/10 text-primary rounded px-1 py-0.5 text-xs font-semibold">
                          내 매장
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      {r.pi_username ? `@${r.pi_username}` : '—'}
                    </div>
                    {r.shop_count > 1 && (
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        대표 매장 · 총 {r.shop_count}개 보유
                      </div>
                    )}
                  </td>

                  {/* 완료 카운트 — M1 매장 왼쪽으로 이동 */}
                  <td className="px-3 py-2.5 text-center font-bold">
                    <span
                      className={
                        allDone
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {doneCnt}/{totalConds}
                    </span>
                  </td>

                  {/* 조건별 ✓ / ✗ */}
                  {COND_LABELS.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 text-center">
                      {r.conditions[c.key] ? (
                        <span className="font-bold text-green-600 dark:text-green-400">
                          ✓
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  ))}

                  {/* 마지막 수행일시 — M1~M3 충족 시각의 max */}
                  <td className="text-muted-foreground px-3 py-2.5 text-center text-xs whitespace-nowrap">
                    {fmtLastDtm(r.last_cond_dtm)}
                  </td>

                  {/* 보상 상태 — Event #1과 동일 3단계 (미션수행중 / 보상대기 / 보상완료) */}
                  <td className="px-3 py-2.5 text-center">
                    {!allDone ? (
                      // ① 미션수행중 — 조건 미완수
                      <span
                        className="text-muted-foreground inline-flex flex-col items-center gap-0.5 text-base"
                        title="미션수행중"
                      >
                        🥺
                        <span className="text-[10px] font-medium">
                          미션수행중
                        </span>
                      </span>
                    ) : r.grant_status === 'APPROVED' ? (
                      // ③ 보상완료 — 조건 완수 + 지급됨
                      <span
                        className="inline-flex flex-col items-center gap-0.5 text-base"
                        title="보상완료"
                      >
                        ✅
                        <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                          보상완료
                        </span>
                      </span>
                    ) : (
                      // ② 보상대기 — 조건 완수, 아직 미지급(PENDING/REJECTED/미신청)
                      <span
                        className="inline-flex flex-col items-center gap-0.5 text-base"
                        title="보상대기"
                      >
                        🎁
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          보상대기
                        </span>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 검색 결과 없음 */}
      {filtered.length === 0 && (
        <p className="text-muted-foreground py-4 text-center text-sm">
          검색 결과가 없습니다
        </p>
      )}

      {/* 페이지네이션 — 반응형 (한 줄, 모바일·데스크탑 공통) */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {filtered.length}명 중 {(curPage - 1) * PAGE_SIZE + 1}–
            {Math.min(curPage * PAGE_SIZE, filtered.length)}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={curPage <= 1}
              className="hover:bg-muted rounded-md border px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              이전
            </button>
            <span className="px-2 tabular-nums">
              {curPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={curPage >= totalPages}
              className="hover:bg-muted rounded-md border px-3 py-1.5 transition-colors disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

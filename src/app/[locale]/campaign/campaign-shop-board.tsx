'use client'

import { useCallback, useEffect, useState } from 'react'
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

export function CampaignShopBoard() {
  const [rows, setRows] = useState<ShopConditionRow[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [mySellerId, setMySellerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granting, setGranting] = useState(false) // 관리자 일괄 지급 진행

  const loadShops = useCallback(async () => {
    try {
      const res = await piFetch('/api/campaign/shops')
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

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th className="bg-muted sticky left-0 z-10 px-3 py-2.5 text-left font-semibold">
                매장명
              </th>
              {COND_LABELS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-2.5 text-center font-semibold whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold">완료</th>
              <th className="px-3 py-2.5 text-center font-semibold">보상</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
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
                  {/* 대표 매장명 + 판매자 */}
                  <td className="bg-card sticky left-0 z-10 px-3 py-2.5">
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

                  {/* 완료 카운트 */}
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
    </div>
  )
}

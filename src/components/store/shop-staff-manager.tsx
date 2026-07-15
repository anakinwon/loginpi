'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApiErrorMessage, type ApiErrorPayload } from '@/hooks/use-api-error'

interface StaffRow {
  usr_id: string
  pi_username: string | null
  name: string
  reg_dtm: string
}

// 판매 관리 매니저 등록/해제 (mps_shop_staff) — 매장 보기 소유자 영역에 표시.
//   등록 매니저 = 판매 관리 열람 + 주문 상태 변경(접수·준비완료·거래완료). 해제=논리삭제(del_yn).
//   판매 관리 권한의 단일 관리 지점 — Telegram 그룹은 순수 알림 채널(권한 무관).
export function ShopStaffManager({ shopId }: { shopId: string }) {
  const t = useTranslations('store')
  const tc = useTranslations('common')
  const apiErr = useApiErrorMessage()
  const [staff, setStaff] = useState<StaffRow[] | null>(null)
  const [uname, setUname] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await piFetch(`/api/store/shops/${shopId}/staff`)
      if (res.ok) {
        const d = (await res.json()) as { staff: StaffRow[] }
        setStaff(d.staff)
      }
    } catch {
      // 비치명적 — 카드 미표시
    }
  }, [shopId])

  useEffect(() => {
    void load()
  }, [load])

  // 콤마 구분 다중 등록 — "anakin2, cclemong"처럼 한 번에 여러 명. 실패자는 개별 안내
  async function add() {
    const names = [
      ...new Set(
        uname
          .split(',')
          .map((s) => s.trim().replace(/^@/, ''))
          .filter(Boolean),
      ),
    ]
    if (names.length === 0) return
    setBusy(true)
    try {
      let ok = 0
      for (const n of names) {
        const res = await piFetch(`/api/store/shops/${shopId}/staff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pi_username: n }),
        })
        const data = (await res.json()) as ApiErrorPayload & { ok?: boolean }
        if (res.ok && data.ok) {
          ok++
        } else {
          toast.error(`${n} — ${apiErr(data, t('staffMgr.addFail'))}`)
        }
      }
      if (ok > 0) {
        toast.success(t('staffMgr.added', { n: ok }))
        setUname('')
        void load()
      }
    } catch {
      toast.error(tc('networkError'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: StaffRow) {
    if (!confirm(t('staffMgr.removeConfirm', { name: m.name }))) return
    setBusy(true)
    try {
      await piFetch(
        `/api/store/shops/${shopId}/staff?usr=${encodeURIComponent(m.usr_id)}`,
        { method: 'DELETE' },
      )
      toast.success(t('staffMgr.removed', { name: m.name }))
      void load()
    } catch {
      toast.error(tc('networkError'))
    } finally {
      setBusy(false)
    }
  }

  if (staff === null) return null

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/20">
      <p className="text-sm font-medium">{t('staffMgr.title')}</p>
      <p className="text-muted-foreground text-xs">{t('staffMgr.desc')}</p>

      <div className="flex items-center gap-2">
        <Input
          value={uname}
          onChange={(e) => setUname(e.target.value)}
          placeholder={t('staffMgr.inputPlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
        />
        <Button size="sm" onClick={add} disabled={busy || !uname.trim()}>
          {busy ? tc('processing') : t('staffMgr.addBtn')}
        </Button>
      </div>

      {/* 등록 매니저 칩 목록 — × 클릭 시 논리삭제(del_yn) 해제 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs">
          {t('staffMgr.listLabel')}
        </span>
        {staff.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t('staffMgr.empty')}
          </span>
        ) : (
          staff.map((m) => (
            <span
              key={m.usr_id}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
            >
              {m.name}
              <button
                type="button"
                onClick={() => remove(m)}
                disabled={busy}
                aria-label={t('staffMgr.removeBtn')}
                title={t('staffMgr.removeBtn')}
                className="px-0.5 leading-none font-bold text-rose-500 hover:text-rose-700 disabled:opacity-50 dark:text-rose-400 dark:hover:text-rose-300"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <p className="text-muted-foreground text-[11px]">{t('staffMgr.note')}</p>
    </div>
  )
}

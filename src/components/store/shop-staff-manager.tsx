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

  async function add() {
    const v = uname.trim()
    if (!v) return
    setBusy(true)
    try {
      const res = await piFetch(`/api/store/shops/${shopId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pi_username: v }),
      })
      const data = (await res.json()) as ApiErrorPayload & { ok?: boolean }
      if (res.ok && data.ok) {
        toast.success(t('staffMgr.added', { name: v }))
        setUname('')
        void load()
      } else {
        toast.error(apiErr(data, t('staffMgr.addFail')))
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

      {staff.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('staffMgr.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {staff.map((m) => (
            <li
              key={m.usr_id}
              className="bg-card flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
            >
              <span className="truncate text-xs font-medium">
                {m.name}
                {m.pi_username && m.pi_username !== m.name && (
                  <span className="text-muted-foreground">
                    {' '}
                    @{m.pi_username}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(m)}
                disabled={busy}
                className="text-destructive shrink-0 text-xs underline underline-offset-2 disabled:opacity-50"
              >
                {t('staffMgr.removeBtn')}
              </button>
            </li>
          ))}
        </ul>
      )}

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
      <p className="text-muted-foreground text-[11px]">{t('staffMgr.note')}</p>
    </div>
  )
}

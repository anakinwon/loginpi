'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { piFetch } from '@/lib/pi-fetch'

// 재사용 신고 버튼 — 게시물·댓글·상점·사용자·채팅 공통.
// 사유 선택 + 상세 → POST /api/report. i18n(report 네임스페이스).
type TargetType = 'POST' | 'COMMENT' | 'SHOP' | 'USER' | 'CHAT'
const REASONS = ['SPAM', 'ABUSE', 'SEXUAL', 'PRIVACY', 'COPYRIGHT', 'FRAUD', 'ETC'] as const

interface Props {
  targetTp: TargetType
  targetId: string
  className?: string
}

export function ReportButton({ targetTp, targetId, className }: Props) {
  const t = useTranslations('report')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)

  function close() {
    setOpen(false)
    setReason('')
    setDetail('')
  }

  async function submit() {
    if (!reason || sending) return
    setSending(true)
    try {
      const res = await piFetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_tp: targetTp,
          target_id: targetId,
          reason_cd: reason,
          reason_txt: detail,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; duplicate?: boolean }
      if (res.ok) {
        toast.success(d.duplicate ? t('duplicate') : t('success'))
        close()
      } else {
        toast.error(d.error ?? t('error'))
      }
    } catch {
      toast.error(t('error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'text-muted-foreground hover:text-foreground text-xs underline'
        }
      >
        {t('button')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            className="bg-background w-full max-w-sm rounded-t-2xl p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold">{t('title')}</h2>

            <p className="text-muted-foreground mt-3 text-xs font-medium">
              {t('reasonLabel')}
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-lg border px-2 py-1.5 text-xs ${reason === r ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                >
                  {t(r)}
                </button>
              ))}
            </div>

            <p className="text-muted-foreground mt-3 text-xs font-medium">
              {t('detailLabel')}
            </p>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t('detailPlaceholder')}
              rows={3}
              maxLength={1000}
              className="border-input bg-background mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!reason || sending}
                onClick={submit}
                className="bg-primary text-primary-foreground flex-1 rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {sending ? '…' : t('submit')}
              </button>
              <button
                type="button"
                onClick={close}
                className="hover:bg-muted text-muted-foreground rounded-xl border px-4 py-2.5 text-sm"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

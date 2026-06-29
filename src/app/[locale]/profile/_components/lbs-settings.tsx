'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { piFetch } from '@/lib/pi-fetch'
import { Button } from '@/components/ui/button'
import { LbsConsentDialog } from '@/components/lbs/lbs-consent-dialog'

interface ConsentStatus {
  consent_yn: 'Y' | 'N'
  consent_dtm: string | null
  consent_ver: string | null
}

interface LocHistItem {
  loc_hist_id: string
  loc_tp_cd: string
  sido_nm: string | null
  sigungu_nm: string | null
  dong_nm: string | null
  reg_dtm: string
}

// 위치 수집 유형 코드 → lbs.<key> 번역키 (모듈 상수 X — useTranslations 불가)
const LOC_TP_KEY: Record<string, string> = {
  '01': 'locTypeJoin',
  '02': 'locTypeLogin',
  '03': 'locTypeShop',
  '04': 'locTypeTrade',
}

export function LbsSettings() {
  const t = useTranslations('profile')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [status, setStatus] = useState<ConsentStatus | null>(null)
  const [history, setHistory] = useState<LocHistItem[]>([])
  const [consentOpen, setConsentOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [histLoading, setHistLoading] = useState(false)

  const loadStatus = useCallback(async () => {
    const res = await piFetch('/api/location/consent')
    if (res.ok) setStatus(await res.json())
  }, [])

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    try {
      const res = await piFetch('/api/location/history')
      if (res.ok) {
        const d = (await res.json()) as { items: LocHistItem[] }
        setHistory(d.items ?? [])
      }
    } finally {
      setHistLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (status?.consent_yn === 'Y') void loadHistory()
  }, [status, loadHistory])

  async function handleRevoke() {
    if (!confirm(t('lbs.revokeConfirm'))) return
    setRevoking(true)
    try {
      const res = await piFetch('/api/location/consent', { method: 'DELETE' })
      if (res.ok) {
        setStatus({ consent_yn: 'N', consent_dtm: null, consent_ver: null })
        setHistory([])
      }
    } finally {
      setRevoking(false)
    }
  }

  if (!status) {
    return (
      <p className="text-muted-foreground py-4 text-sm">{tc('fetching')}</p>
    )
  }

  return (
    <div className="space-y-6">
      {/* 동의 상태 카드 */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t('lbs.title')}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t('lbs.subtitle')}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              status.consent_yn === 'Y'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {status.consent_yn === 'Y' ? t('lbs.agreed') : t('lbs.notAgreed')}
          </span>
        </div>

        {status.consent_yn === 'Y' && status.consent_dtm && (
          <p className="text-muted-foreground text-xs">
            {t('lbs.consentedAt', {
              date: new Date(status.consent_dtm).toLocaleString(locale),
            })}
            {status.consent_ver && ` (${status.consent_ver})`}
          </p>
        )}

        {status.consent_yn === 'Y' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevoke}
            disabled={revoking}
            className="text-destructive border-destructive/30 hover:bg-destructive/5 w-full"
          >
            {revoking ? t('lbs.revoking') : t('lbs.revokeBtn')}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setConsentOpen(true)}
            className="w-full"
          >
            {t('lbs.agreeCta')}
          </Button>
        )}
      </div>

      {/* 위치 이력 열람 — 정보주체 열람권 (위치정보법 제16조) */}
      {status.consent_yn === 'Y' && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('lbs.historyTitle')}</p>
          <p className="text-muted-foreground text-xs">
            {t('lbs.historyDesc')}
          </p>
          {histLoading ? (
            <p className="text-muted-foreground py-2 text-xs">
              {tc('fetching')}
            </p>
          ) : history.length === 0 ? (
            <p className="text-muted-foreground py-2 text-xs">
              {t('lbs.noHistory')}
            </p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {history.map((h) => (
                <li
                  key={h.loc_hist_id}
                  className="bg-muted/50 flex items-center justify-between rounded px-3 py-2 text-xs"
                >
                  <span className="text-muted-foreground">
                    <span className="text-foreground font-medium">
                      {LOC_TP_KEY[h.loc_tp_cd]
                        ? t(`lbs.${LOC_TP_KEY[h.loc_tp_cd]}`)
                        : h.loc_tp_cd}
                    </span>{' '}
                    ·{' '}
                    {[h.sido_nm, h.sigungu_nm, h.dong_nm]
                      .filter(Boolean)
                      .join(' ') || t('lbs.noLocation')}
                  </span>
                  <span className="text-muted-foreground ml-2 shrink-0">
                    {new Date(h.reg_dtm).toLocaleDateString(locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <LbsConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onConsented={() => {
          void loadStatus()
        }}
      />
    </div>
  )
}

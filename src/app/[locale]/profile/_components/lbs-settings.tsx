'use client'

import { useCallback, useEffect, useState } from 'react'
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

const LOC_TP_LABEL: Record<string, string> = {
  '01': '가입',
  '02': '로그인',
  '03': '매장 등록',
  '04': '상품 거래',
}

export function LbsSettings() {
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
    if (!confirm('위치 서비스 동의를 철회하면 수집된 위치 정보가 즉시 삭제됩니다. 계속하시겠습니까?')) return
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
    return <p className="text-muted-foreground text-sm py-4">불러오는 중...</p>
  }

  return (
    <div className="space-y-6">
      {/* 동의 상태 카드 */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">위치 기반 서비스</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              주변 상품·매장·채팅방 탐색 기능
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              status.consent_yn === 'Y'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {status.consent_yn === 'Y' ? '동의' : '미동의'}
          </span>
        </div>

        {status.consent_yn === 'Y' && status.consent_dtm && (
          <p className="text-muted-foreground text-xs">
            동의일시: {new Date(status.consent_dtm).toLocaleString('ko-KR')}
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
            {revoking ? '철회 중...' : '동의 철회 (위치 정보 즉시 삭제)'}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setConsentOpen(true)}
            className="w-full"
          >
            📍 위치 서비스 동의하기
          </Button>
        )}
      </div>

      {/* 위치 이력 열람 — 정보주체 열람권 (위치정보법 제16조) */}
      {status.consent_yn === 'Y' && (
        <div className="space-y-2">
          <p className="text-sm font-medium">내 위치 수집 이력</p>
          <p className="text-muted-foreground text-xs">
            위치정보법 제16조에 따른 정보주체 열람권. 행정구역 단위만 표시됩니다.
          </p>
          {histLoading ? (
            <p className="text-muted-foreground text-xs py-2">불러오는 중...</p>
          ) : history.length === 0 ? (
            <p className="text-muted-foreground text-xs py-2">
              수집된 위치 이력이 없습니다.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {history.map((h) => (
                <li
                  key={h.loc_hist_id}
                  className="bg-muted/50 rounded px-3 py-2 text-xs flex items-center justify-between"
                >
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {LOC_TP_LABEL[h.loc_tp_cd] ?? h.loc_tp_cd}
                    </span>{' '}
                    ·{' '}
                    {[h.sido_nm, h.sigungu_nm, h.dong_nm]
                      .filter(Boolean)
                      .join(' ') || '위치 정보 없음'}
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {new Date(h.reg_dtm).toLocaleDateString('ko-KR')}
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

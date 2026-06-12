'use client'

import { useState } from 'react'
import { piFetch } from '@/lib/pi-fetch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConsented: () => void
}

export function LbsConsentDialog({ open, onOpenChange, onConsented }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConsent() {
    setLoading(true)
    try {
      const res = await piFetch('/api/location/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_ver: 'v1.0' }),
      })
      if (res.ok) {
        onConsented()
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>📍 위치 기반 서비스 동의</DialogTitle>
          <DialogDescription>
            주변 상품·매장·채팅방 탐색을 위해 위치 정보를 수집합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted rounded-lg p-3 text-xs leading-relaxed space-y-1.5">
          <p className="font-medium text-foreground">수집·이용 목적</p>
          <ul className="text-muted-foreground space-y-1 list-disc list-inside">
            <li>주변 직거래 상품·매장 검색 및 거리 표시</li>
            <li>주변 채팅방 탐색 및 지역 기반 커뮤니티</li>
            <li>부정 이용 방지 및 서비스 품질 향상</li>
          </ul>
          <p className="font-medium text-foreground pt-1">보유·이용 기간</p>
          <p className="text-muted-foreground">목적 달성 후 즉시 파기. 철회 시 즉시 삭제.</p>
          <a
            href="/docs/agreement/lbs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 block pt-1"
          >
            위치기반서비스 이용약관 전문 보기 →
          </a>
        </div>

        <p className="text-muted-foreground text-xs">
          동의하지 않아도 일반 서비스 이용에는 제한이 없습니다.
          위치 서비스만 비활성화됩니다.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            나중에
          </Button>
          <Button onClick={handleConsent} disabled={loading}>
            {loading ? '처리 중...' : '동의하고 시작'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

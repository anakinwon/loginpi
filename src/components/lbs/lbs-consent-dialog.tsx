'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
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
  const t = useTranslations('lbs')
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
          <DialogTitle>{t('consentTitle')}</DialogTitle>
          <DialogDescription>{t('consentDesc')}</DialogDescription>
        </DialogHeader>

        <div className="bg-muted space-y-1.5 rounded-lg p-3 text-xs leading-relaxed">
          <p className="text-foreground font-medium">{t('purposeTitle')}</p>
          <ul className="text-muted-foreground list-inside list-disc space-y-1">
            <li>{t('purpose1')}</li>
            <li>{t('purpose2')}</li>
            <li>{t('purpose3')}</li>
          </ul>
          <p className="text-foreground pt-1 font-medium">
            {t('retentionTitle')}
          </p>
          <p className="text-muted-foreground">{t('retentionDesc')}</p>
          <Link
            href="/docs/agreement/lbs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary block pt-1 underline underline-offset-2"
          >
            {t('viewTerms')}
          </Link>
        </div>

        <p className="text-muted-foreground text-xs">{t('optionalNotice')}</p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t('later')}
          </Button>
          <Button onClick={handleConsent} disabled={loading}>
            {loading ? t('processing') : t('agreeStart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

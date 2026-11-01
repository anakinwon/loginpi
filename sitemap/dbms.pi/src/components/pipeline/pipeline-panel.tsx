'use client'

// PiCDC·PipeLine 화면 본체 — 연결·접속(LinkPicker, URL ?link=&conn=) → 7-1 원천 사전 점검 → 7-2 파이프라인 정의(DRAFT) + 7-3·7-4 안내.
//  사전 점검 결과의 테이블·어댑터를 정의 편집기 초안으로 넘길 수 있다. 모든 호출 piFetch(X-Pi-Token)
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LinkPicker } from '@/components/link/link-picker'
import { PrecheckSection } from './precheck-section'
import { PipelineSection, type Seed } from './pipeline-editor'

export function PipelinePanel() {
  const t = useTranslations('pipeline')
  const sp = useSearchParams()
  const linkId = sp.get('link')
  const connId = sp.get('conn')
  const [seed, setSeed] = useState<Seed | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <LinkPicker />
      {!linkId && <p className="bg-surface text-muted-foreground rounded-2xl p-4 text-sm">{t('needLink')}</p>}
      {linkId && (
        <>
          <PrecheckSection key={`${linkId}:${connId}`} linkId={linkId} connId={connId} onSeed={setSeed} />
          <PipelineSection key={linkId} linkId={linkId} connId={connId} seed={seed} />
        </>
      )}
      <section className="bg-surface rounded-2xl border border-dashed border-white/15 p-4 text-sm">
        <h2 className="font-bold">{t('runTitle')}</h2>
        <p className="text-muted-foreground mt-1 break-keep">{t('runBody')}</p>
      </section>
    </div>
  )
}

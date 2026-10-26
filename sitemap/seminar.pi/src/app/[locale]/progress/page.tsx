// 제작 진행 현황(기능별 워크플로) — 홈이 세미나 목록(S1)이 되면서 이 경로로 이동, 헤더에서 연결(아소카 결정(마스터 위임 2026-10-26))
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { ProgressBoard } from '@/components/progress-board'

export default function ProgressPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('list')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('progress')}</h1>
      <ProgressBoard />
    </div>
  )
}

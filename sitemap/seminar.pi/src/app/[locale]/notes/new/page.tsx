// 대면 회의 노트(/notes/new, 설계서 15.10) — ADMIN 만. 권한 판정은 클라이언트 게이트 + 서버 POST(403), redirect 없음
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { geminiEnabled } from '@/lib/gemini'
import { InPersonNote } from '@/components/notes/in-person'

export default function NoteNewPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('notes')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('inPerson')}</h1>
      <InPersonNote ai={geminiEnabled()} />
    </div>
  )
}

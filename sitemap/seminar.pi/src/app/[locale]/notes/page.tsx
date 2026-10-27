// 내 회의록 목록(/notes) — 내가 시작한 세미나 AI 회의록·대면 노트, 10건씩. 조회는 클라이언트(piFetch), redirect 없음
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { use } from 'react'
import { geminiEnabled } from '@/lib/gemini'
import { NotesHome } from '@/components/notes/in-person'

export default function NotesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  setRequestLocale(use(params).locale)
  const t = useTranslations('notes')
  return (
    <div className="space-y-6 py-2">
      <h1 className="text-2xl font-bold">{t('mine')}</h1>
      <NotesHome ai={geminiEnabled()} />
    </div>
  )
}

// 회의록 화면(/notes/[id], 설계서 15.9) — 조회·권한은 클라이언트(piFetch, X-Pi-Token). 서버는 id 형식만 확인하고 redirect 하지 않는다
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { NoteView } from '@/components/notes/note-view'
import { isUuid } from '@/lib/seminar-rules'

export default async function NotePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  if (!isUuid(id)) notFound()
  return <NoteView id={id} />
}

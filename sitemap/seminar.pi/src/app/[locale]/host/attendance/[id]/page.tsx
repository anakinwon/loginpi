// 출석부(/host/attendance/[id]) — 개최자·ADMIN. 조회·권한 판정은 클라이언트(piFetch + 서버 403), 서버는 id 형식만 확인하고 redirect 하지 않는다
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { Attendance } from '@/components/seminar/attendance'
import { isUuid } from '@/lib/seminar-rules'

export default async function AttendancePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  if (!isUuid(id)) notFound()
  return <Attendance id={id} />
}

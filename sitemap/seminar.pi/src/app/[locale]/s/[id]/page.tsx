// S2 세미나 상세(/s/[id]) — 조회·입장·결제는 클라이언트(piFetch, 내 등록 상태 포함). 서버는 id 형식만 확인하고 redirect 하지 않는다
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { SeminarDetail } from '@/components/seminar/seminar-detail'
import { isUuid } from '@/lib/seminar-rules'

export default async function SeminarPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params
  setRequestLocale(locale)
  if (!isUuid(id)) notFound()
  return <SeminarDetail id={id} />
}

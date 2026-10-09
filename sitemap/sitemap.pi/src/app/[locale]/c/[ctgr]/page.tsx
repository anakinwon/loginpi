// 카테고리 목록 — /c/<ctgr>(소문자 코드). 승인 사이트 페이지네이션 목록(지연 조회). 상단 추천 슬롯(광고)은 Phase 2
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SiteList } from '@/components/site-list'
import { SITE_CTGR, type SiteCtgr } from '@/lib/site'

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; ctgr: string }>
}) {
  const { locale, ctgr } = await params
  setRequestLocale(locale)
  const code = ctgr.toUpperCase() as SiteCtgr
  if (!SITE_CTGR.includes(code)) notFound()
  const tc = await getTranslations('siteCtgr')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{tc(code)}</h1>
      <SiteList ctgr={code} />
    </div>
  )
}

// 사이트 상세 — /s/<domain>. 도메인 형식만 서버 검증, 데이터·조회수·방문·신고는 클라이언트(SiteDetail)가 비동기 조회
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { SiteDetail } from '@/components/site-detail'
import { decodeDomain, DOMAIN_RE } from '@/lib/site'

type Params = Promise<{ locale: string; domain: string }>

export async function generateMetadata({
  params,
}: {
  params: Params
}): Promise<Metadata> {
  const { domain } = await params
  return { title: `${decodeDomain(domain)} — sitemap.pi` }
}

export default async function SitePage({ params }: { params: Params }) {
  const { locale, domain } = await params
  setRequestLocale(locale)
  const d = decodeDomain(domain)
  if (!DOMAIN_RE.test(d)) notFound()
  return <SiteDetail domain={d} />
}

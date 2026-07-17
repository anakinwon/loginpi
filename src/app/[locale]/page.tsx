import { getTranslations } from 'next-intl/server'
import { GrandOpenBanner } from '@/components/home/grand-open-banner'
import { HomeHero } from '@/components/home/home-hero'
import { HomeStats } from '@/components/home/home-stats'
import { TechWhitepaper } from '@/components/home/tech-whitepaper'
import { UserManual } from '@/components/home/user-manual'

export async function generateMetadata() {
  const t = await getTranslations('adminStats')
  return { title: t('homeTitle') }
}

export default async function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pt-3 pb-8">
      {/* 그랜드 오픈 이벤트 환영 배너 — 오픈 프로모 활성 시에만 노출(전액 무료 사실일 때) */}
      <GrandOpenBanner />

      {/* 문서 카드 2종(컴팩트) — 히어로 위에 배치 (2026-07-17 마스터 커스터마이징) */}
      <div className="space-y-2">
        <TechWhitepaper />
        <UserManual />
      </div>

      {/* Pi 글로벌 커뮤니티 히어로 — 홈의 시각적 앵커 + 사이트 소개 태그라인 */}
      <HomeHero />

      {/* 홈 대시보드 — 운영 포함 상시 노출. 공개=활성 지표만·관리자=조건부 전체 개방
          (2026-07-17 마스터: 유리 항목 부각 + 절제 항목 관리자 한정) */}
      <HomeStats />
      {/* 푸터는 layout 공통 SiteFooter로 이동 (2026-07-11 전 페이지 적용) */}
    </div>
  )
}

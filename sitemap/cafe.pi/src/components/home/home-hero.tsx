import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

// 홈 히어로 — Pi 글로벌 커뮤니티 일러스트 (2026-07-17 마스터 커스터마이징)
// 생동감 연출 3종(globals.css): Ken Burns 느린 줌 · 앰비언트 글로우 맥동 · 진입 페이드업.
// prefers-reduced-motion에서 전부 정지. 원본 3.2MB PNG → 395KB WebP(sharp q82) 최적화.
// 세로형(2:3) 포스터라 프레임 폭을 제한(max-w-lg)해 전체 그림이 잘리지 않게 표시한다.

// 16px 초소형 블러 플레이스홀더 — 로딩 중 빈 프레임 대신 색감이 먼저 떠오른다
const BLUR_DATA_URL =
  'data:image/webp;base64,UklGRtYAAABXRUJQVlA4IMoAAABwBQCdASoQABgAPu1iqU2ppaOiMAgBMB2JbACdMoRwJoIoBNGT4Az0BqpDbRR7KGqLu19EAP7HEEKMW7tLo3yPKYmh2wrlik+HpdlOrqW2OdFaDfuNZTXjUWWo29mH651D5Nf6+8oD0VPtk0ANSnLRfOwr41DP+JeDzqN8rvWHf1NUQBcREcclInbtPYUCeRUy0fDyCCfelHkxosmwmLSIK5/mXASuNr8Z5rU+NtcNrPtzPi9Y8fHKtWvMvHa3Njy3dzMDg/f9iIAA'

export async function HomeHero() {
  const t = await getTranslations('adminStats')

  return (
    <div className="home-hero-enter relative mx-auto w-full max-w-lg">
      {/* 앰비언트 글로우 — 프레임 뒤 Pi 보라·앰버 광채 (blur라 GPU 부담 최소) */}
      <div
        aria-hidden="true"
        className="home-hero-glow absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-to-br from-violet-500/40 via-sky-400/30 to-amber-400/40 blur-2xl"
      />
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border shadow-lg">
        <Image
          src="/home/hero-community.webp"
          alt={t('heroAlt')}
          fill
          priority
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          sizes="(max-width: 640px) 100vw, 512px"
          className="home-hero-img object-cover"
        />
        {/* 상단 스크림 — 하늘 영역 위 태그라인 가독성 확보 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 via-black/20 to-transparent"
        />
        {/* 사이트 소개 태그라인 — 강렬한 1줄 (진입 애니메이션은 히어로보다 0.35s 늦게) */}
        {/* 태그라인 — 샴페인 골드 그라데이션(일러스트의 금색 π·연결선과 동일 계열, 파란 하늘과 보색 대비).
            bg-clip-text는 text-shadow와 섞이면 탁해져서 filter 기반 drop-shadow만 사용 */}
        <p className="home-hero-tagline absolute inset-x-0 top-5 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text px-4 text-center text-[clamp(0.95rem,4.2vw,1.5rem)] font-extrabold tracking-tight whitespace-nowrap text-transparent drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)] sm:top-6">
          {t('heroTagline')}
        </p>
        {/* 하단 미세 그라데이션 — 이미지와 페이지 배경의 이음새를 부드럽게 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent"
        />
      </div>
    </div>
  )
}

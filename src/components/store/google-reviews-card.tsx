'use client'

import { useCallback, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { LazySection } from '@/components/lazy-section'
import { StarRating } from '@/components/feedback/StarRating'

// 매장 상세 — 구글 평점·리뷰 카드 (place_id 연결 매장 전용)
// 평점·총개수는 전체 리뷰 기준, 본문은 구글 정책상 최대 5개 → 전체는 구글 지도 링크로 유도.
// 표준: 뷰포트 진입 직전 지연 fetch (LazySection onVisible) — 렌더 블로킹 없음

interface GoogleReview {
  author_nm: string | null
  author_photo_url: string | null
  rating: number | null
  text: string | null
  relative_time: string | null
  publish_dtm: string | null
}

interface GoogleReviewsData {
  available: boolean
  rating?: number | null
  user_rating_count?: number | null
  google_maps_uri?: string | null
  reviews?: GoogleReview[]
}

export function GoogleReviewsCard({ shopId }: { shopId: string }) {
  const t = useTranslations('store.googleReviews')
  const locale = useLocale()
  const [data, setData] = useState<GoogleReviewsData | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    // 공개 데이터 — 인증 불필요, 일반 fetch (locale의 언어 부분만 전달: ko-KR → ko)
    const lang = locale.split('-')[0]
    fetch(`/api/store/shops/${shopId}/google-reviews?lang=${lang}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((d: GoogleReviewsData) => setData(d))
      .catch(() => setFailed(true))
  }, [shopId, locale])

  // 실패·데이터 없음 → 카드 자체를 숨김 (매장 화면은 구글 정보 없이도 완결)
  if (failed || data?.available === false) return null

  return (
    <LazySection
      onVisible={load}
      fallback={<div className="bg-muted h-24 animate-pulse rounded-lg" />}
    >
      {!data ? (
        <div className="bg-muted h-24 animate-pulse rounded-lg" />
      ) : (
        <div className="rounded-lg border p-4">
          {/* 헤더 — 평균 평점(전체 기준) + 총 리뷰 수 + 출처 표기 */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">{t('title')}</h2>
            <span className="text-muted-foreground text-xs">{t('source')}</span>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl font-bold">
              {data.rating != null ? data.rating.toFixed(1) : '-'}
            </span>
            <div>
              {data.rating != null && (
                <StarRating
                  value={Math.round(data.rating)}
                  readonly
                  size="sm"
                />
              )}
              <p className="text-muted-foreground text-xs">
                {t('reviewCount', { count: data.user_rating_count ?? 0 })}
              </p>
            </div>
          </div>

          {/* 리뷰 목록 — 구글 제공 최대 5개 */}
          {(data.reviews?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-4">
              {data.reviews!.map((r, i) => (
                <li key={i} className="border-t pt-3">
                  <div className="flex items-center gap-2">
                    {r.author_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.author_photo_url}
                        alt=""
                        className="h-6 w-6 rounded-full"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="bg-muted flex h-6 w-6 items-center justify-center rounded-full text-xs">
                        👤
                      </span>
                    )}
                    <span className="text-sm font-medium">
                      {r.author_nm ?? t('anonymous')}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {r.relative_time}
                    </span>
                  </div>
                  {r.rating != null && (
                    <div className="mt-1">
                      <StarRating value={r.rating} readonly size="sm" />
                    </div>
                  )}
                  {r.text && (
                    <p className="mt-1 text-sm whitespace-pre-line">{r.text}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* 전체 리뷰 — API는 5개 제한이므로 구글 지도로 유도 */}
          {data.google_maps_uri && (
            <a
              href={data.google_maps_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary mt-3 inline-block text-sm hover:underline"
            >
              {t('viewAllOnGoogle', { count: data.user_rating_count ?? 0 })} ↗
            </a>
          )}
        </div>
      )}
    </LazySection>
  )
}

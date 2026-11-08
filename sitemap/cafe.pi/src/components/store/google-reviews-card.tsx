'use client'

import { useCallback, useEffect, useState } from 'react'
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

interface GooglePhoto {
  photo_url: string // 구글 CDN 임시 URL (표시 전용 — 저장·재사용 금지)
  author_nm: string | null
}

interface GoogleReviewsData {
  available: boolean
  rating?: number | null
  user_rating_count?: number | null
  google_maps_uri?: string | null
  photos?: GooglePhoto[]
  photos_page_uri?: string | null
  reviews?: GoogleReview[]
}

export function GoogleReviewsCard({ shopId }: { shopId: string }) {
  const t = useTranslations('store.googleReviews')
  const locale = useLocale()
  const [data, setData] = useState<GoogleReviewsData | null>(null)
  const [failed, setFailed] = useState(false)
  // 인앱 라이트박스 — 열려 있는 사진 인덱스 (null=닫힘). 구글맵 이동 없이 갤러리 감상
  const [lightbox, setLightbox] = useState<number | null>(null)

  const load = useCallback(() => {
    // 공개 데이터 — 인증 불필요, 일반 fetch (locale의 언어 부분만 전달: ko-KR → ko)
    const lang = locale.split('-')[0]
    fetch(`/api/store/shops/${shopId}/google-reviews?lang=${lang}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((d: GoogleReviewsData) => setData(d))
      .catch(() => setFailed(true))
  }, [shopId, locale])

  // 라이트박스 키보드 내비게이션 — Esc 닫기, ←/→ 이전·다음 (순환)
  const photoCount = data?.photos?.length ?? 0
  useEffect(() => {
    if (lightbox == null || photoCount === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowLeft')
        setLightbox((v) => (v == null ? v : (v + photoCount - 1) % photoCount))
      if (e.key === 'ArrowRight')
        setLightbox((v) => (v == null ? v : (v + 1) % photoCount))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, photoCount])

  // 실패·데이터 없음 → 카드 자체를 숨김 (매장 화면은 구글 정보 없이도 완결)
  if (failed || data?.available === false) return null

  return (
    // overflow-anchor:none — 위쪽 콘텐츠(상품 목록) 로드 시 브라우저가 이 카드를
    // 스크롤 기준점으로 붙잡아 화면이 후기로 밀려 내려가는 것 방지 (매장 상단 유지)
    <LazySection
      className="[overflow-anchor:none]"
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

          {/* 사진 스트립 — 구글 CDN 핫링크(저장 없음), 기여자 출처 오버레이, 클릭 시 인앱 라이트박스 */}
          {(data.photos?.length ?? 0) > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {data.photos!.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(i)}
                  className="relative shrink-0 cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.photo_url}
                    alt={p.author_nm ?? ''}
                    className="h-28 w-40 rounded-md object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                  {p.author_nm && (
                    <span className="absolute inset-x-0 bottom-0 truncate rounded-b-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
                      📷 {p.author_nm}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

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

          {/* 전체 리뷰·사진 — API 제한(리뷰 5개·사진 10장)이므로 구글 지도로 유도 */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {data.google_maps_uri && (
              <a
                href={data.google_maps_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm hover:underline"
              >
                {t('viewAllOnGoogle', { count: data.user_rating_count ?? 0 })} ↗
              </a>
            )}
            {data.photos_page_uri && (
              <a
                href={data.photos_page_uri}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm hover:underline"
              >
                {t('morePhotos')} ↗
              </a>
            )}
          </div>

          {/* 라이트박스 — 인앱 갤러리 (핫링크 표시 전용, 기여자·출처 표기 유지, 다운로드 미제공) */}
          {lightbox != null && data.photos?.[lightbox] && (
            <div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4"
              onClick={() => setLightbox(null)}
            >
              <button
                type="button"
                aria-label={t('close')}
                onClick={() => setLightbox(null)}
                className="absolute top-4 right-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/50 text-xl text-white"
              >
                ✕
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.photos[lightbox].photo_url}
                alt={data.photos[lightbox].author_nm ?? ''}
                className="max-h-[80vh] max-w-[92vw] rounded-md object-contain"
                referrerPolicy="no-referrer"
                onClick={(e) => e.stopPropagation()}
              />

              {/* 기여자·출처 표기 + 위치 카운터 */}
              <p className="mt-3 max-w-[92vw] truncate text-center text-xs text-white/90">
                {data.photos[lightbox].author_nm && (
                  <>📷 {data.photos[lightbox].author_nm} · </>
                )}
                {t('source')} · {lightbox + 1} / {photoCount}
              </p>

              {photoCount > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={t('prevPhoto')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightbox((lightbox + photoCount - 1) % photoCount)
                    }}
                    className="absolute top-1/2 left-2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-xl text-white md:left-4"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    aria-label={t('nextPhoto')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setLightbox((lightbox + 1) % photoCount)
                    }}
                    className="absolute top-1/2 right-2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/50 text-xl text-white md:right-4"
                  >
                    ▶
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </LazySection>
  )
}

/// <reference types="@types/google.maps" />
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { useRouter } from '@/i18n/navigation'
import {
  ShopClaimDialog,
  type ClaimTarget,
} from '@/components/lbs/shop-claim-dialog'
import type { BizCategory } from '@/components/lbs/nearby-explorer'

interface ShopItem {
  item_id: string
  item_nm: string
  price_pi: number | string
  thumbnail_url: string | null
}

interface NearbyShop {
  shop_id: string
  shop_nm: string
  addr: string | null
  biz_hour: string | null
  distance_km: number
  lat: number
  lng: number
  owner_verified_yn?: string | null
  items?: ShopItem[]
}

interface Props {
  shops: NearbyShop[]
  userLat: number
  userLng: number
  apiKey: string | undefined
  bizCategory: BizCategory
  radiusMeters: number
  focusShopId?: string | null
}

interface MarkerEntry {
  marker: google.maps.marker.AdvancedMarkerElement
  content: HTMLElement
  position: { lat: number; lng: number }
}

// 업종별 핀 색상 + Google Places 타입
const CATEGORY_CONFIG: Record<
  BizCategory,
  { bg: string; border: string; placeType: string; label: string }
> = {
  ALL: { bg: '#f97316', border: '#c2410c', placeType: '', label: 'Pi 매장' },
  CAFE: { bg: '#22c55e', border: '#15803d', placeType: 'cafe', label: '카페' },
  RESTAURANT: {
    bg: '#ef4444',
    border: '#b91c1c',
    placeType: 'restaurant',
    label: '식당',
  },
  BAR: { bg: '#a855f7', border: '#7e22ce', placeType: 'bar', label: '술집' },
}

export function ShopsMapView({
  shops,
  userLat,
  userLng,
  apiKey,
  bizCategory,
  radiusMeters,
  focusShopId,
}: Props) {
  const router = useRouter() // next-intl 라우터 — locale 접두사 자동 처리
  const mapRef = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [placesCount, setPlacesCount] = useState<number | null>(null)
  // 구글 카페 인증 등록 폼(모달) 대상 — DOM InfoWindow 버튼이 set, React가 렌더
  const [claimTarget, setClaimTarget] = useState<ClaimTarget | null>(null)

  // 지도 인스턴스·마커를 ref에 보관 — 포커스 effect와 초기화 effect가 공유
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const markerMapRef = useRef(new Map<string, MarkerEntry>())
  // 초기화 async 내부에서 최신 focusShopId를 읽기 위한 mirror ref
  const focusShopIdRef = useRef(focusShopId)
  useEffect(() => {
    focusShopIdRef.current = focusShopId
  }, [focusShopId])

  // 이미 초기화된 지도에서 focusShopId 변경 시 panTo + InfoWindow
  const applyFocus = useCallback((id: string) => {
    const mapInst = mapInstanceRef.current
    const iw = infoWindowRef.current
    const entry = markerMapRef.current.get(id)
    if (!mapInst || !iw || !entry) return
    mapInst.panTo(entry.position)
    mapInst.setZoom(17)
    iw.setContent(entry.content)
    iw.open(mapInst, entry.marker)
  }, [])

  useEffect(() => {
    if (focusShopId && mapInstanceRef.current) applyFocus(focusShopId)
  }, [focusShopId, applyFocus])

  useEffect(() => {
    if (!mapRef.current) return
    setLoadError(null)
    setPlacesCount(null)

    if (!apiKey) {
      setLoadError(
        'Google Maps API 키가 설정되지 않았습니다 (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)',
      )
      return
    }

    setOptions({ key: apiKey, v: 'weekly' })

    let markers: google.maps.marker.AdvancedMarkerElement[] = []
    let infoWindow: google.maps.InfoWindow | null = null
    markerMapRef.current.clear()
    ;(async () => {
      try {
        const { Map, InfoWindow } = (await importLibrary(
          'maps',
        )) as google.maps.MapsLibrary
        if (!mapRef.current) return

        const map = new Map(mapRef.current, {
          center: { lat: userLat, lng: userLng },
          zoom: 14,
          mapId: 'cafe-pi-shops-map',
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        })

        infoWindow = new InfoWindow()
        mapInstanceRef.current = map
        infoWindowRef.current = infoWindow

        const { AdvancedMarkerElement, PinElement } = (await importLibrary(
          'marker',
        )) as google.maps.MarkerLibrary
        const { LatLngBounds } = (await importLibrary(
          'core',
        )) as google.maps.CoreLibrary

        // 사용자 위치 마커 (파란 핀)
        const userPin = new PinElement({
          background: '#3b82f6',
          borderColor: '#1d4ed8',
          glyphColor: '#ffffff',
          glyph: '나',
          scale: 1.2,
        })
        new AdvancedMarkerElement({
          map,
          position: { lat: userLat, lng: userLng },
          content: userPin.element,
          title: '내 위치',
        })

        const cfg = CATEGORY_CONFIG[bizCategory]
        const bounds = new LatLngBounds()
        bounds.extend({ lat: userLat, lng: userLng })

        const addMarker = (
          position: { lat: number; lng: number },
          title: string,
          infoContent: HTMLElement,
          shopId?: string,
        ) => {
          const pin = new PinElement({
            background: cfg.bg,
            borderColor: cfg.border,
            glyphColor: '#ffffff',
          })
          const marker = new AdvancedMarkerElement({
            map,
            position,
            content: pin.element,
            title,
          })
          marker.addListener('click', () => {
            infoWindow!.setContent(infoContent)
            infoWindow!.open(map, marker)
          })
          bounds.extend(position)
          markers.push(marker)
          if (shopId)
            markerMapRef.current.set(shopId, {
              marker,
              content: infoContent,
              position,
            })
        }

        // 길찾기 버튼: Google Maps(글로벌) + 카카오맵 + 네이버지도(국내)
        // 한국 정부 지도 반출 금지로 Google Maps 도보·자전거 경로 미지원 → 카카오/네이버 병행
        const buildNavLinks = (lat: number, lng: number, name: string) => {
          const wrap = document.createElement('div')
          wrap.style.cssText =
            'margin-top:8px;display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto'

          // ── Google Maps (글로벌) ──
          const gLabel = document.createElement('p')
          gLabel.style.cssText = 'font-size:11px;color:#6b7280;margin:0'
          gLabel.textContent = '🌍 Google Maps'
          wrap.appendChild(gLabel)

          const gRow = document.createElement('div')
          gRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap'
          const gModes = [
            { icon: '🚗', label: '자가용', travelmode: 'driving' },
            { icon: '🚌', label: '대중교통', travelmode: 'transit' },
            { icon: '🚶', label: '도보', travelmode: 'walking' },
            { icon: '🚲', label: '자전거', travelmode: 'bicycling' },
          ]
          for (const m of gModes) {
            const a = document.createElement('a')
            a.href = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=${m.travelmode}`
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            a.textContent = `${m.icon} ${m.label}`
            a.style.cssText =
              'display:inline-block;padding:3px 7px;font-size:11px;border-radius:4px;border:1px solid #d1d5db;color:#374151;text-decoration:none;white-space:nowrap'
            gRow.appendChild(a)
          }
          wrap.appendChild(gRow)

          // ── 카카오맵 + 네이버지도 (국내 도보·자전거 완전 지원) ──
          const knLabel = document.createElement('p')
          knLabel.style.cssText = 'font-size:11px;color:#6b7280;margin:0'
          knLabel.textContent = '🇰🇷 국내 지도 (도보·자전거 지원)'
          wrap.appendChild(knLabel)

          const knRow = document.createElement('div')
          knRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'

          const kBtn = document.createElement('a')
          kBtn.href = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`
          kBtn.target = '_blank'
          kBtn.rel = 'noopener noreferrer'
          kBtn.textContent = '카카오맵'
          kBtn.style.cssText =
            'display:inline-block;padding:4px 12px;font-size:11px;border-radius:4px;background:#FEE500;color:#3C1E1E;text-decoration:none;font-weight:600'
          knRow.appendChild(kBtn)

          // 네이버지도: 경도(lng),위도(lat),이름 순서 (GeoJSON x,y 컨벤션)
          const nBtn = document.createElement('a')
          nBtn.href = `https://map.naver.com/v5/directions/-/${lng},${lat},${encodeURIComponent(name)}/car`
          nBtn.target = '_blank'
          nBtn.rel = 'noopener noreferrer'
          nBtn.textContent = '네이버지도'
          nBtn.style.cssText =
            'display:inline-block;padding:4px 12px;font-size:11px;border-radius:4px;background:#03C75A;color:#ffffff;text-decoration:none;font-weight:600'
          knRow.appendChild(nBtn)

          wrap.appendChild(knRow)

          return wrap
        }

        // 구글 카페 → 내 매장 인증 등록 버튼 — 클릭 시 React 폼 모달을 연다
        // (전화번호 구글 대조 + 대표자명·주소·이메일 필수 입력은 ShopClaimDialog가 담당)
        const buildClaimButton = (
          placeId: string,
          name: string,
          addr: string | null,
        ) => {
          const btn = document.createElement('button')
          btn.textContent = '🏪 내 매장으로 등록'
          btn.style.cssText =
            'margin-top:8px;width:100%;padding:7px 10px;font-size:12px;border-radius:6px;background:#7c3aed;color:#fff;border:none;font-weight:700;cursor:pointer'
          btn.addEventListener('click', () => {
            setClaimTarget({ place_id: placeId, name, addr })
          })
          return btn
        }

        const buildShopInfo = (
          nm: string,
          dist: string,
          addr: string | null,
          biz_hour: string | null,
          lat: number,
          lng: number,
          verified: boolean,
          items: ShopItem[],
        ) => {
          const wrap = document.createElement('div')
          // 매장 팝업 기본 폭 확대(200), 상품 있을 땐 더 넓혀(260) 2배 썸네일 공간 확보
          wrap.style.cssText = `font-family:system-ui,sans-serif;min-width:${
            items.length > 0 ? '260px' : '200px'
          };padding:4px 0`
          const nameEl = document.createElement('p')
          nameEl.style.cssText = 'font-weight:600;font-size:14px;margin:0 0 4px'
          nameEl.textContent = nm
          // 소유권 인증 매장 배지 (현장 GPS 검증 완료)
          if (verified) {
            const badge = document.createElement('span')
            badge.textContent = '✅ 인증'
            badge.style.cssText =
              'display:inline-block;margin-left:6px;padding:1px 6px;font-size:10px;font-weight:700;border-radius:9999px;background:#dcfce7;color:#15803d;vertical-align:middle'
            nameEl.appendChild(badge)
          }
          wrap.appendChild(nameEl)
          const distEl = document.createElement('p')
          distEl.style.cssText = `color:${cfg.bg};font-size:12px;margin:0 0 4px`
          distEl.textContent = `📍 ${dist}`
          wrap.appendChild(distEl)
          if (addr) {
            const a = document.createElement('p')
            a.style.cssText = 'color:#6b7280;font-size:12px;margin:0 0 2px'
            a.textContent = addr
            wrap.appendChild(a)
          }
          // 판매중 상품이 있으면 영업시간 자리에 썸네일 그리드 대체 표시
          // (썸네일만 노출, 상품명은 마우스오버 title로, 탭 → 에스크로 거래)
          if (items.length > 0) {
            const head = document.createElement('p')
            head.style.cssText =
              'font-size:11px;font-weight:700;color:#374151;margin:6px 0 3px'
            head.textContent = '🛒 판매 상품 (탭하여 에스크로 거래)'
            wrap.appendChild(head)

            const grid = document.createElement('div')
            // 썸네일 2배 — 4열 → 2열 (Pi Browser 가독성). InfoWindow 폭도 확장
            grid.style.cssText =
              'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;max-height:280px;overflow-y:auto'
            for (const it of items) {
              const itemId = it.item_id
              const cell = document.createElement('a')
              // next-intl 라우터로 이동 (locale 접두사 자동 처리, 직접 URL 조립 금지)
              cell.addEventListener('click', (e) => {
                e.preventDefault()
                router.push(`/store/${itemId}`)
              })
              // 상품명은 마우스오버(title)로만 노출
              cell.title = `${it.item_nm} · ${Number(it.price_pi)} π`
              cell.style.cssText =
                'display:block;aspect-ratio:1;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;background:#f3f4f6;cursor:pointer'
              if (it.thumbnail_url) {
                const img = document.createElement('img')
                img.src = it.thumbnail_url
                img.alt = ''
                img.style.cssText =
                  'width:100%;height:100%;object-fit:cover;display:block'
                cell.appendChild(img)
              } else {
                // 썸네일 없으면 아이콘 플레이스홀더 (이름은 title로 확인)
                cell.style.cssText +=
                  ';display:flex;align-items:center;justify-content:center;font-size:18px'
                cell.textContent = '🛒'
              }
              grid.appendChild(cell)
            }
            wrap.appendChild(grid)
          } else if (biz_hour) {
            const h = document.createElement('p')
            h.style.cssText = 'color:#6b7280;font-size:12px;margin:0'
            h.textContent = `🕒 ${biz_hour}`
            wrap.appendChild(h)
          }
          wrap.appendChild(buildNavLinks(lat, lng, nm))
          return wrap
        }

        if (bizCategory === 'ALL') {
          // Pi 등록 매장 표시
          for (const shop of shops) {
            const dist =
              shop.distance_km < 1
                ? `${Math.round(shop.distance_km * 1000)}m`
                : `${shop.distance_km.toFixed(1)}km`
            addMarker(
              { lat: shop.lat, lng: shop.lng },
              shop.shop_nm,
              buildShopInfo(
                shop.shop_nm,
                dist,
                shop.addr,
                shop.biz_hour,
                shop.lat,
                shop.lng,
                shop.owner_verified_yn === 'Y',
                shop.items ?? [],
              ),
              shop.shop_id,
            )
          }
        } else {
          // Google Places Nearby Search (New API)
          const { Place } = (await importLibrary(
            'places',
          )) as google.maps.PlacesLibrary

          const { places } = await Place.searchNearby({
            fields: [
              'id',
              'displayName',
              'location',
              'formattedAddress',
              'rating',
              'userRatingCount',
              'regularOpeningHours',
            ],
            locationRestriction: {
              center: new google.maps.LatLng(userLat, userLng),
              radius: radiusMeters,
            },
            includedPrimaryTypes: [cfg.placeType],
            maxResultCount: 20,
          })

          setPlacesCount(places.length)

          for (const place of places) {
            const loc = place.location
            if (!loc) continue

            const wrap = document.createElement('div')
            wrap.style.cssText =
              'font-family:system-ui,sans-serif;min-width:160px;padding:4px 0'

            const nameEl = document.createElement('p')
            nameEl.style.cssText =
              'font-weight:600;font-size:14px;margin:0 0 4px'
            nameEl.textContent = place.displayName ?? '이름 없음'
            wrap.appendChild(nameEl)

            if (place.rating) {
              const rateEl = document.createElement('p')
              rateEl.style.cssText =
                'color:#f59e0b;font-size:12px;margin:0 0 4px'
              rateEl.textContent = `⭐ ${place.rating.toFixed(1)} (${place.userRatingCount ?? 0})`
              wrap.appendChild(rateEl)
            }

            if (place.formattedAddress) {
              const addrEl = document.createElement('p')
              addrEl.style.cssText =
                'color:#6b7280;font-size:12px;margin:0 0 2px'
              addrEl.textContent = place.formattedAddress
              wrap.appendChild(addrEl)
            }

            wrap.appendChild(
              buildNavLinks(loc.lat(), loc.lng(), place.displayName ?? ''),
            )
            // place_id가 있으면 내 매장 등록 버튼 노출 (현장 GPS 자동인증)
            if (place.id) {
              wrap.appendChild(
                buildClaimButton(
                  place.id,
                  place.displayName ?? '이름 미상 매장',
                  place.formattedAddress ?? null,
                ),
              )
            }
            addMarker(
              { lat: loc.lat(), lng: loc.lng() },
              place.displayName ?? '',
              wrap,
            )
          }
        }

        // 모든 마커가 보이도록 범위 조정
        if (markers.length > 0) {
          map.fitBounds(bounds, 80)
          const listener = google.maps.event.addListenerOnce(
            map,
            'idle',
            () => {
              const z = map.getZoom()
              if (z !== undefined && z > 16) map.setZoom(16)
            },
          )
          void listener
        }

        // 목록→지도 전환 시 클릭된 매장이 있으면 즉시 포커스
        const pendingId = focusShopIdRef.current
        if (pendingId && bizCategory === 'ALL') {
          const entry = markerMapRef.current.get(pendingId)
          if (entry && infoWindow) {
            map.panTo(entry.position)
            map.setZoom(17)
            infoWindow.setContent(entry.content)
            infoWindow.open(map, entry.marker)
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '지도 로드 실패'
        // Places API (New) 미활성화 시 명확한 안내
        if (
          msg.includes('PERMISSION_DENIED') ||
          msg.includes('places.googleapis.com')
        ) {
          setLoadError(
            'Places API (New) 미활성화 — Google Cloud Console에서 "Places API (New)"를 활성화해 주세요',
          )
        } else {
          setLoadError(msg)
        }
      }
    })()

    return () => {
      markers.forEach((m) => (m.map = null))
      infoWindow?.close()
      mapInstanceRef.current = null
      infoWindowRef.current = null
    }
    // radius 또는 category 바뀌면 지도 재초기화 (focusShopId는 별도 effect 처리)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shops, userLat, userLng, apiKey, bizCategory, radiusMeters, applyFocus])

  if (loadError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
        <p className="text-destructive text-center text-sm">⚠️ {loadError}</p>
      </div>
    )
  }

  const cfg = CATEGORY_CONFIG[bizCategory]

  return (
    <div className="space-y-1">
      {placesCount !== null && bizCategory !== 'ALL' && (
        <p className="text-muted-foreground text-xs">
          <span style={{ color: cfg.bg }}>●</span> 반경{' '}
          {(radiusMeters / 1000).toFixed(0)}km 내 {cfg.label} {placesCount}곳
        </p>
      )}
      <div
        ref={mapRef}
        className="h-[calc(100dvh-210px)] min-h-[300px] w-full overflow-hidden rounded-lg border"
      />
      {claimTarget && (
        <ShopClaimDialog
          target={claimTarget}
          userLat={userLat}
          userLng={userLng}
          onClose={() => setClaimTarget(null)}
        />
      )}
    </div>
  )
}

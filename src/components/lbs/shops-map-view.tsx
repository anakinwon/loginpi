/// <reference types="@types/google.maps" />
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import type { BizCategory } from '@/components/lbs/nearby-explorer'

interface NearbyShop {
  shop_id: string
  shop_nm: string
  addr: string | null
  biz_hour: string | null
  distance_km: number
  lat: number
  lng: number
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
  ALL:        { bg: '#f97316', border: '#c2410c', placeType: '',           label: 'Pi 매장' },
  CAFE:       { bg: '#22c55e', border: '#15803d', placeType: 'cafe',       label: '카페' },
  RESTAURANT: { bg: '#ef4444', border: '#b91c1c', placeType: 'restaurant', label: '식당' },
  BAR:        { bg: '#a855f7', border: '#7e22ce', placeType: 'bar',        label: '술집' },
}

export function ShopsMapView({ shops, userLat, userLng, apiKey, bizCategory, radiusMeters, focusShopId }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [placesCount, setPlacesCount] = useState<number | null>(null)

  // 지도 인스턴스·마커를 ref에 보관 — 포커스 effect와 초기화 effect가 공유
  const mapInstanceRef = useRef<google.maps.Map | null>(null)
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const markerMapRef = useRef(new Map<string, MarkerEntry>())
  // 초기화 async 내부에서 최신 focusShopId를 읽기 위한 mirror ref
  const focusShopIdRef = useRef(focusShopId)
  useEffect(() => { focusShopIdRef.current = focusShopId }, [focusShopId])

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
      setLoadError('Google Maps API 키가 설정되지 않았습니다 (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)')
      return
    }

    setOptions({ key: apiKey, v: 'weekly' })

    let markers: google.maps.marker.AdvancedMarkerElement[] = []
    let infoWindow: google.maps.InfoWindow | null = null
    markerMapRef.current.clear()

    ;(async () => {
      try {
        const { Map, InfoWindow } = await importLibrary('maps') as google.maps.MapsLibrary
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

        const { AdvancedMarkerElement, PinElement } = await importLibrary('marker') as google.maps.MarkerLibrary
        const { LatLngBounds } = await importLibrary('core') as google.maps.CoreLibrary

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
          const marker = new AdvancedMarkerElement({ map, position, content: pin.element, title })
          marker.addListener('click', () => {
            infoWindow!.setContent(infoContent)
            infoWindow!.open(map, marker)
          })
          bounds.extend(position)
          markers.push(marker)
          if (shopId) markerMapRef.current.set(shopId, { marker, content: infoContent, position })
        }

        const buildShopInfo = (nm: string, dist: string, addr: string | null, biz_hour: string | null) => {
          const wrap = document.createElement('div')
          wrap.style.cssText = 'font-family:system-ui,sans-serif;min-width:160px;padding:4px 0'
          const nameEl = document.createElement('p')
          nameEl.style.cssText = 'font-weight:600;font-size:14px;margin:0 0 4px'
          nameEl.textContent = nm
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
          if (biz_hour) {
            const h = document.createElement('p')
            h.style.cssText = 'color:#6b7280;font-size:12px;margin:0'
            h.textContent = `🕒 ${biz_hour}`
            wrap.appendChild(h)
          }
          return wrap
        }

        if (bizCategory === 'ALL') {
          // Pi 등록 매장 표시
          for (const shop of shops) {
            const dist = shop.distance_km < 1
              ? `${Math.round(shop.distance_km * 1000)}m`
              : `${shop.distance_km.toFixed(1)}km`
            addMarker(
              { lat: shop.lat, lng: shop.lng },
              shop.shop_nm,
              buildShopInfo(shop.shop_nm, dist, shop.addr, shop.biz_hour),
              shop.shop_id,
            )
          }
        } else {
          // Google Places Nearby Search (New API)
          const { Place } = await importLibrary('places') as google.maps.PlacesLibrary

          const { places } = await Place.searchNearby({
            fields: ['displayName', 'location', 'formattedAddress', 'rating', 'userRatingCount', 'regularOpeningHours'],
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
            wrap.style.cssText = 'font-family:system-ui,sans-serif;min-width:160px;padding:4px 0'

            const nameEl = document.createElement('p')
            nameEl.style.cssText = 'font-weight:600;font-size:14px;margin:0 0 4px'
            nameEl.textContent = place.displayName ?? '이름 없음'
            wrap.appendChild(nameEl)

            if (place.rating) {
              const rateEl = document.createElement('p')
              rateEl.style.cssText = 'color:#f59e0b;font-size:12px;margin:0 0 4px'
              rateEl.textContent = `⭐ ${place.rating.toFixed(1)} (${place.userRatingCount ?? 0})`
              wrap.appendChild(rateEl)
            }

            if (place.formattedAddress) {
              const addrEl = document.createElement('p')
              addrEl.style.cssText = 'color:#6b7280;font-size:12px;margin:0 0 2px'
              addrEl.textContent = place.formattedAddress
              wrap.appendChild(addrEl)
            }

            addMarker({ lat: loc.lat(), lng: loc.lng() }, place.displayName ?? '', wrap)
          }
        }

        // 모든 마커가 보이도록 범위 조정
        if (markers.length > 0) {
          map.fitBounds(bounds, 80)
          const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
            const z = map.getZoom()
            if (z !== undefined && z > 16) map.setZoom(16)
          })
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
        if (msg.includes('PERMISSION_DENIED') || msg.includes('places.googleapis.com')) {
          setLoadError('Places API (New) 미활성화 — Google Cloud Console에서 "Places API (New)"를 활성화해 주세요')
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
          <span style={{ color: cfg.bg }}>●</span>{' '}
          반경 {(radiusMeters / 1000).toFixed(0)}km 내 {cfg.label} {placesCount}곳
        </p>
      )}
      <div
        ref={mapRef}
        className="h-[420px] w-full overflow-hidden rounded-lg border"
      />
    </div>
  )
}

/// <reference types="@types/google.maps" />
'use client'

import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

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
}

export function ShopsMapView({ shops, userLat, userLng, apiKey }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapRef.current) return
    if (!apiKey) {
      setLoadError('Google Maps API 키가 설정되지 않았습니다 (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)')
      return
    }

    setOptions({ key: apiKey, v: 'weekly' })

    let markers: google.maps.marker.AdvancedMarkerElement[] = []
    let infoWindow: google.maps.InfoWindow | null = null

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

        const { AdvancedMarkerElement, PinElement } = await importLibrary('marker') as google.maps.MarkerLibrary

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

        // 매장 마커들
        markers = shops.map((shop) => {
          const pin = new PinElement({
            background: '#f97316',
            borderColor: '#c2410c',
            glyphColor: '#ffffff',
          })
          const marker = new AdvancedMarkerElement({
            map,
            position: { lat: shop.lat, lng: shop.lng },
            content: pin.element,
            title: shop.shop_nm,
          })

          marker.addListener('click', () => {
            const distanceText =
              shop.distance_km < 1
                ? `${Math.round(shop.distance_km * 1000)}m`
                : `${shop.distance_km.toFixed(1)}km`

            // DOM API로 구성 — textContent 할당으로 XSS 원천 차단 (HTML 파싱 없음)
            const wrap = document.createElement('div')
            wrap.style.cssText =
              'font-family:system-ui,sans-serif;min-width:160px;padding:4px 0'

            const nameEl = document.createElement('p')
            nameEl.style.cssText = 'font-weight:600;font-size:14px;margin:0 0 4px'
            nameEl.textContent = shop.shop_nm
            wrap.appendChild(nameEl)

            const distEl = document.createElement('p')
            distEl.style.cssText = 'color:#f97316;font-size:12px;margin:0 0 4px'
            distEl.textContent = `📍 ${distanceText}`
            wrap.appendChild(distEl)

            if (shop.addr) {
              const addrEl = document.createElement('p')
              addrEl.style.cssText = 'color:#6b7280;font-size:12px;margin:0 0 2px'
              addrEl.textContent = shop.addr
              wrap.appendChild(addrEl)
            }

            if (shop.biz_hour) {
              const hourEl = document.createElement('p')
              hourEl.style.cssText = 'color:#6b7280;font-size:12px;margin:0'
              hourEl.textContent = `🕒 ${shop.biz_hour}`
              wrap.appendChild(hourEl)
            }

            infoWindow!.setContent(wrap)
            infoWindow!.open(map, marker)
          })

          return marker
        })

        // 모든 마커가 보이도록 지도 범위 자동 조정
        if (shops.length > 0) {
          const { LatLngBounds } = await importLibrary('core') as google.maps.CoreLibrary
          const bounds = new LatLngBounds()
          bounds.extend({ lat: userLat, lng: userLng })
          shops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }))
          map.fitBounds(bounds, 80)
          // 너무 가까이 확대되면 zoom 16으로 제한
          const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
            const z = map.getZoom()
            if (z !== undefined && z > 16) map.setZoom(16)
          })
          void listener
        }
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : '지도 로드 실패')
      }
    })()

    return () => {
      markers.forEach((m) => (m.map = null))
      infoWindow?.close()
    }
  }, [shops, userLat, userLng, apiKey])

  if (loadError) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
        <p className="text-destructive text-center text-sm">⚠️ {loadError}</p>
      </div>
    )
  }

  return (
    <div
      ref={mapRef}
      className="h-[420px] w-full overflow-hidden rounded-lg border"
    />
  )
}

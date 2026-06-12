'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { piFetch } from '@/lib/pi-fetch'
import { getCurrentPosition } from '@/lib/geo'
import { LbsConsentDialog } from '@/components/lbs/lbs-consent-dialog'

// 주변 탐색 — 동의자에게만 GPS 기준 주변 매장·채팅방 노출 (Rule LBS-01)
// nearby/shops·nearby/rooms API를 보여주는 화면. Pi Browser 클라이언트 게이트 패턴.

interface NearbyShop {
  shop_id: string
  shop_nm: string
  shop_type_cd: string | null
  addr: string | null
  biz_hour: string | null
  distance_km: number
}

interface NearbyRoom {
  room_id: string
  room_nm: string
  room_desc: string | null
  theme_emoji: string
  theme_nm: string
  sigungu_nm: string | null
  distance_km: number
}

type Tab = 'shops' | 'rooms'
const RADIUS_OPTIONS = [1, 5, 10] as const

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

export function NearbyExplorer() {
  const t = useTranslations('lbs')
  const [lbsConsent, setLbsConsent] = useState<'Y' | 'N' | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  )
  const [locError, setLocError] = useState<string | null>(null)
  const [radius, setRadius] = useState<number>(5)
  const [tab, setTab] = useState<Tab>('shops')

  const [shops, setShops] = useState<NearbyShop[]>([])
  const [rooms, setRooms] = useState<NearbyRoom[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 마운트 시 동의 여부 확인 (Rule LBS-01)
  useEffect(() => {
    piFetch('/api/location/consent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consent_yn?: string } | null) => {
        setLbsConsent(d?.consent_yn === 'Y' ? 'Y' : 'N')
      })
      .catch(() => setLbsConsent('N'))
  }, [])

  // GPS 수집 (동의자만) — 실패 원인별 메시지 구분 (권한 차단·측위 불가·타임아웃)
  // fresh: '위치 갱신' 클릭 시 60초 캐시를 무시하고 새로 측위
  const requestLocation = useCallback((fresh = false) => {
    setLocError(null)
    getCurrentPosition({ fresh })
      .then(setCoords)
      .catch((e: Error) => setLocError(e.message))
  }, [])

  // 동의자 진입 시 자동으로 위치 1회 수집
  useEffect(() => {
    if (lbsConsent === 'Y' && !coords) requestLocation()
  }, [lbsConsent, coords, requestLocation])

  // 좌표·반경 변경 시 주변 데이터 로드 — API 실패는 빈 목록으로 위장하지 않고 표시
  useEffect(() => {
    if (lbsConsent !== 'Y' || !coords) return
    const sp = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radius: String(radius),
    })
    setLoading(true)
    setLoadError(null)
    const fetchJson = async (url: string) => {
      const r = await piFetch(url)
      const body = (await r.json().catch(() => ({}))) as {
        error?: string
        shops?: NearbyShop[]
        rooms?: NearbyRoom[]
      }
      if (!r.ok) throw new Error(body.error ?? `조회 실패 (${r.status})`)
      return body
    }
    Promise.all([
      fetchJson(`/api/location/nearby/shops?${sp}`),
      fetchJson(`/api/location/nearby/rooms?${sp}`),
    ])
      .then(([s, r]) => {
        setShops(s.shops ?? [])
        setRooms(r.rooms ?? [])
      })
      .catch((e: Error) => {
        setShops([])
        setRooms([])
        setLoadError(e.message)
      })
      .finally(() => setLoading(false))
  }, [lbsConsent, coords, radius])

  // 동의 여부 확인 중
  if (lbsConsent === null) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        {t('loading')}
      </p>
    )
  }

  // 미동의 — 동의 유도 CTA (Rule LBS-01: UI 자체를 위치 기능으로 노출하지 않음)
  if (lbsConsent === 'N') {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-5xl">📍</p>
        <div className="space-y-1">
          <p className="font-medium">{t('consentRequired')}</p>
          <p className="text-muted-foreground text-sm">
            {t('consentBenefit')}
          </p>
        </div>
        <Button onClick={() => setConsentOpen(true)}>
          {t('consentCta')}
        </Button>
        <LbsConsentDialog
          open={consentOpen}
          onOpenChange={setConsentOpen}
          onConsented={() => {
            setLbsConsent('Y')
            requestLocation()
          }}
        />
      </div>
    )
  }

  // 동의자 — 위치 미수집 상태
  if (!coords) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-5xl">📡</p>
        <p className="text-muted-foreground text-sm">
          {locError ?? t('locating')}
        </p>
        {locError && (
          <Button variant="outline" onClick={() => requestLocation(true)}>
            {t('retry')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 반경 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">{t('radius')}</span>
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => setRadius(r)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${radius === r ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {r}km
          </button>
        ))}
        {/* 현재 측위 좌표 — 위치가 엉뚱하게 잡혔는지 즉시 확인용 */}
        <span className="text-muted-foreground/70 ml-auto font-mono text-[10px]">
          ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
        </span>
        <button
          onClick={() => requestLocation(true)}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          {t('refreshLocation')}
        </button>
      </div>

      {/* API 조회 실패 — 빈 목록으로 위장하지 않고 원인 표시 */}
      {loadError && (
        <p className="text-destructive rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs dark:border-red-900 dark:bg-red-950">
          ⚠️ {loadError}
        </p>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab('shops')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'shops' ? 'border-primary text-primary border-b-2' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('tabShops')} {shops.length > 0 && `(${shops.length})`}
        </button>
        <button
          onClick={() => setTab('rooms')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'rooms' ? 'border-primary text-primary border-b-2' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('tabRooms')} {rooms.length > 0 && `(${rooms.length})`}
        </button>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('searching')}
        </p>
      ) : tab === 'shops' ? (
        shops.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">
            {t('noShops', { radius })}
          </p>
        ) : (
          <ul className="space-y-2">
            {shops.map((s) => (
              <li
                key={s.shop_id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.shop_nm}</p>
                  {s.addr && (
                    <p className="text-muted-foreground truncate text-xs">
                      {s.addr}
                    </p>
                  )}
                  {s.biz_hour && (
                    <p className="text-muted-foreground text-xs">
                      🕒 {s.biz_hour}
                    </p>
                  )}
                </div>
                <span className="text-primary shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium">
                  📍 {formatDistance(s.distance_km)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : rooms.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">
          {t('noRooms', { radius })}
        </p>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => (
            <Link
              key={r.room_id}
              href={`/chat/${r.room_id}`}
              className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-2xl">{r.theme_emoji}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.room_nm}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {r.sigungu_nm ? `${r.sigungu_nm} · ` : ''}
                    {r.theme_nm}
                  </p>
                </div>
              </div>
              <span className="text-primary shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium">
                📍 {formatDistance(r.distance_km)}
              </span>
            </Link>
          ))}
        </ul>
      )}
    </div>
  )
}

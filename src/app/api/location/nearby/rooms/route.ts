import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeError } from '@/lib/sanitize-error'
import { apiError } from '@/lib/api-errors'

// GET /api/location/nearby/rooms?lat=&lng=&radius=
// msg_room.latd_crd/lngt_crd 직접 사용 — LBS 동의자 카페 생성 위치 기준 (loc_tp_cd='05')
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  if (user.lbs_consent_yn !== 'Y') {
    return apiError('LOC_CONSENT_REQUIRED', 403)
  }

  const sp = request.nextUrl.searchParams
  const lat = parseFloat(sp.get('lat') ?? '')
  const lng = parseFloat(sp.get('lng') ?? '')
  const radius = parseFloat(sp.get('radius') ?? '10')

  if (
    isNaN(lat) ||
    isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return apiError('LOC_LATLNG_WGS84_REQUIRED', 400)
  }

  const db = getSupabaseAdmin()

  // 위치가 저장된 공개 그룹방만 조회 (msg_room 직접 참조)
  const { data: rooms, error: roomErr } = await db
    .from('msg_room')
    .select(
      'room_id, room_nm, room_desc, theme_cd, lat:latd_crd, lng:lngt_crd, msg_theme(theme_emoji, theme_nm)',
    )
    .eq('del_yn', 'N')
    .eq('is_public_yn', 'Y')
    .eq('room_tp_cd', 'G')
    .gt('expr_dtm', new Date().toISOString()) // 만료된 무료 카페는 지도/탐색에서 제외
    .not('latd_crd', 'is', null)
    .not('lngt_crd', 'is', null)
    .limit(200)

  if (roomErr)
    return NextResponse.json(
      {
        error: sanitizeError(
          'api/location/nearby/rooms/get',
          roomErr,
          '주변 카페 조회 중 오류가 발생했습니다',
        ),
      },
      { status: 500 },
    )
  if (!rooms || rooms.length === 0)
    return NextResponse.json({ rooms: [], total: 0 })

  type RoomRow = {
    room_id: string
    room_nm: string
    room_desc: string | null
    theme_cd: string
    lat: number
    lng: number
    msg_theme: { theme_emoji: string; theme_nm: string } | null
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180

  const result = (rooms as unknown as RoomRow[])
    .map((r) => {
      const dLat = toRad(r.lat - lat)
      const dLon = toRad(r.lng - lng)
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(r.lat)) * Math.sin(dLon / 2) ** 2
      const distance_km =
        Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) /
        10
      return {
        room_id: r.room_id,
        room_nm: r.room_nm,
        room_desc: r.room_desc,
        theme_cd: r.theme_cd,
        theme_emoji: r.msg_theme?.theme_emoji ?? '💬',
        theme_nm: r.msg_theme?.theme_nm ?? '',
        sigungu_nm: null,
        lat: r.lat,
        lng: r.lng,
        distance_km,
      }
    })
    .filter((r) => r.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km)

  return NextResponse.json({ rooms: result, total: result.length })
}

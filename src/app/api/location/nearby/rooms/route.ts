import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/location/nearby/rooms?lat=&lng=&radius= — 주변 공개 채팅방 탐색 (Rule LBS-01)
// 방 생성자의 최근 위치(usr_loc_hist loc_tp_cd='02') 기준으로 거리 계산
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  if (user.lbs_consent_yn !== 'Y') {
    return NextResponse.json({ error: '위치기반서비스 이용약관에 동의하지 않으셨습니다' }, { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const lat = parseFloat(sp.get('lat') ?? '')
  const lng = parseFloat(sp.get('lng') ?? '')
  const radius = parseFloat(sp.get('radius') ?? '10')

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'lat, lng는 필수 유효한 WGS84 좌표입니다' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  // 공개 그룹 채팅방 조회
  const { data: rooms, error: roomErr } = await db
    .from('msg_room')
    .select('room_id, room_nm, room_desc, theme_cd, reg_dtm, regr_id, msg_theme(theme_emoji, theme_nm)')
    .eq('del_yn', 'N')
    .eq('is_public_yn', 'Y')
    .eq('room_tp_cd', 'G')
    .limit(200)

  if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 500 })

  if (!rooms || rooms.length === 0) return NextResponse.json({ rooms: [], total: 0 })

  // 방 생성자 목록 → 최근 위치 조회 (로그인 위치 loc_tp_cd='02', 최신 1건씩)
  const creatorIds = [...new Set((rooms as { regr_id: string }[]).map((r) => r.regr_id))]
  const { data: locs } = await db
    .from('usr_loc_hist')
    .select('user_str_id, lat:latd_crd, lng:lngt_crd, sigungu_nm')
    .in('user_str_id', creatorIds)
    .eq('loc_tp_cd', '02')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .limit(creatorIds.length * 3)

  // creator별 최신 위치 맵
  const locMap = new Map<string, { lat: number; lng: number; sigungu_nm: string | null }>()
  for (const l of (locs ?? []) as { user_str_id: string; lat: number; lng: number; sigungu_nm: string | null }[]) {
    if (!locMap.has(l.user_str_id)) locMap.set(l.user_str_id, l)
  }

  type RoomRow = { room_id: string; room_nm: string; room_desc: string | null; theme_cd: string; reg_dtm: string; regr_id: string; msg_theme: { theme_emoji: string; theme_nm: string } | null }

  const result = (rooms as unknown as RoomRow[])
    .map((r) => {
      const loc = locMap.get(r.regr_id)
      if (!loc) return null
      const dLat = ((loc.lat - lat) * Math.PI) / 180
      const dLon = ((loc.lng - lng) * Math.PI) / 180
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) * Math.cos((loc.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
      const distance_km = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
      return {
        room_id: r.room_id,
        room_nm: r.room_nm,
        room_desc: r.room_desc,
        theme_cd: r.theme_cd,
        theme_emoji: r.msg_theme?.theme_emoji ?? '💬',
        theme_nm: r.msg_theme?.theme_nm ?? '',
        sigungu_nm: loc.sigungu_nm,
        distance_km,
        reg_dtm: r.reg_dtm,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km)

  return NextResponse.json({ rooms: result, total: result.length })
}

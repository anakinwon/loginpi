import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

interface PymntMeta {
  type?: string
  theme_cd?: string
  room_id?: string
  pack_id?: string
}

interface PymntRow {
  id: string
  payment_id: string
  txid: string | null
  amount: number
  memo: string | null
  status: string
  metadata: PymntMeta | null
  reg_dtm: string
  mod_dtm: string
  sys_user: unknown
}

// 테마 판별 — fn_build_daily_stats(테마별 일별 매출)와 동일한 분류 규칙
// 1) metadata.theme_cd 직접 지정 (CHAT_ROOM_CREATE·FEATURE_ADDON)
// 2) CHAT_SUBSCR → SUBSCRIPTION 고정
// 3) STICKER_PACK → msg_stkr_pack.theme_cd
// 4) metadata.room_id → msg_room.theme_cd (PI_TIP·PI_BET·EVENT_ROOM_JOIN)
// 5) CHAT_ROOM_CREATE인데 theme_cd 누락 → msg_room.pymnt_id 역참조 (018 보완 로직)
// 6) 그 외 → UNKNOWN
async function resolveThemes(
  payments: PymntRow[],
): Promise<Map<string, string>> {
  const db = getSupabaseAdmin()

  const roomIds = new Set<string>()
  const packIds = new Set<string>()
  const orphanRoomCreateIds = new Set<string>() // theme_cd 누락된 방 생성 결제

  for (const p of payments) {
    const m = p.metadata
    if (!m || m.theme_cd) continue
    if (m.type === 'STICKER_PACK' && m.pack_id) packIds.add(m.pack_id)
    else if (m.room_id) roomIds.add(m.room_id)
    else if (m.type === 'CHAT_ROOM_CREATE')
      orphanRoomCreateIds.add(p.payment_id)
  }

  const [roomRes, packRes, orphanRes] = await Promise.all([
    roomIds.size > 0
      ? db
          .from('msg_room')
          .select('room_id, theme_cd')
          .in('room_id', [...roomIds])
      : Promise.resolve({ data: [] }),
    packIds.size > 0
      ? db
          .from('msg_stkr_pack')
          .select('pack_id, theme_cd')
          .in('pack_id', [...packIds])
      : Promise.resolve({ data: [] }),
    orphanRoomCreateIds.size > 0
      ? db
          .from('msg_room')
          .select('pymnt_id, theme_cd')
          .in('pymnt_id', [...orphanRoomCreateIds])
      : Promise.resolve({ data: [] }),
  ])

  const roomTheme = new Map(
    (roomRes.data ?? []).map(
      (r: { room_id: string; theme_cd: string | null }) => [
        r.room_id,
        r.theme_cd,
      ],
    ),
  )
  const packTheme = new Map(
    (packRes.data ?? []).map(
      (r: { pack_id: string; theme_cd: string | null }) => [
        r.pack_id,
        r.theme_cd,
      ],
    ),
  )
  const orphanTheme = new Map(
    (orphanRes.data ?? []).map(
      (r: { pymnt_id: string; theme_cd: string | null }) => [
        r.pymnt_id,
        r.theme_cd,
      ],
    ),
  )

  const result = new Map<string, string>()
  for (const p of payments) {
    const m = p.metadata
    let theme: string | null | undefined
    if (m?.theme_cd) theme = m.theme_cd
    else if (m?.type === 'CHAT_SUBSCR') theme = 'SUBSCRIPTION'
    else if (m?.type === 'STICKER_PACK' && m.pack_id)
      theme = packTheme.get(m.pack_id)
    else if (m?.room_id) theme = roomTheme.get(m.room_id)
    else if (m?.type === 'CHAT_ROOM_CREATE')
      theme = orphanTheme.get(p.payment_id)
    result.set(p.id, theme ?? 'UNKNOWN')
  }
  return result
}

export async function GET() {
  const requester = await getSessionUser()
  if (!isAdmin(requester)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const db = getSupabaseAdmin()
  const [pymntRes, themeRes] = await Promise.all([
    db
      .from('pi_pymnt')
      .select(
        `
        id,
        payment_id,
        txid,
        amount,
        memo,
        status,
        metadata,
        reg_dtm,
        mod_dtm,
        sys_user ( display_name, pi_username, google_email )
      `,
      )
      .order('reg_dtm', { ascending: false }),
    db.from('msg_theme').select('theme_cd, theme_nm, theme_emoji'),
  ])

  if (pymntRes.error) {
    return NextResponse.json({ error: '결제 내역 조회 실패' }, { status: 500 })
  }

  const payments = (pymntRes.data ?? []) as unknown as PymntRow[]
  const themeMap = await resolveThemes(payments)
  const themeMst = new Map(
    (themeRes.data ?? []).map(
      (t: {
        theme_cd: string
        theme_nm: string | null
        theme_emoji: string | null
      }) => [t.theme_cd, t],
    ),
  )

  const enriched = payments.map((p) => {
    const themeCd = themeMap.get(p.id) ?? 'UNKNOWN'
    const mst = themeMst.get(themeCd)
    return {
      ...p,
      pymnt_type: p.metadata?.type ?? null,
      theme_cd: themeCd,
      theme_nm: mst?.theme_nm ?? null, // SUBSCRIPTION·UNKNOWN은 클라이언트에서 번역
      theme_emoji: mst?.theme_emoji ?? null,
    }
  })

  return NextResponse.json({ payments: enriched })
}

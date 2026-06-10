import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getSessionUser } from '@/lib/auth-check'

interface StickerRow {
  stkr_id: string
  pack_id: string
  stkr_nm: string
  stkr_url: string
  sort_ord: number
}

interface PackRow {
  pack_id: string
  pack_nm: string
  pack_desc: string | null
  price_pi: number
  is_dflt_yn: string
}

// GET /api/stickers/packs — 보유팩(전체 스티커) + 미보유 스토어팩(미리보기 3개)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()

  const { data: allPacks } = await db
    .from('msg_stkr_pack')
    .select('pack_id, pack_nm, pack_desc, price_pi, is_dflt_yn')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .order('price_pi')

  if (!allPacks?.length) {
    return NextResponse.json({ ownedPacks: [], storePacks: [] })
  }

  const packs = allPacks as PackRow[]
  const packIds = packs.map(p => p.pack_id)

  // 구매 기록 + 스티커 목록 병렬 조회 (N+1 없이 2번 쿼리)
  const [{ data: myRows }, { data: allStickers }] = await Promise.all([
    db.from('msg_usr_stkr').select('pack_id').eq('usr_id', user.id).eq('del_yn', 'N'),
    db
      .from('msg_stkr')
      .select('stkr_id, pack_id, stkr_nm, stkr_url, sort_ord')
      .in('pack_id', packIds)
      .eq('del_yn', 'N')
      .order('sort_ord'),
  ])

  const ownedPackIds = new Set<string>([
    ...(myRows ?? []).map((r: { pack_id: string }) => r.pack_id),
    // 무료팩(기본팩 or price_pi=0)은 항상 보유로 처리
    ...packs
      .filter(p => p.is_dflt_yn === 'Y' || Number(p.price_pi) === 0)
      .map(p => p.pack_id),
  ])

  // 스티커를 팩별로 그룹핑
  const stickersByPack = new Map<string, StickerRow[]>()
  for (const s of (allStickers ?? []) as StickerRow[]) {
    const list = stickersByPack.get(s.pack_id) ?? []
    list.push(s)
    stickersByPack.set(s.pack_id, list)
  }

  const ownedPacks = []
  const storePacks = []

  for (const pack of packs) {
    const stickers = stickersByPack.get(pack.pack_id) ?? []
    if (ownedPackIds.has(pack.pack_id)) {
      ownedPacks.push({ ...pack, stickers })
    } else {
      storePacks.push({ ...pack, preview_stickers: stickers.slice(0, 3) })
    }
  }

  return NextResponse.json({ ownedPacks, storePacks })
}

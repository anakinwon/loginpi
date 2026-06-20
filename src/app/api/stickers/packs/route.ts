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
  price_bean: number
  is_dflt_yn: string
  ownr_usr_id: string | null
}

// GET /api/stickers/packs — 보유팩(전체 스티커) + 미보유 스토어팩(미리보기 3개)
export async function GET() {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const db = getSupabaseAdmin()

  // TASK-074: 노출 범위 — 플랫폼 기본팩(ownr 없음) + 마켓 판매 커스텀팩 + 내가 만든 팩
  const { data: allPacks } = await db
    .from('msg_stkr_pack')
    .select('pack_id, pack_nm, pack_desc, price_bean, is_dflt_yn, ownr_usr_id')
    .eq('use_yn', 'Y')
    .eq('del_yn', 'N')
    .or(`ownr_usr_id.is.null,mkt_yn.eq.Y,ownr_usr_id.eq.${user.id}`)
    // sort_ord(노출 순서) 우선, 같으면 가격순 — 골프 인사/응원팩 등 우선 노출 팩 제어
    .order('sort_ord')
    .order('price_bean')

  if (!allPacks?.length) {
    return NextResponse.json({ ownedPacks: [], storePacks: [] })
  }

  const packs = allPacks as PackRow[]
  const packIds = packs.map((p) => p.pack_id)

  // 구매 기록 + 스티커 목록 병렬 조회 (N+1 없이 2번 쿼리)
  const [{ data: myRows }, { data: allStickers }] = await Promise.all([
    db
      .from('msg_usr_stkr')
      .select('pack_id')
      .eq('usr_id', user.id)
      .eq('del_yn', 'N'),
    db
      .from('msg_stkr')
      .select('stkr_id, pack_id, stkr_nm, stkr_url, sort_ord')
      .in('pack_id', packIds)
      .eq('del_yn', 'N')
      .order('sort_ord'),
  ])

  const ownedPackIds = new Set<string>([
    ...(myRows ?? []).map((r: { pack_id: string }) => r.pack_id),
    // 무료팩(기본팩 or price_bean=0)은 항상 보유로 처리
    ...packs
      .filter((p) => p.is_dflt_yn === 'Y' || Number(p.price_bean) === 0)
      .map((p) => p.pack_id),
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
    // 내가 만든 커스텀 팩 여부 — ownr_usr_id는 응답에 노출하지 않고 is_custom 플래그만 전달
    const { ownr_usr_id, ...rest } = pack
    const is_custom = ownr_usr_id === user.id
    if (ownedPackIds.has(pack.pack_id)) {
      ownedPacks.push({ ...rest, is_custom, stickers })
    } else {
      storePacks.push({
        ...rest,
        is_custom,
        preview_stickers: stickers.slice(0, 3),
      })
    }
  }

  // 커스텀(내가 만든) 팩을 항상 맨 앞으로 — stable sort로 그 외 팩의 가격순은 유지
  ownedPacks.sort((a, b) => Number(b.is_custom) - Number(a.is_custom))

  return NextResponse.json({ ownedPacks, storePacks })
}

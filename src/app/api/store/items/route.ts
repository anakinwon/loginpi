import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listOpenItems, listMyItems, createItem } from '@/lib/mps-item'
import { getDistCfg } from '@/lib/mps-dist-cfg'

export const revalidate = 120 // 2분 캐시 (공개 상품 목록)

// GET /api/store/items — 공개 목록 (Guest 허용) | ?mine=1 — 내 상품 (인증)
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  if (sp.get('mine') === '1') {
    const user = await getSessionUser()
    if (!user)
      return NextResponse.json(
        { error: '로그인이 필요합니다' },
        { status: 401 },
      )
    // 관리자 전체보기 — ?all=1 + isAdmin일 때만 전체 판매자 상품(null), 그 외 본인만
    const wantAll = sp.get('all') === '1' && isAdmin(user)
    const items = await listMyItems(wantAll ? null : user.id)
    return NextResponse.json({ items })
  }

  const sortParam = sp.get('sort')
  const latParam = sp.get('lat')
  const lngParam = sp.get('lng')

  // lat/lng 제공 시 사용자 동의 확인 후 거리 계산 허용 (Rule LBS-04)
  // sort=distance(주변순)뿐 아니라 일반 정렬 목록의 상품별 거리 표시에도 사용
  let userLat: number | undefined
  let userLng: number | undefined
  if (latParam && lngParam) {
    const user = await getSessionUser()
    if (user?.lbs_consent_yn === 'Y') {
      userLat = parseFloat(latParam)
      userLng = parseFloat(lngParam)
    }
  }

  const { max_dist_km } = await getDistCfg()
  const result = await listOpenItems({
    ctgrId: sp.get('ctgr') ?? undefined,
    keyword: sp.get('q') ?? undefined,
    cndCd: sp.get('cnd') ?? undefined,
    shopId: sp.get('shop') ?? undefined, // 매장 스토어프론트 (FR-15)
    sort: (
      ['latest', 'price_asc', 'price_desc', 'views', 'distance'] as const
    ).find((s) => s === sortParam),
    page: Number(sp.get('page')) || 1,
    limit: Number(sp.get('limit')) || 20,
    userLat,
    userLng,
    radiusKm: sp.get('radius') ? Number(sp.get('radius')) : undefined,
    maxDistKm: max_dist_km,
  })
  return NextResponse.json(result)
}

const createSchema = z.object({
  item_nm: z.string().min(1).max(300),
  item_desc: z.string().max(5000).optional(),
  price_pi: z.number().positive().max(1_000_000),
  // 자국통화 등록(선택) — 둘 다 있을 때만 ccy 스냅샷 저장(price_pi는 견적 환산 Pi)
  ccy_cd: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  ccy_amt: z.number().positive().max(1_000_000_000_000).optional(),
  item_cnd_cd: z.enum(['NEW', 'USED', 'HANDMADE']),
  ctgr_id: z.uuid().optional(),
  shop_id: z.uuid().optional(),
  reg_qty: z.number().int().min(1).max(9999).optional(),
  thumbnail_url: z.url().optional(),
  images: z.array(z.url()).max(3).optional(),
  item_st_cd: z.enum(['DRAFT', 'OPEN']).optional(),
  // 상품 판매 위치 — LBS 동의 판매자만 저장 (미동의 시 서버에서 제거)
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

// POST /api/store/items — 상품 등록 (판매자 인증)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', detail: parsed.error.issues },
      { status: 400 },
    )
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)

  // shop_id 지정 시 본인 매장인지 검증 (IDOR 방지 — 타인 매장에 상품 부착 차단)
  // 매장 좌표도 함께 조회해서 상품에 자동 상속 (O2O 상품 위치 = 매장 위치)
  let shopCoords: { latd_crd: number | null; lngt_crd: number | null } | null =
    null
  if (parsed.data.shop_id) {
    const { data: ownShop } = await getSupabaseAdmin()
      .from('mps_shop')
      .select('shop_id, latd_crd, lngt_crd')
      .eq('shop_id', parsed.data.shop_id)
      .eq('seller_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle()
    if (!ownShop) {
      return NextResponse.json(
        { error: '본인 매장이 아니거나 존재하지 않는 매장입니다' },
        { status: 403 },
      )
    }
    shopCoords = ownShop as { latd_crd: number | null; lngt_crd: number | null }
  }

  const input = { ...parsed.data }
  // 자국통화는 코드+금액이 모두 있을 때만 유효 — 한쪽만 오면 Pi 직접입력으로 간주
  if (!(input.ccy_cd && input.ccy_amt)) {
    delete input.ccy_cd
    delete input.ccy_amt
  }

  const lbsConsented = user.lbs_consent_yn === 'Y'
  let hasLoc = false

  if (shopCoords) {
    // 매장 상품: 클라이언트 입력 좌표 무시 → 매장 위치 자동 상속 (O2O 원칙)
    delete input.lat
    delete input.lng
    if (shopCoords.latd_crd !== null && shopCoords.lngt_crd !== null) {
      input.lat = shopCoords.latd_crd
      input.lng = shopCoords.lngt_crd
      hasLoc = true
    }
  } else {
    // P2P 상품: LBS 동의 판매자만 본인 입력 좌표 저장 (Rule LBS-01)
    hasLoc = input.lat !== undefined && input.lng !== undefined
    if (hasLoc && !lbsConsented) {
      delete input.lat
      delete input.lng
      hasLoc = false
    }
  }

  const item = await createItem(user.id, slug, input)

  // 위치 이력 기록 (loc_tp_cd=04 상품거래, ref_id=item_id) — 실패해도 등록은 유지
  // P2P: LBS 동의 판매자만 / 매장 상품: 매장 좌표 상속된 경우
  if (hasLoc && (lbsConsented || shopCoords !== null)) {
    await getSupabaseAdmin()
      .from('usr_loc_hist')
      .insert({
        user_str_id: user.id,
        loc_tp_cd: '04',
        latd_crd: input.lat,
        lngt_crd: input.lng,
        ref_id: item.item_id,
        consent_yn: 'Y',
        consent_dtm: new Date().toISOString(),
        regr_id: slug,
        modr_id: slug,
      })
      .then(({ error }) => {
        if (error) console.error('상품 위치 이력 기록 실패:', error.message)
      })
  }

  return NextResponse.json({ item }, { status: 201 })
}

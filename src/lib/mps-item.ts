import 'server-only'
import { getSupabaseAdmin } from './supabase-admin'
import { isSellerBonded } from './mps-bond'

// MPS 상품 CRUD — 재고 불변 조건 stock_qty = reg_qty - ordered_qty (DB CHECK 이중 보장)

export const UNLIMITED_QTY = 9999 // 무제한 재고 센티널 — 자동 SOLD 전환 억제

export interface MpsItem {
  item_id: string
  seller_id: string
  shop_id: string | null
  ctgr_id: string | null
  item_nm: string
  item_desc: string | null
  price_pi: number
  // 등록시점 자국통화 스냅샷 — ccy_cd NULL이면 Pi 직접입력(법정화폐 미사용)
  ccy_cd: string | null
  ccy_amt: number | null
  fx_snap_dtm: string | null
  item_cnd_cd: 'NEW' | 'USED' | 'HANDMADE'
  item_st_cd: 'DRAFT' | 'OPEN' | 'CLOSED' | 'SOLD'
  view_cnt: number
  thumbnail_url: string | null
  reg_qty: number
  ordered_qty: number
  stock_qty: number
  latd_crd: number | null
  lngt_crd: number | null
  reg_dtm: string
  mod_dtm: string
}

export interface ItemListFilter {
  ctgrId?: string
  keyword?: string
  cndCd?: string
  shopId?: string // 매장 스토어프론트 — 해당 매장 상품만 (FR-15)
  sort?: 'latest' | 'price_asc' | 'price_desc' | 'views' | 'distance'
  page?: number
  limit?: number
  // LBS 거리 필터 (Rule LBS-04 — 동의자 전용, 클라이언트에서 동의 확인 후 전달)
  userLat?: number
  userLng?: number
  radiusKm?: number
}

export interface CreateItemInput {
  item_nm: string
  item_desc?: string
  price_pi: number
  // 자국통화 등록 — 판매자가 본인 통화로 입력 시 전달(price_pi는 견적 환산 Pi). 미전달 시 Pi 직접입력
  ccy_cd?: string
  ccy_amt?: number
  item_cnd_cd: string
  ctgr_id?: string
  shop_id?: string
  reg_qty?: number
  thumbnail_url?: string
  item_st_cd?: 'DRAFT' | 'OPEN'
  // 상품 이미지 원본 공개 URL 배열 (최대 3장, mps_item_img에 저장)
  images?: string[]
  // 상품 판매 위치 (LBS 동의 판매자만 — route에서 동의 검증 후 전달)
  lat?: number
  lng?: number
}

const MAX_IMAGES = 3

// 상품 이미지 동기화 — 기존 이미지 전부 논리삭제 후 재삽입(순서·대표 재구성)
// sort_ord = 배열 인덱스, thumbnail_yn = 첫 장만 'Y'(대표)
async function syncItemImages(itemId: string, urls: string[], actorId: string) {
  const db = getSupabaseAdmin()
  const now = new Date().toISOString()
  await db
    .from('mps_item_img')
    .update({ del_yn: 'Y', del_dtm: now, modr_id: actorId, mod_dtm: now })
    .eq('item_id', itemId)
    .eq('del_yn', 'N')

  const rows = urls.slice(0, MAX_IMAGES).map((url, i) => ({
    item_id: itemId,
    img_url: url,
    sort_ord: i,
    thumbnail_yn: i === 0 ? 'Y' : 'N',
    regr_id: actorId,
    modr_id: actorId,
  }))
  if (rows.length > 0) {
    const { error } = await db.from('mps_item_img').insert(rows)
    if (error) throw new Error(error.message)
  }
}

const SORT_MAP = {
  latest: { column: 'reg_dtm', ascending: false },
  price_asc: { column: 'price_pi', ascending: true },
  price_desc: { column: 'price_pi', ascending: false },
  views: { column: 'view_cnt', ascending: false },
} as const

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 진행 중 주문 상태 — 재고를 선점하고 아직 종결되지 않은 주문 (거래중 표시 기준)
const ACTIVE_ORDER_STS = [
  'PENDING',
  'ESCROW',
  'TRADING',
  'SELLER_DONE',
  'BUYER_DONE',
]

// 상품별 진행 중 주문 수 집계 — 거래중/판매완료 구분에 사용
async function getTradingCounts(
  itemIds: string[],
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map()
  const { data } = await getSupabaseAdmin()
    .from('mps_order')
    .select('item_id')
    .in('item_id', itemIds)
    .in('order_st_cd', ACTIVE_ORDER_STS)
    .eq('del_yn', 'N')

  const map = new Map<string, number>()
  for (const row of (data ?? []) as { item_id: string }[]) {
    map.set(row.item_id, (map.get(row.item_id) ?? 0) + 1)
  }
  return map
}

type ItemWithShop = MpsItem & {
  mps_shop?: {
    shop_nm: string | null
    latd_crd: number | null
    lngt_crd: number | null
  } | null
}

// 사용자와의 거리(km, 소수 1자리) — 상품 개별 좌표 우선, 없으면 매장 좌표 폴백
function calcDistanceKm(
  r: ItemWithShop,
  uLat: number,
  uLng: number,
): number | null {
  const itemLat = r.latd_crd ?? r.mps_shop?.latd_crd ?? null
  const itemLng = r.lngt_crd ?? r.mps_shop?.lngt_crd ?? null
  return itemLat !== null && itemLng !== null
    ? Math.round(haversineKm(uLat, uLng, itemLat, itemLng) * 10) / 10
    : null
}

// 공개 목록 — OPEN·SOLD 노출 (DRAFT·CLOSED 제외). SOLD는 거래중/판매완료 배지 표시용
export async function listOpenItems(filter: ItemListFilter) {
  const db = getSupabaseAdmin()
  const limit = Math.min(filter.limit ?? 20, 50)
  const page = Math.max(filter.page ?? 1, 1)
  // 좌표가 있으면 정렬 방식과 무관하게 distance_km 계산 (목록 거리 배지용)
  const hasLoc = filter.userLat !== undefined && filter.userLng !== undefined
  const useDistance = filter.sort === 'distance' && hasLoc

  let q = db
    .from('mps_item')
    .select(
      hasLoc
        ? '*, mps_shop(shop_nm, latd_crd, lngt_crd)'
        : '*, mps_shop(shop_nm)',
      { count: useDistance ? undefined : 'exact' },
    )
    .eq('del_yn', 'N')
    .in('item_st_cd', ['OPEN', 'SOLD'])

  if (filter.ctgrId) q = q.eq('ctgr_id', filter.ctgrId)
  if (filter.cndCd) q = q.eq('item_cnd_cd', filter.cndCd)
  if (filter.shopId) q = q.eq('shop_id', filter.shopId)
  if (filter.keyword) {
    const kw = filter.keyword.replaceAll('%', '\\%').replaceAll('_', '\\_')
    q = q.or(`item_nm.ilike.%${kw}%,item_desc.ilike.%${kw}%`)
  }

  // 거리 정렬: 전체 조회 후 JS에서 Haversine 계산 → 반경 필터 → 거리순 정렬 → 페이지네이션
  if (useDistance) {
    const { data, error } = await q.order('reg_dtm', { ascending: false })
    if (error) throw new Error(error.message)

    const uLat = filter.userLat!
    const uLng = filter.userLng!
    const radius = filter.radiusKm ?? 10

    const withDist = (data as unknown as ItemWithShop[])
      .map((r) => {
        const distance_km = calcDistanceKm(r, uLat, uLng)
        const { mps_shop, ...item } = r
        return { ...item, shop_nm: mps_shop?.shop_nm ?? null, distance_km }
      })
      .filter((r) => r.distance_km !== null && r.distance_km <= radius)
      .sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity))

    const total = withDist.length
    const sliced = withDist.slice((page - 1) * limit, page * limit)
    const tradingCounts = await getTradingCounts(sliced.map((r) => r.item_id))
    const items = sliced.map((r) => ({
      ...r,
      trading_cnt: tradingCounts.get(r.item_id) ?? 0,
    }))
    return { items, total, page, limit }
  }

  const sortKey =
    (filter.sort ?? 'latest') in SORT_MAP
      ? (filter.sort as keyof typeof SORT_MAP)
      : 'latest'
  const sort = SORT_MAP[sortKey]
  const { data, count, error } = await q
    .order(sort.column, { ascending: sort.ascending })
    .range((page - 1) * limit, page * limit - 1)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as ItemWithShop[]
  const tradingCounts = await getTradingCounts(rows.map((r) => r.item_id))
  const items = rows.map((r) => {
    const distance_km = hasLoc
      ? calcDistanceKm(r, filter.userLat!, filter.userLng!)
      : undefined
    const { mps_shop, ...item } = r
    return {
      ...item,
      shop_nm: mps_shop?.shop_nm ?? null,
      ...(distance_km !== undefined && { distance_km }),
      trading_cnt: tradingCounts.get(r.item_id) ?? 0,
    }
  })
  return { items, total: count ?? 0, page, limit }
}

// 판매자 본인 상품 목록 — 전체 상태 포함 + 진행 중 주문 수 (거래중/판매완료 배지)
// sellerId=null → 전체 판매자 상품(관리자 전체보기 전용 — 호출자가 isAdmin 검증 후 null 전달)
export async function listMyItems(sellerId: string | null) {
  let q = getSupabaseAdmin()
    .from('mps_item')
    .select('*, mps_shop(shop_nm)')
    .eq('del_yn', 'N')
    .order('reg_dtm', { ascending: false })
  if (sellerId) q = q.eq('seller_id', sellerId)
  const { data, error } = await q

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as (MpsItem & {
    mps_shop?: { shop_nm: string } | null
  })[]
  const tradingCounts = await getTradingCounts(rows.map((r) => r.item_id))
  return rows.map((r) => {
    const { mps_shop, ...rest } = r
    return {
      ...rest,
      shop_nm: mps_shop?.shop_nm ?? null,
      trading_cnt: tradingCounts.get(r.item_id) ?? 0,
    }
  })
}

// 상세 조회 — 이미지·매장 포함. DRAFT는 판매자 본인에게만 노출
export async function getItemDetail(itemId: string, viewerId?: string) {
  const db = getSupabaseAdmin()
  const [{ data: item }, { data: imgs }] = await Promise.all([
    db
      .from('mps_item')
      .select('*')
      .eq('item_id', itemId)
      .eq('del_yn', 'N')
      .maybeSingle(),
    db
      .from('mps_item_img')
      .select('img_id, img_url, sort_ord, thumbnail_yn')
      .eq('item_id', itemId)
      .eq('del_yn', 'N')
      .order('sort_ord'),
  ])

  if (!item) return null
  const row = item as MpsItem
  if (row.item_st_cd === 'DRAFT' && row.seller_id !== viewerId) return null

  let shop: Record<string, unknown> | null = null
  if (row.shop_id) {
    const { data } = await db
      .from('mps_shop')
      .select(
        'shop_id, shop_nm, shop_type_cd, addr, biz_hour, contact_tel, dlvr_yn',
      )
      .eq('shop_id', row.shop_id)
      .eq('del_yn', 'N')
      .maybeSingle()
    shop = data
  }

  // 보증금 거래 여부 — 구매자가 취소수수료 발생 여부를 거래 전에 인지 (FR-10 단서 공시)
  // 진행 중 주문 수 — 거래중/판매완료 배지 구분
  const [sellerBonded, tradingCounts] = await Promise.all([
    isSellerBonded(row.seller_id),
    getTradingCounts([row.item_id]),
  ])

  return {
    ...row,
    images: imgs ?? [],
    shop,
    seller_bonded: sellerBonded,
    trading_cnt: tradingCounts.get(row.item_id) ?? 0,
  }
}

// 조회수 증가 — 정밀 카운팅 불필요, 실패는 무시
export async function incrementViewCnt(itemId: string, current: number) {
  await getSupabaseAdmin()
    .from('mps_item')
    .update({ view_cnt: current + 1 })
    .eq('item_id', itemId)
}

export async function createItem(
  sellerId: string,
  regrId: string,
  input: CreateItemInput,
) {
  const regQty = input.reg_qty ?? 1
  const { data, error } = await getSupabaseAdmin()
    .from('mps_item')
    .insert({
      seller_id: sellerId,
      item_nm: input.item_nm,
      item_desc: input.item_desc ?? null,
      price_pi: input.price_pi,
      // 자국통화 등록시점 스냅샷 — ccy_cd 있을 때만 환율 일시 기록(서버 시각이 정본)
      ccy_cd: input.ccy_cd ?? null,
      ccy_amt: input.ccy_cd ? (input.ccy_amt ?? null) : null,
      fx_snap_dtm: input.ccy_cd ? new Date().toISOString() : null,
      item_cnd_cd: input.item_cnd_cd,
      ctgr_id: input.ctgr_id ?? null,
      shop_id: input.shop_id ?? null,
      item_st_cd: input.item_st_cd ?? 'DRAFT',
      thumbnail_url: input.thumbnail_url ?? null,
      // API 입력은 보편표기 lat/lng → DB 표준용어 latd_crd/lngt_crd로 매핑
      latd_crd: input.lat ?? null,
      lngt_crd: input.lng ?? null,
      reg_qty: regQty,
      ordered_qty: 0,
      stock_qty: regQty, // 불변 조건: reg_qty - 0
      regr_id: regrId,
      modr_id: regrId,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  const item = data as MpsItem

  // 이미지 등록 — mps_item_img에 순서·대표와 함께 저장
  if (input.images && input.images.length > 0) {
    await syncItemImages(item.item_id, input.images, regrId)
  }
  return item
}

export interface UpdateItemPatch {
  item_nm?: string
  item_desc?: string
  price_pi?: number
  // 자국통화 재등록 — ccy_cd 지정 시 ccy 스냅샷 갱신(fx_snap_dtm 재기록), null이면 Pi 직접입력으로 전환
  ccy_cd?: string | null
  ccy_amt?: number | null
  item_cnd_cd?: string
  ctgr_id?: string | null
  shop_id?: string | null
  thumbnail_url?: string | null
  item_st_cd?: 'DRAFT' | 'OPEN' | 'CLOSED'
  reg_qty?: number
  // 이미지 원본 URL 배열 — 지정 시 기존 이미지 전체 교체(순서·대표 재구성)
  images?: string[]
}

export type UpdateItemError =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATUS'
  | 'QTY_BELOW_ORDERED'

// 수정 — 본인 확인 + reg_qty 변경 시 재고 재계산 (new_reg_qty >= ordered_qty 검증)
export async function updateItem(
  itemId: string,
  sellerId: string,
  patch: UpdateItemPatch,
): Promise<{ error: UpdateItemError } | { item: MpsItem }> {
  const db = getSupabaseAdmin()
  const { data: cur } = await db
    .from('mps_item')
    .select('*')
    .eq('item_id', itemId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!cur) return { error: 'NOT_FOUND' as const }
  const item = cur as MpsItem
  if (item.seller_id !== sellerId) return { error: 'FORBIDDEN' as const }

  const update: Record<string, unknown> = {
    modr_id: sellerId,
    mod_dtm: new Date().toISOString(),
  }
  for (const key of [
    'item_nm',
    'item_desc',
    'price_pi',
    'item_cnd_cd',
    'ctgr_id',
    'shop_id',
    'thumbnail_url',
    'item_st_cd',
  ] as const) {
    if (patch[key] !== undefined) update[key] = patch[key]
  }

  // 자국통화 스냅샷 — ccy_cd 지정 시 갱신. null이면 Pi 직접입력 전환(통화 필드 일괄 해제)
  if (patch.ccy_cd !== undefined) {
    update.ccy_cd = patch.ccy_cd
    update.ccy_amt = patch.ccy_cd ? (patch.ccy_amt ?? null) : null
    update.fx_snap_dtm = patch.ccy_cd ? new Date().toISOString() : null
  }

  // SOLD는 자동 전환 전용 — 수동 지정 불가 (DB CHECK과 별개로 명시 차단)
  if (
    patch.item_st_cd &&
    !['DRAFT', 'OPEN', 'CLOSED'].includes(patch.item_st_cd)
  ) {
    return { error: 'INVALID_STATUS' as const }
  }

  if (patch.reg_qty !== undefined) {
    if (patch.reg_qty < item.ordered_qty)
      return { error: 'QTY_BELOW_ORDERED' as const }
    update.reg_qty = patch.reg_qty
    update.stock_qty = patch.reg_qty - item.ordered_qty
    // SOLD 상품의 수량 증가 → OPEN 재전환 (FR-02)
    if (
      item.item_st_cd === 'SOLD' &&
      patch.reg_qty - item.ordered_qty > 0 &&
      !patch.item_st_cd
    ) {
      update.item_st_cd = 'OPEN'
    }
  }

  const { data, error } = await db
    .from('mps_item')
    .update(update)
    .eq('item_id', itemId)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // 이미지 교체 — 지정된 경우에만 mps_item_img 재구성
  if (patch.images !== undefined) {
    await syncItemImages(itemId, patch.images, sellerId)
  }
  return { item: data as MpsItem }
}

// 논리삭제 — 물리 DELETE 금지
export async function softDeleteItem(
  itemId: string,
  sellerId: string,
  isAdminUser = false,
) {
  const db = getSupabaseAdmin()
  let q = db
    .from('mps_item')
    .update({
      del_yn: 'Y',
      del_dtm: new Date().toISOString(),
      modr_id: sellerId,
      mod_dtm: new Date().toISOString(),
    })
    .eq('item_id', itemId)
    .eq('del_yn', 'N')

  if (!isAdminUser) q = q.eq('seller_id', sellerId)

  const { data, error } = await q.select('item_id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

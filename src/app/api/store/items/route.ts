import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { listOpenItems, listMyItems, createItem } from '@/lib/mps-item'

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
    const items = await listMyItems(user.id)
    return NextResponse.json({ items })
  }

  const sortParam = sp.get('sort')
  const latParam = sp.get('lat')
  const lngParam = sp.get('lng')

  // sort=distance 요청 시 사용자 동의 확인 (Rule LBS-04)
  let userLat: number | undefined
  let userLng: number | undefined
  if (sortParam === 'distance' && latParam && lngParam) {
    const user = await getSessionUser()
    if (user?.lbs_consent_yn === 'Y') {
      userLat = parseFloat(latParam)
      userLng = parseFloat(lngParam)
    }
  }

  const result = await listOpenItems({
    ctgrId: sp.get('ctgr') ?? undefined,
    keyword: sp.get('q') ?? undefined,
    cndCd: sp.get('cnd') ?? undefined,
    sort: (['latest', 'price_asc', 'price_desc', 'views', 'distance'] as const).find(
      (s) => s === sortParam,
    ),
    page: Number(sp.get('page')) || 1,
    limit: Number(sp.get('limit')) || 20,
    userLat,
    userLng,
    radiusKm: sp.get('radius') ? Number(sp.get('radius')) : undefined,
  })
  return NextResponse.json(result)
}

const createSchema = z.object({
  item_nm: z.string().min(1).max(300),
  item_desc: z.string().max(5000).optional(),
  price_pi: z.number().positive().max(1_000_000),
  item_cnd_cd: z.enum(['NEW', 'USED', 'HANDMADE']),
  ctgr_id: z.uuid().optional(),
  shop_id: z.uuid().optional(),
  reg_qty: z.number().int().min(1).max(9999).optional(),
  thumbnail_url: z.url().optional(),
  item_st_cd: z.enum(['DRAFT', 'OPEN']).optional(),
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
  const item = await createItem(user.id, slug, parsed.data)
  return NextResponse.json({ item }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  getItemDetail,
  incrementViewCnt,
  updateItem,
  softDeleteItem,
} from '@/lib/mps-item'

// GET /api/store/items/[itemId] — 상세 (Guest 허용, 이미지·매장 포함)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params
  const user = await getSessionUser()
  const item = await getItemDetail(itemId, user?.id)
  if (!item)
    return NextResponse.json(
      { error: '상품을 찾을 수 없습니다' },
      { status: 404 },
    )

  // 조회수 증가 — 응답 차단 없이 비동기 (판매자 본인 조회는 제외)
  if (item.seller_id !== user?.id) void incrementViewCnt(itemId, item.view_cnt)

  return NextResponse.json({ item })
}

const patchSchema = z.object({
  item_nm: z.string().min(1).max(300).optional(),
  item_desc: z.string().max(5000).optional(),
  price_pi: z.number().positive().max(1_000_000).optional(),
  item_cnd_cd: z.enum(['NEW', 'USED', 'HANDMADE']).optional(),
  ctgr_id: z.uuid().nullable().optional(),
  shop_id: z.uuid().nullable().optional(),
  thumbnail_url: z.url().nullable().optional(),
  item_st_cd: z.enum(['DRAFT', 'OPEN', 'CLOSED']).optional(),
  reg_qty: z.number().int().min(1).max(9999).optional(),
  images: z.array(z.url()).max(3).optional(),
})

// PATCH /api/store/items/[itemId] — 수정 (본인만)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { itemId } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', detail: parsed.error.issues },
      { status: 400 },
    )
  }

  // shop_id를 비-null로 지정 시 본인 매장인지 검증 (IDOR 방지 — null은 매장 해제로 허용)
  if (parsed.data.shop_id) {
    const { data: ownShop } = await getSupabaseAdmin()
      .from('mps_shop')
      .select('shop_id')
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
  }

  const result = await updateItem(itemId, user.id, parsed.data)
  if ('error' in result) {
    const map = {
      NOT_FOUND: { msg: '상품을 찾을 수 없습니다', status: 404 },
      FORBIDDEN: { msg: '본인 상품만 수정할 수 있습니다', status: 403 },
      INVALID_STATUS: { msg: '유효하지 않은 상태입니다', status: 400 },
      QTY_BELOW_ORDERED: {
        msg: '등록수량은 누적 주문수량보다 작을 수 없습니다',
        status: 400,
      },
    } as const
    const { msg, status } = map[result.error]
    return NextResponse.json({ error: msg }, { status })
  }

  return NextResponse.json({ item: result.item })
}

// DELETE /api/store/items/[itemId] — 논리삭제 (본인·관리자)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { itemId } = await params
  const deleted = await softDeleteItem(itemId, user.id, isAdmin(user))
  if (!deleted) {
    return NextResponse.json(
      { error: '상품이 없거나 삭제 권한이 없습니다' },
      { status: 404 },
    )
  }
  return NextResponse.json({ success: true })
}

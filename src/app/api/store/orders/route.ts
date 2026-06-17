import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createOrder, listOrdersByRole } from '@/lib/mps-order'

// GET /api/store/orders?role=buyer|seller — 내 주문 목록
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  // 자동완료·정산은 5분 cron(/api/cron/order-autocomplete)이 단독 담당 — A2U 실송금을
  // fire-and-forget으로 돌리면 응답 후 함수 종료로 송금이 잘릴 수 있어 온디맨드 sweep 제거.
  const role =
    req.nextUrl.searchParams.get('role') === 'seller' ? 'seller' : 'buyer'
  // 관리자 전체보기 — ?all=1 + isAdmin일 때만 전체 주문(null), 그 외 본인만(role 컬럼 기준)
  const wantAll = req.nextUrl.searchParams.get('all') === '1' && isAdmin(user)
  const orders = await listOrdersByRole(wantAll ? null : user.id, role)
  return NextResponse.json({ orders })
}

const createSchema = z.object({
  item_id: z.uuid(),
  meet_loc_desc: z.string().max(500).optional(),
  // 주문방법 3종 (기본 매장이용). DELIVERY는 배달가능 매장 + 배달주소 필수
  order_mthd_cd: z.enum(['DINE_IN', 'PICKUP', 'DELIVERY']).optional(),
  dlvr_addr: z.string().max(500).optional(),
})

// POST /api/store/orders — 주문 생성 (재고 원자적 차감 + PENDING)
// 응답: Pi SDK createPayment 파라미터 — 클라이언트가 결제 진행, 완료 시 MPS_ESCROW 분기 처리
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
      { error: '입력값이 올바르지 않습니다' },
      { status: 400 },
    )
  }

  const orderMthd = parsed.data.order_mthd_cd ?? 'DINE_IN'

  // 배달(DELIVERY) 검증 — 배달주소 필수 + 해당 상품 매장이 배달가능(dlvr_yn='Y')해야 함
  if (orderMthd === 'DELIVERY') {
    if (!parsed.data.dlvr_addr?.trim()) {
      return NextResponse.json(
        { error: '배달 위치를 입력해주세요' },
        { status: 400 },
      )
    }
    const { data: item } = await getSupabaseAdmin()
      .from('mps_item')
      .select('shop_id, mps_shop(dlvr_yn)')
      .eq('item_id', parsed.data.item_id)
      .maybeSingle()
    const dlvrYn = (item as { mps_shop?: { dlvr_yn?: string } | null } | null)
      ?.mps_shop?.dlvr_yn
    if (dlvrYn !== 'Y') {
      return NextResponse.json(
        { error: '이 매장은 배달을 지원하지 않습니다' },
        { status: 400 },
      )
    }
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const result = await createOrder(
    parsed.data.item_id,
    user.id,
    parsed.data.meet_loc_desc ?? null,
    slug,
    orderMthd,
    parsed.data.dlvr_addr ?? null,
    isAdmin(user), // 관리자는 본인상품 테스트 결제 허용
  )

  if ('error' in result) {
    const map = {
      OUT_OF_STOCK: {
        msg: '재고가 없거나 판매 중인 상품이 아닙니다',
        status: 409,
      },
      SELF_PURCHASE: { msg: '본인 상품은 구매할 수 없습니다', status: 400 },
      ORDER_NOT_FOUND: { msg: '주문을 찾을 수 없습니다', status: 404 },
      NOT_ALLOWED: { msg: '허용되지 않은 요청입니다', status: 403 },
      EMPTY_CART: { msg: '주문 항목이 없습니다', status: 400 },
      SHOP_NOT_FOUND: { msg: '매장을 찾을 수 없습니다', status: 404 },
      BAD_QTY: { msg: '수량이 올바르지 않습니다', status: 400 },
      UNKNOWN: { msg: '주문 생성에 실패했습니다', status: 500 },
    } as const
    const { msg, status } = map[result.error]
    return NextResponse.json({ error: msg }, { status })
  }

  const { order } = result
  return NextResponse.json(
    {
      order,
      // Pi SDK createPayment 파라미터 (use-subscribe-plan 패턴)
      amount: Number(order.order_price_pi),
      memo: `🛒 PiShop 에스크로 결제`,
      metadata: {
        type: 'MPS_ESCROW',
        order_id: order.order_id,
        item_id: order.item_id,
      },
    },
    { status: 201 },
  )
}

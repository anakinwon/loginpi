import { NextResponse } from 'next/server'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createShopLinkCode } from '@/lib/telegram-link'
import { apiError } from '@/lib/api-errors'

type Params = { params: Promise<{ shopId: string }> }

// 매장별 Telegram 주문 알림 연동 — 매장(mps_shop)당 1:1. 소유자(seller) 또는 관리자만.
//   GET: 연동 상태 + 매장 전용 딥링크(createShopLinkCode) / DELETE: 연동 해제

type ShopRow = {
  shop_id: string
  seller_id: string
  shop_nm: string | null
  tlgm_conn_yn: string
}

async function ownShop(
  shopId: string,
  userId: string,
  admin: boolean,
): Promise<{ error: 403 | 404 } | { shop: ShopRow }> {
  const { data } = await getSupabaseAdmin()
    .from('mps_shop')
    .select('shop_id, seller_id, shop_nm, tlgm_conn_yn')
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .maybeSingle()
  const shop = data as ShopRow | null
  if (!shop) return { error: 404 }
  if (shop.seller_id !== userId && !admin) return { error: 403 }
  return { shop }
}

export async function GET(_req: Request, { params }: Params) {
  const { shopId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const r = await ownShop(shopId, user.id, isAdmin(user))
  if ('error' in r) return apiError('FORBIDDEN', r.error)

  const botUser = process.env.TELEGRAM_BOT_USERNAME
  const botConfigured = !!botUser && !!process.env.TELEGRAM_BOT_TOKEN
  const code = botConfigured ? createShopLinkCode(shopId) : null
  return NextResponse.json({
    connected: r.shop.tlgm_conn_yn === 'Y',
    botConfigured,
    url: code ? `https://t.me/${botUser}?start=${code}` : null,
    // 매장 전용 그룹방 연동(권장) — 그룹 chat_id 바인딩으로 매장 직원이 함께 수신.
    // 한 소유자가 여러 매장을 가져도 그룹 단위로 수신이 분리된다.
    groupUrl: code ? `https://t.me/${botUser}?startgroup=${code}` : null,
    shop_nm: r.shop.shop_nm,
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { shopId } = await params
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const r = await ownShop(shopId, user.id, isAdmin(user))
  if ('error' in r) return apiError('FORBIDDEN', r.error)

  await getSupabaseAdmin()
    .from('mps_shop')
    .update({
      tlgm_conn_yn: 'N',
      tlgm_chat_id: null,
      modr_id: user.id,
      mod_dtm: new Date().toISOString(),
    })
    .eq('shop_id', shopId)

  return NextResponse.json({ ok: true })
}

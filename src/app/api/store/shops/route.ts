import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser, isAdmin } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listMyShops, createShop } from '@/lib/mps-shop'

// GET /api/store/shops — 내 매장 목록 (판매자 인증, FR-06)
//   ?all=1 — 관리자 전체 매장 (그 외 본인 매장만)
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const wantAll = req.nextUrl.searchParams.get('all') === '1' && isAdmin(user)
  const [shops, userRes] = await Promise.all([
    listMyShops(wantAll ? null : user.id),
    getSupabaseAdmin()
      .from('sys_user')
      .select('rep_shop_id')
      .eq('id', user.id)
      .maybeSingle(),
  ])
  const repShopId = (userRes.data as { rep_shop_id?: string | null } | null)?.rep_shop_id ?? null
  return NextResponse.json({ shops, rep_shop_id: repShopId })
}

// 매장 등록·수정 공용 스키마. 좌표는 OFFLINE/BOTH만 의미 있으나 입력 자체는 항상 허용(nullable)
const shopSchema = z.object({
  shop_nm: z.string().min(1).max(100),
  shop_type_cd: z.enum(['ONLINE', 'OFFLINE', 'BOTH']),
  shop_desc: z.string().max(2000).optional(),
  addr: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  biz_hour: z.string().max(200).optional(),
  contact_tel: z.string().max(50).optional(),
  contact_email: z.email().max(200).optional(),
  sns_url: z.url().max(500).optional(),
  thumb_url: z.url().max(1000).optional(),
  dlvr_yn: z.enum(['Y', 'N']).optional(),
  // 이용후기·Bean 보상 지급 동의 (opt-in)
  fbck_consent_yn: z.enum(['Y', 'N']).optional(),
})

// POST /api/store/shops — 매장 등록 (판매자 인증)
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

  const parsed = shopSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', detail: parsed.error.issues },
      { status: 400 },
    )
  }

  const slug = String(user.display_name ?? 'user').slice(0, 20)
  const shop = await createShop(user.id, slug, parsed.data)
  return NextResponse.json({ shop }, { status: 201 })
}

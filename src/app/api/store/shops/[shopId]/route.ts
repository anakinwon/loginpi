import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth-check'
import { updateShop, softDeleteShop } from '@/lib/mps-shop'

// 수정 스키마 — 모든 필드 선택적(부분 수정). 좌표·연락처는 빈 문자열 허용 안 함(미전송이면 미변경)
const patchSchema = z.object({
  shop_nm: z.string().min(1).max(100).optional(),
  shop_type_cd: z.enum(['ONLINE', 'OFFLINE', 'BOTH']).optional(),
  shop_desc: z.string().max(2000).optional(),
  addr: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  biz_hour: z.string().max(200).optional(),
  contact_tel: z.string().max(50).optional(),
  contact_email: z.email().max(200).optional(),
  sns_url: z.url().max(500).optional(),
  thumb_url: z.url().max(1000).optional(),
  // 구글 제공 정보 (수정 가능) — place_id·인증상태(owner_verified_yn 등)는 수정 불가
  owner_nm: z.string().max(100).optional(),
  google_nm: z.string().max(200).optional(),
  website_url: z.url().max(1000).optional(),
  gmap_url: z.url().max(1000).optional(),
  biz_status_cd: z.string().max(20).optional(),
  rating_cnt: z.number().int().min(0).optional(),
  // 배달 가능 여부 (점주 설정) — 배달 주문방법 노출 게이트
  dlvr_yn: z.enum(['Y', 'N']).optional(),
  // 이용후기·Bean 보상 지급 동의 (점주 설정) — Y인 매장의 상품만 후기 허용
  fbck_consent_yn: z.enum(['Y', 'N']).optional(),
})

// PATCH /api/store/shops/[shopId] — 매장 수정 (본인 매장만, FR-06)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { shopId } = await params

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

  // updateShop은 seller_id 일치 조건으로 본인 매장만 수정 → 타인 매장은 null 반환
  const shop = await updateShop(shopId, user.id, parsed.data)
  if (!shop)
    return NextResponse.json(
      { error: '매장을 찾을 수 없거나 권한이 없습니다' },
      { status: 404 },
    )

  return NextResponse.json({ shop })
}

// DELETE /api/store/shops/[shopId] — 논리삭제 (본인 매장만, 소속 상품은 shop_id=NULL 보존)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { shopId } = await params
  const ok = await softDeleteShop(shopId, user.id)
  if (!ok)
    return NextResponse.json(
      { error: '매장을 찾을 수 없거나 권한이 없습니다' },
      { status: 404 },
    )

  return NextResponse.json({ ok: true })
}

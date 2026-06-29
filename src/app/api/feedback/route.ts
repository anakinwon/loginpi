import { NextRequest, NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getActiveFeeMode } from '@/lib/fee-resolver'
import { payFbckPiReward } from '@/lib/fbck-pi-reward'
import { maskUsername } from '@/lib/mask-username'

interface FbckImgInput {
  img_ord: number
  img_url: string
}

interface FbckItemScrInput {
  item_cd: string
  item_scr: number
}

// 점수→Bean 금액 (bean_fee_plan.prod_ctgr_cd='FBCK_REWARD')
async function getRewardBean(score: number): Promise<number> {
  const db = getSupabaseAdmin()
  const cdMap: Record<number, string> = { 1: 'FR_1', 2: 'FR_2', 3: 'FR_3', 4: 'FR_4', 5: 'FR_5' }
  const { data } = await db
    .from('bean_fee_plan')
    .select('amt_bean')
    .eq('fee_plan_cd', cdMap[score])
    .eq('del_yn', 'N')
    .maybeSingle()
  return Number((data as { amt_bean: number } | null)?.amt_bean ?? 0)
}

// GET /api/feedback?shop_id=&order_id=&item_id=&page=1&limit=20
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const shopId = searchParams.get('shop_id')
  const orderId = searchParams.get('order_id')
  const itemId = searchParams.get('item_id')
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))
  const offset = (page - 1) * limit

  if (!shopId && !orderId && !itemId) {
    return NextResponse.json({ error: 'shop_id, order_id 또는 item_id가 필요합니다' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  let q = db
    .from('fbck_mst')
    .select('fbck_id, usr_id, fbck_scr, fbck_cn, bean_rwrd_qty, reg_dtm', { count: 'exact' })
    .eq('del_yn', 'N')
    .eq('hide_yn', 'N')
    .order('reg_dtm', { ascending: false })
    .range(offset, offset + limit - 1)

  if (shopId) q = q.eq('shop_id', shopId)
  if (orderId) q = q.eq('order_id', orderId)
  if (itemId) q = q.eq('prod_id', itemId)

  const { data: rows, count, error } = await q
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })

  const fbckIds = (rows ?? []).map((r: { fbck_id: string }) => r.fbck_id)

  // 이미지 병렬 조회
  const { data: imgRows } = fbckIds.length
    ? await db
        .from('fbck_img')
        .select('fbck_id, img_ord, img_url')
        .in('fbck_id', fbckIds)
        .eq('del_yn', 'N')
        .order('img_ord', { ascending: true })
    : { data: [] }

  // 작성자 표시명 조회
  const usrIds = [...new Set((rows ?? []).map((r: { usr_id: string }) => r.usr_id))]
  const { data: userRows } = usrIds.length
    ? await db
        .from('sys_user')
        .select('id, pi_username, nick_nm')
        .in('id', usrIds)
    : { data: [] }

  const userMap = new Map(
    (userRows ?? []).map((u: { id: string; pi_username: string | null; nick_nm: string | null }) => [
      u.id,
      maskUsername(u.pi_username ?? u.nick_nm),
    ]),
  )

  const imgMap = new Map<string, string[]>()
  for (const img of (imgRows ?? []) as { fbck_id: string; img_url: string }[]) {
    const list = imgMap.get(img.fbck_id) ?? []
    list.push(img.img_url)
    imgMap.set(img.fbck_id, list)
  }

  const data = (rows ?? []).map((r: { fbck_id: string; usr_id: string; fbck_scr: number; fbck_cn: string; bean_rwrd_qty: number; reg_dtm: string }) => ({
    fbck_id: r.fbck_id,
    display_name: userMap.get(r.usr_id) ?? '****',
    fbck_scr: r.fbck_scr,
    fbck_cn: r.fbck_cn,
    fbck_img: imgMap.get(r.fbck_id) ?? [],
    reg_dtm: r.reg_dtm,
  }))

  // 별점 분포 통계 (shop_id 또는 item_id 기준)
  let stats = null
  const statsTarget = shopId ?? itemId
  if (statsTarget) {
    let statsQ = db
      .from('fbck_mst')
      .select('fbck_scr')
      .eq('del_yn', 'N')
      .eq('hide_yn', 'N')

    if (shopId) statsQ = statsQ.eq('shop_id', shopId)
    else if (itemId) statsQ = statsQ.eq('prod_id', itemId)

    const { data: allScores } = await statsQ

    if (allScores?.length) {
      const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      let sum = 0
      for (const r of allScores as { fbck_scr: number }[]) {
        dist[r.fbck_scr] = (dist[r.fbck_scr] ?? 0) + 1
        sum += r.fbck_scr
      }
      stats = {
        avg_score: Math.round((sum / allScores.length) * 10) / 10,
        total_count: allScores.length,
        score_dist: dist,
      }
    }
  }

  return NextResponse.json({
    data,
    stats,
    pagination: { page, limit, total: count ?? 0 },
  })
}

// POST /api/feedback
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const { shop_id, order_id, fbck_scr, fbck_cn, fbck_img, item_scores } = body as {
    shop_id?: string
    order_id?: string
    fbck_scr: number
    fbck_cn: string
    fbck_img?: FbckImgInput[]
    item_scores?: FbckItemScrInput[]
  }

  if (!shop_id && !order_id) {
    return NextResponse.json({ error: 'shop_id 또는 order_id가 필요합니다' }, { status: 400 })
  }
  if (!fbck_scr || fbck_scr < 1 || fbck_scr > 5) {
    return NextResponse.json({ error: '별점은 1~5점이어야 합니다' }, { status: 400 })
  }
  if (!fbck_cn || fbck_cn.trim().length < 10) {
    return NextResponse.json({ error: '후기 본문은 최소 10자 이상이어야 합니다' }, { status: 400 })
  }
  if (fbck_img && fbck_img.length > 5) {
    return NextResponse.json({ error: '이미지는 최대 5개까지 첨부 가능합니다' }, { status: 400 })
  }
  if (item_scores && item_scores.some((s) => s.item_scr < 1 || s.item_scr > 5)) {
    return NextResponse.json({ error: '항목 점수는 1~5점이어야 합니다' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  // 후기 보상 보증금 주체(매장) — 카페=OWNER usr_id / 상점=seller_id. 보증금 게이트·차감에 사용.
  let ownerId: string | null = null
  let bondKind: 'CAFE' | 'SHOP' | null = null

  // shop_id = msg_room.room_id (PyCafé™ 카페 후기)
  if (shop_id) {
    // 해당 방의 실제 멤버인지 확인 (IDOR 방지 + 자신이 만든 방 후기 금지)
    const { data: mbr } = await db
      .from('msg_room_mbr')
      .select('mbr_role_cd')
      .eq('room_id', shop_id)
      .eq('usr_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle()

    if (!mbr) {
      return NextResponse.json({ error: '해당 카페에 참여한 기록이 없습니다' }, { status: 403 })
    }
    if ((mbr as { mbr_role_cd: string }).mbr_role_cd === 'OWNER') {
      return NextResponse.json({ error: '자신이 만든 카페에는 후기를 작성할 수 없습니다' }, { status: 403 })
    }

    // 보증금 주체 = 카페 OWNER (보상 재원 차감 대상)
    const { data: roomOwner } = await db
      .from('msg_room_mbr')
      .select('usr_id')
      .eq('room_id', shop_id)
      .eq('mbr_role_cd', 'OWNER')
      .eq('del_yn', 'N')
      .maybeSingle()
    ownerId = (roomOwner as { usr_id: string } | null)?.usr_id ?? null
    bondKind = 'CAFE'
  }

  // order_id = mps_order.order_id (PyShop™ 상품 후기)
  let prodId: string | null = null
  if (order_id) {
    // 해당 주문의 실제 구매자인지 확인 (IDOR 방지)
    const { data: ord } = await db
      .from('mps_order')
      .select('order_st_cd, item_id')
      .eq('order_id', order_id)
      .eq('buyer_id', user.id)
      .eq('del_yn', 'N')
      .maybeSingle()

    if (!ord) {
      return NextResponse.json({ error: '해당 주문의 구매자가 아닙니다' }, { status: 403 })
    }
    // COMPLETED/SETTLED 상태 주문만 후기 작성 가능 (PENDING/CANCELLED 제외)
    const st = (ord as { order_st_cd: string; item_id: string }).order_st_cd
    if (st === 'PENDING' || st === 'CANCELLED') {
      return NextResponse.json({ error: '완료된 주문에 대해서만 후기를 작성할 수 있습니다' }, { status: 403 })
    }
    prodId = (ord as { order_st_cd: string; item_id: string }).item_id

    // 매장주 동의 게이트 — 이용후기·Bean 보상에 동의(fbck_consent_yn='Y')한 매장의 상품만 후기 허용 (UI 게이트의 서버 측 이중 방어)
    const { data: itemShop } = await db
      .from('mps_item')
      .select('seller_id, mps_shop(fbck_consent_yn)')
      .eq('item_id', prodId)
      .maybeSingle()
    const itemShopRow = itemShop as
      | { seller_id?: string; mps_shop?: { fbck_consent_yn?: string } | null }
      | null
    const consentYn = itemShopRow?.mps_shop?.fbck_consent_yn
    if (consentYn !== 'Y') {
      return NextResponse.json(
        { error: '이 매장은 이용후기·보상 프로그램에 참여하지 않습니다' },
        { status: 403 },
      )
    }
    // 보증금 주체 = 상점 seller (보상 재원 차감 대상)
    ownerId = itemShopRow?.seller_id ?? null
    bondKind = 'SHOP'
  }

  // 보증금 주체 확인 + 보상 보증금 게이트 (PRD_24 §10-7)
  //   보증금(잔액 ≥ 보상액)을 예치한 매장만 후기 작성·보상 가능. 1차 방어(친절 차단),
  //   실제 차감은 fn_fbck_reward_apply 내부 원자 조건부 UPDATE(2차 방어)가 보장.
  if (!ownerId || !bondKind) {
    return NextResponse.json({ error: '매장 정보를 확인할 수 없습니다' }, { status: 500 })
  }
  const rewardBean = await getRewardBean(Number(fbck_scr))
  if (rewardBean > 0) {
    const { data: bond } = await db
      .from('fbck_reward_bond')
      .select('bond_bal_bean')
      .eq('owner_id', ownerId)
      .eq('bond_kind', bondKind)
      .eq('del_yn', 'N')
      .maybeSingle()
    const bondBal = Number((bond as { bond_bal_bean: number } | null)?.bond_bal_bean ?? 0)
    if (bondBal < rewardBean) {
      return NextResponse.json(
        { error: '이 매장은 후기 보상 보증금이 부족해 현재 후기를 받지 않습니다' },
        { status: 403 },
      )
    }
  }

  const { data: inserted, error: insertErr } = await db
    .from('fbck_mst')
    .insert({
      usr_id: user.id,
      shop_id: shop_id ?? null,
      order_id: order_id ?? null,
      prod_id: prodId,
      fbck_scr: Number(fbck_scr),
      fbck_cn: fbck_cn.trim(),
      regr_id: user.id,
      modr_id: user.id,
    })
    .select('fbck_id')
    .single()

  if (insertErr) {
    // DB UNIQUE 제약 위반 = 중복 후기
    if (insertErr.code === '23505') {
      return NextResponse.json({ error: '이미 후기를 작성했습니다' }, { status: 409 })
    }
    console.error('[Feedback] 후기 저장 실패:', insertErr.message)
    return NextResponse.json({ error: '후기 저장 실패' }, { status: 500 })
  }

  const fbckId = (inserted as { fbck_id: string }).fbck_id

  // 이미지 삽입
  if (fbck_img?.length) {
    await db.from('fbck_img').insert(
      fbck_img.map((img) => ({
        fbck_id: fbckId,
        img_ord: img.img_ord,
        img_url: img.img_url,
        regr_id: user.id,
        modr_id: user.id,
      })),
    )
  }

  // 항목별 점수 삽입
  if (item_scores?.length) {
    await db.from('fbck_item_scr').insert(
      item_scores.map((s) => ({
        fbck_id: fbckId,
        item_cd: s.item_cd,
        item_scr: Number(s.item_scr),
        regr_id: user.id,
        modr_id: user.id,
      })),
    )
  }

  // 후기 보상 지급 — 보증금 차감(원자) + 모드(BEAN/PI) 분기. PRD_24 §10-7.
  //   BEAN: 작성자 Bean 지갑 지급 / PI: A2U 대기 기록(bean_txn FBCK_PI, 실송금은 후속 배치)
  let finalReward = 0 // 실제 지급된 Bean (PI 모드는 0)
  let rewardPi = 0 // 1:100 Pi 환산 보상액
  if (rewardBean > 0) {
    const mode = await getActiveFeeMode()
    const { data: rwd, error: rwdErr } = await db.rpc('fn_fbck_reward_apply', {
      p_usr_id: user.id,
      p_owner_id: ownerId,
      p_bond_kind: bondKind,
      p_fbck_id: fbckId,
      p_reward_bean: rewardBean,
      p_mode: mode,
    })
    const row = (Array.isArray(rwd) ? rwd[0] : rwd) as {
      ok: boolean
      message: string
      bond_bal: number
      reward_bean: number
      reward_pi: number
    } | null

    if (rwdErr || !row?.ok) {
      // 게이트 통과 후 동시성 등으로 보증금 부족 → 방금 저장한 후기 논리삭제(보상 없는 후기 미게시)
      await db
        .from('fbck_mst')
        .update({ del_yn: 'Y', del_dtm: new Date().toISOString(), modr_id: 'SYSTEM' })
        .eq('fbck_id', fbckId)
      if (rwdErr) console.error('[Feedback] 보상 지급 실패:', rwdErr.message)
      return NextResponse.json(
        {
          error:
            row?.message === 'INSUFFICIENT_BOND'
              ? '매장 보증금이 부족해 후기 보상을 지급할 수 없습니다'
              : '후기 보상 처리에 실패했습니다',
        },
        { status: 409 },
      )
    }

    finalReward = mode === 'BEAN' ? rewardBean : 0
    rewardPi = Number(row.reward_pi ?? 0)
    await db
      .from('fbck_mst')
      .update({
        rwrd_yn: 'Y',
        rwrd_dtm: new Date().toISOString(),
        bean_rwrd_qty: rewardBean, // 보상액(Bean 기준, 1:100). PI 모드도 동일 기준값 기록
        modr_id: 'SYSTEM',
      })
      .eq('fbck_id', fbckId)

    // PI 모드: 보증금 차감은 fn에서 완료(bean_txn FBCK_PI 대기). 실 A2U 송금 멱등 로그(PENDING) 기록
    //   + after()로 즉시 송금 시도 — 실패해도 cron(/api/cron/fbck-pi-payout)이 재시도(안전망).
    if (mode === 'PI' && rewardPi > 0) {
      await db.from('fbck_pi_reward_log').insert({
        fbck_id: fbckId,
        usr_id: user.id,
        pi_amt: rewardPi,
        reward_st_cd: 'PENDING',
        regr_id: 'SYSTEM',
        modr_id: 'SYSTEM',
      })
      after(() => payFbckPiReward(fbckId, user.id, rewardPi))
    }
  }

  const message =
    rewardBean <= 0
      ? '후기가 저장되었습니다.'
      : finalReward > 0
        ? `후기가 저장되었고, ${finalReward} Bean 보상을 받으셨습니다!`
        : `후기가 저장되었습니다. Pi 보상(약 ${rewardPi} Pi)은 곧 지급됩니다.`

  return NextResponse.json(
    {
      fbck_id: fbckId,
      fbck_scr: Number(fbck_scr),
      bean_rwrd_qty: finalReward,
      reward_pi: rewardPi,
      message,
    },
    { status: 201 },
  )
}

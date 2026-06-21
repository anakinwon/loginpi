import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentReceipt } from '@/lib/email'
import { broadcastToRoom, broadcastToSeller } from '@/lib/realtime-broadcast'
import { markEscrow } from '@/lib/mps-order'
import { dispatchOrderNotis } from '@/lib/mps-noti'
import { depositBond, BOND_DEPOSIT_PI } from '@/lib/mps-bond'
import { applyBean, BEAN_PER_PI } from '@/lib/bean'
import { recordUserAction } from '@/lib/event'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export async function POST(request: NextRequest) {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'PI_API_KEY 미설정 — Pi Developer Portal에서 발급 후 환경변수에 추가하세요',
      },
      { status: 500 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { paymentId, txid } = body as { paymentId?: string; txid?: string }
  if (!paymentId || !txid) {
    return NextResponse.json(
      { error: 'paymentId와 txid가 필요합니다' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(`${PI_PAYMENTS_URL}/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `Pi 완료 처리 실패 (${res.status}): ${text}` },
        { status: res.status },
      )
    }
    const payment = (await res.json()) as PaymentDTO

    const db = getSupabaseAdmin()

    // approve에서 생성된 row를 completed 상태로 업데이트
    await db
      .from('pi_pymnt')
      .update({ txid, status: 'completed', mod_dtm: new Date().toISOString() })
      .eq('payment_id', paymentId)

    // CHAT_ROOM_CREATE: 결제 완료 시 그룹 카페 생성
    let createdRoom: Record<string, unknown> | null = null
    // 레거시 Pi 구독(CHAT_SUBSCR) 폐기로 항상 null — 응답 스키마 호환 위해 필드 유지
    const grantedSubscr: Record<string, unknown> | null = null
    const meta = payment.metadata as Record<string, unknown> | null
    if (meta?.type === 'CHAT_ROOM_CREATE' && payment.user_uid) {
      const { data: owner } = await db
        .from('sys_user')
        .select('id, display_name, lbs_consent_yn')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      if (owner) {
        const ownerRow = owner as {
          id: string
          display_name: string | null
          lbs_consent_yn: string | null
        }
        const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)
        const { data: room } = await db
          .from('msg_room')
          .insert({
            room_nm: String(meta.room_nm ?? '카페'),
            room_desc: meta.room_desc ? String(meta.room_desc) : null,
            theme_cd: String(meta.theme_cd ?? 'CODING'),
            room_tp_cd: 'G',
            max_mbr_cnt: Number(meta.max_mbr_cnt ?? 50),
            is_public_yn: String(meta.is_public_yn ?? 'Y'),
            pymnt_id: paymentId,
            regr_id: slug,
            modr_id: slug,
          })
          .select()
          .single()

        if (room) {
          const roomId = String((room as Record<string, unknown>).room_id)
          await db.from('msg_room_mbr').insert({
            room_id: roomId,
            usr_id: ownerRow.id,
            mbr_role_cd: 'OWNER',
            regr_id: slug,
            modr_id: slug,
          })
          createdRoom = room as Record<string, unknown>

          // LBS 동의자 카페 위치 저장 (loc_tp_cd='05') — 메타데이터 lat/lng 사용
          const metaLat =
            typeof meta.lat === 'number' && isFinite(meta.lat as number)
              ? (meta.lat as number)
              : null
          const metaLng =
            typeof meta.lng === 'number' && isFinite(meta.lng as number)
              ? (meta.lng as number)
              : null
          if (
            ownerRow.lbs_consent_yn === 'Y' &&
            metaLat !== null &&
            metaLng !== null
          ) {
            Promise.all([
              db
                .from('msg_room')
                .update({ latd_crd: metaLat, lngt_crd: metaLng })
                .eq('room_id', roomId),
              db.from('usr_loc_hist').insert({
                user_str_id: ownerRow.id,
                loc_tp_cd: '05',
                latd_crd: metaLat,
                lngt_crd: metaLng,
                ref_id: roomId,
                consent_yn: 'Y',
                consent_dtm: new Date().toISOString(),
                regr_id: slug,
                modr_id: slug,
              }),
            ]).catch((err) =>
              console.error('[카페 위치] 결제 완료 저장 실패:', err),
            )
          }
        }
      }
      // 레거시 Pi 구독(CHAT_SUBSCR) 분기는 폐기됨 (PRD_15_FEE §1-6 — Bean 구독으로 일원화).
      // 구독 결제는 POST /api/subscriptions/products/subscribe (Bean SPEND)가 단독 담당.
      // PI_TIP(Pi 결제 선물)은 폐기 — 카페방 선물은 Bean 실전송(POST /api/tips, fn_bean_transfer)으로 일원화
    } else if (meta?.type === 'EVENT_ROOM_JOIN' && payment.user_uid) {
      // EVENT_ROOM_JOIN: 결제 완료 시 GUEST로 이벤트방 입장 처리
      const roomIdStr = String(meta.room_id ?? '')
      const [{ data: owner }, { data: room }] = await Promise.all([
        db
          .from('sys_user')
          .select('id, display_name')
          .eq('pi_uid', payment.user_uid)
          .maybeSingle(),
        db
          .from('msg_room')
          .select('room_id, room_nm, entry_fee_pi, entry_expire_dtm')
          .eq('room_id', roomIdStr)
          .eq('del_yn', 'N')
          .maybeSingle(),
      ])

      if (owner && room) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const roomRow = room as {
          room_id: string
          room_nm: string
          entry_fee_pi: number
          entry_expire_dtm: string | null
        }
        const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)

        // 결제 금액이 입장료 이상인지 서버 재검증
        if (Number(payment.amount) + 1e-6 >= Number(roomRow.entry_fee_pi)) {
          // 이미 입장한 경우 중복 삽입 방지
          const { data: existingMbr } = await db
            .from('msg_room_mbr')
            .select('room_mbr_id')
            .eq('room_id', roomRow.room_id)
            .eq('usr_id', ownerRow.id)
            .eq('del_yn', 'N')
            .maybeSingle()

          if (!existingMbr) {
            await db.from('msg_room_mbr').insert({
              room_id: roomRow.room_id,
              usr_id: ownerRow.id,
              mbr_role_cd: 'GUEST',
              expire_dtm: roomRow.entry_expire_dtm,
              regr_id: slug,
              modr_id: slug,
            })

            // 입장 SYSTEM 메시지 브로드캐스트
            const { data: sysMsg } = await db
              .from('msg_msg')
              .insert({
                room_id: roomRow.room_id,
                snd_usr_id: ownerRow.id,
                snd_usr_nm: String(ownerRow.display_name ?? 'user'),
                msg_cont: `🎟️ ${ownerRow.display_name} 님이 이벤트방에 입장했습니다`,
                msg_tp_cd: 'SYSTEM',
                regr_id: slug,
                modr_id: slug,
              })
              .select()
              .single()

            if (sysMsg)
              await broadcastToRoom(roomRow.room_id, 'new_msg', sysMsg)
          }
        }
      }
    } else if (meta?.type === 'STICKER_PACK' && payment.user_uid) {
      // STICKER_PACK: 결제 완료 시 msg_usr_stkr UPSERT (UNIQUE usr_id,pack_id — 중복 구매 안전)
      const packId = String(meta.pack_id ?? '')
      const [{ data: owner }, { data: pack }] = await Promise.all([
        db
          .from('sys_user')
          .select('id, display_name')
          .eq('pi_uid', payment.user_uid)
          .maybeSingle(),
        db
          .from('msg_stkr_pack')
          .select('pack_id, price_pi')
          .eq('pack_id', packId)
          .eq('del_yn', 'N')
          .maybeSingle(),
      ])

      if (owner && pack) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const packRow = pack as { pack_id: string; price_pi: number }
        const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)

        // 결제 금액 서버 재검증 (부동소수 오차 허용)
        if (Number(payment.amount) + 1e-6 >= Number(packRow.price_pi)) {
          await db.from('msg_usr_stkr').upsert(
            {
              usr_id: ownerRow.id,
              pack_id: packRow.pack_id,
              pymnt_id: paymentId,
              del_yn: 'N',
              del_dtm: null,
              regr_id: slug,
              modr_id: slug,
              mod_dtm: new Date().toISOString(),
            },
            { onConflict: 'usr_id,pack_id' },
          )
        }
      }
    } else if (meta?.type === 'MPS_ESCROW' && payment.user_uid) {
      // MPS_ESCROW: 결제 완료 시 주문 PENDING → ESCROW + ESCROW_IN 이력 (TASK-104)
      const orderId = String(meta.order_id ?? '')
      const { data: buyer } = await db
        .from('sys_user')
        .select('id')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      if (buyer && orderId) {
        const buyerRow = buyer as { id: string }
        // 결제 금액이 주문 가격 이상인지 서버 재검증 (부동소수 오차 허용)
        const { data: orderRow } = await db
          .from('mps_order')
          .select('order_id, order_price_pi')
          .eq('order_id', orderId)
          .eq('buyer_id', buyerRow.id)
          .eq('order_st_cd', 'PENDING')
          .eq('del_yn', 'N')
          .maybeSingle()

        if (
          orderRow &&
          Number(payment.amount) + 1e-6 >=
            Number((orderRow as { order_price_pi: number }).order_price_pi)
        ) {
          await markEscrow(orderId, buyerRow.id, txid, Number(payment.amount))

          // 사장님 보이스 주문 알림 — seller:{sellerId} 토픽 broadcast (비블로킹)
          const { data: ord } = await db
            .from('mps_order')
            .select(
              'seller_id, order_mthd_cd, dlvr_addr, order_price_pi, mps_item(item_nm)',
            )
            .eq('order_id', orderId)
            .maybeSingle()
          if (ord) {
            const o = ord as {
              seller_id: string
              order_mthd_cd: string | null
              dlvr_addr: string | null
              order_price_pi: number
              mps_item?: { item_nm?: string } | null
            }
            broadcastToSeller(o.seller_id, 'new_order', {
              order_id: orderId,
              item_nm: o.mps_item?.item_nm ?? '상품',
              price_pi: Number(o.order_price_pi),
              order_mthd_cd: o.order_mthd_cd,
              dlvr_addr: o.dlvr_addr,
            }).catch((e) => console.error('[주문알림] broadcast 실패', e))
          }

          // Telegram 즉시 발송 — cron 대기 없이 결제 완료 시점에 바로 발송(연동된 판매자).
          // 안전망 cron(/api/cron/order-autocomplete)은 이 즉시 발송이 실패/유실된 건만 재시도.
          try {
            await dispatchOrderNotis()
          } catch (e) {
            console.error('[주문알림] Telegram 즉시 발송 실패', e)
          }
        }
      }
    } else if (meta?.type === 'MPS_BOND' && payment.user_uid) {
      // MPS_BOND: 판매자 보증금 1π 예치 — fn_mps_bond_deposit 원자적 적립 (PRD v1.6~1.8)
      const { data: seller } = await db
        .from('sys_user')
        .select('id, display_name')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      // 결제 금액이 예치액(1π) 이상인지 서버 재검증 (부동소수 오차 허용)
      if (seller && Number(payment.amount) + 1e-6 >= BOND_DEPOSIT_PI) {
        const sellerRow = seller as { id: string; display_name: string | null }
        const slug = String(sellerRow.display_name ?? 'user').slice(0, 20)
        await depositBond(sellerRow.id, paymentId, slug)

        // M9: 판매자 보증금 예치 미션 기록 (비블로킹)
        recordUserAction('bond_deposit', sellerRow.id).catch((err) =>
          console.error(`[M9] 미션 기록 실패: ${err.message}`),
        )
      }
    } else if (meta?.type === 'BEAN_CHARGE' && payment.user_uid) {
      // BEAN_CHARGE: Pi 결제 완료 → Bean 내부 적립금 충전 (fn_bean_apply 원자적 적립)
      const beanAmt = Math.floor(Number(meta.bean_amt))
      const { data: owner } = await db
        .from('sys_user')
        .select('id, display_name')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      if (owner && Number.isInteger(beanAmt) && beanAmt >= BEAN_PER_PI) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)
        // 결제 금액(Pi)이 Bean 환산가 이상인지 서버 재검증 (1 Pi = 100 Bean, 부동소수 오차 허용)
        const requiredPi = beanAmt / BEAN_PER_PI
        if (Number(payment.amount) + 1e-6 >= requiredPi) {
          await applyBean({
            usrId: ownerRow.id,
            txnTp: 'CHARGE',
            beanAmt,
            piAmt: Number(payment.amount),
            pymntId: paymentId,
            memo: `Bean ${beanAmt} 충전`,
            regrId: slug,
          })
        }
      }
    }

    // 구글 계정 연동 사용자에게 결제 영수증 이메일 발송 (비동기 — 실패해도 결제 응답에 영향 없음)
    if (payment.user_uid) {
      void (async () => {
        try {
          const { data: u } = await db
            .from('sys_user')
            .select('google_email, display_name')
            .eq('pi_uid', payment.user_uid)
            .maybeSingle()
          if (u?.google_email) {
            await sendPaymentReceipt({
              to: u.google_email,
              displayName: u.display_name ?? u.google_email,
              paymentId,
              amount: payment.amount,
              memo: payment.memo ?? '',
              completedAt: new Date(),
            })
          }
        } catch (e) {
          console.error('결제 영수증 이메일 발송 실패:', e)
        }
      })()
    }

    return NextResponse.json({
      success: true,
      payment,
      room: createdRoom,
      subscription: grantedSubscr,
    })
  } catch {
    return NextResponse.json(
      { error: 'Pi Network API 연결 실패' },
      { status: 502 },
    )
  }
}

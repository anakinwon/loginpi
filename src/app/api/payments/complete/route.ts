import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentReceipt } from '@/lib/email'
import { broadcastToSeller } from '@/lib/realtime-broadcast'
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

    // 레거시 Pi 결제 분기 제거(2026-06-21): CHAT_ROOM_CREATE·EVENT_ROOM_JOIN·STICKER_PACK·CHAT_SUBSCR·PI_TIP
    //   → 카페 생성/입장/스티커/구독/선물은 모두 Bean(SPEND·구독·전송)으로 전환 완료.
    //   현재 Pi 결제 경로는 BEAN_CHARGE·MPS_ESCROW·MPS_BOND 뿐. createdRoom/grantedSubscr는 응답 스키마 호환용 null.
    const createdRoom: Record<string, unknown> | null = null
    const grantedSubscr: Record<string, unknown> | null = null
    const meta = payment.metadata as Record<string, unknown> | null
    if (meta?.type === 'MPS_ESCROW' && payment.user_uid) {
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

          // M2(Bean Token 충전) 미션 기록 (비블로킹) — 충전 완료 시 1회 기록
          recordUserAction('bean_charge', ownerRow.id, { beanAmt }).catch(
            (err) =>
              console.error(`[M2] Bean 충전 미션 기록 실패: ${err.message}`),
          )
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

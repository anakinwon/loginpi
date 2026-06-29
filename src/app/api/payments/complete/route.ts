import { NextRequest, NextResponse, after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentReceipt } from '@/lib/email'
import { broadcastToSeller, broadcastToRoom } from '@/lib/realtime-broadcast'
import { payTipPiReward } from '@/lib/tip-pi-reward'
import { markEscrow } from '@/lib/mps-order'
import { createGroupRoom, createEventRoom } from '@/lib/chat'
import { getRoomFeeBean } from '@/lib/bean-fee'
import { dispatchOrderNotis } from '@/lib/mps-noti'
import { depositBond, BOND_DEPOSIT_PI } from '@/lib/mps-bond'
import { applyBean, BEAN_PER_PI } from '@/lib/bean'
import { recordUserAction } from '@/lib/event'
import { getSubscrPlans } from '@/lib/bean-fee-db'
import {
  findPlan,
  cycleMonths,
  type SubscrProduct,
  type SubscrGrade,
  type SubscrCycle,
} from '@/lib/bean-subscr-plan'
import { withGuard } from '@/lib/api-guard'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

async function handlePOST(request: NextRequest) {
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
    let createdRoom: Record<string, unknown> | null = null
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
    } else if (meta?.type === 'CHAT_SUBSCR' && payment.user_uid) {
      // CHAT_SUBSCR: PI 모드 구독 — Pi 직결제 완료 시 구독 부여(Bean 차감 없이). PRD_24 §0.
      //   클라가 보낸 금액은 불신 — metadata(product/grade/cycle)로 plan 표에서 정가 재계산 후 검증.
      //   fn_pi_subscribe_grant가 pymnt_id 멱등(중복 complete 시 재연장 차단).
      const product = String(meta.product ?? '')
      const grade = String(meta.grade ?? '')
      const cycle = String(meta.cycle ?? '')
      const { data: subUser } = await db
        .from('sys_user')
        .select('id, display_name')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      if (subUser && product && grade && cycle) {
        const u = subUser as { id: string; display_name: string | null }
        const plans = await getSubscrPlans()
        const plan = findPlan(
          plans,
          product as SubscrProduct,
          grade as SubscrGrade,
          cycle as SubscrCycle,
        )
        // 결제 금액(Pi)이 정가(bean_amt÷100) 이상인지 서버 재검증(부동소수 오차 허용)
        if (plan && Number(payment.amount) + 1e-6 >= plan.bean_amt / 100) {
          const slug = String(u.display_name ?? 'user').slice(0, 20)
          await db.rpc('fn_pi_subscribe_grant', {
            p_usr_id: u.id,
            p_prod: product,
            p_grade: grade,
            p_cycle: cycle,
            p_fee_plan_cd: plan.fee_plan_cd,
            p_bean_amt: plan.bean_amt,
            p_months: cycleMonths(cycle as SubscrCycle),
            p_pymnt_id: paymentId,
            p_regr_id: slug,
          })

          // 구독 신청 미션 기록 (비블로킹)
          recordUserAction('subscr_apply', u.id, {
            product,
            grade,
            cycle,
          }).catch((err) =>
            console.error(`[구독] 미션 기록 실패: ${err.message}`),
          )
        }
      }
    } else if (meta?.type === 'CHAT_ROOM_CREATE' && payment.user_uid) {
      // CHAT_ROOM_CREATE: PI 모드 유료 카페 생성 — Pi 결제 완료 시 방 생성. PRD_24 §0.
      //   선결제 후 생성(미결제 무료 방 방지). 방 설정은 metadata로 운반됨.
      //   ⭐멱등: bean_txn(ROOM_CREATE_PI, ref_id=paymentId) 마커로 중복 complete 시 재생성 차단.
      const { data: dup } = await db
        .from('bean_txn')
        .select('txn_id')
        .eq('ref_tp_cd', 'ROOM_CREATE_PI')
        .eq('ref_id', paymentId)
        .maybeSingle()

      const themeCd = String(meta.theme_cd ?? '')
      if (!dup && themeCd) {
        const { data: creator } = await db
          .from('sys_user')
          .select('id, display_name')
          .eq('pi_uid', payment.user_uid)
          .maybeSingle()

        if (creator) {
          const cu = creator as { id: string; display_name: string | null }
          // 금액 검증 — theme 등급으로 생성료 재계산(클라 금액 불신)
          const { data: themeRow } = await db
            .from('msg_theme')
            .select('theme_tp_cd')
            .eq('theme_cd', themeCd)
            .eq('del_yn', 'N')
            .maybeSingle()
          const isPrem =
            (themeRow as { theme_tp_cd?: string } | null)?.theme_tp_cd ===
            'PREMIUM'
          const fee = isPrem ? getRoomFeeBean('CREATE', 'PREMIUM', false) : 0

          if (fee > 0 && Number(payment.amount) + 1e-6 >= fee / 100) {
            const room = await createGroupRoom({
              userId: cu.id,
              displayName: cu.display_name ?? 'user',
              theme_cd: themeCd,
              room_nm: String(meta.room_nm ?? '카페'),
              room_desc: (meta.room_desc as string | null) ?? null,
              is_public_yn: (meta.is_public_yn as 'Y' | 'N') ?? 'Y',
              max_mbr_cnt: Number(meta.max_mbr_cnt ?? 50),
              expr_dtm: (meta.expr_dtm as string | null) ?? null,
            })
            createdRoom = room as unknown as Record<string, unknown>

            // 멱등 마커 + 회계(Pi 결제 흔적). bean_amt=0(Bean 미차감), pi_amt=결제 Pi
            await db.from('bean_txn').insert({
              usr_id: cu.id,
              txn_tp_cd: 'SPEND',
              bean_amt: 0,
              bal_amt: 0,
              pi_amt: fee / 100,
              ref_tp_cd: 'ROOM_CREATE_PI',
              ref_id: paymentId,
              memo_txt: `Pi 카페 생성료 (${String(meta.room_nm ?? '')})`,
              regr_id: 'SYSTEM',
              modr_id: 'SYSTEM',
            })

            // LBS 좌표 저장(비블로킹, best-effort) — 클라가 metadata로 보낸 위치
            const mlat = meta.lat
            const mlng = meta.lng
            if (typeof mlat === 'number' && typeof mlng === 'number') {
              void db
                .from('msg_room')
                .update({ latd_crd: mlat, lngt_crd: mlng })
                .eq('room_id', (room as { room_id: string }).room_id)
                .then(
                  () => {},
                  () => {},
                )
            }
            // M3: PREMIUM Cafe 생성 미션 기록 (비블로킹)
            if (isPrem) {
              recordUserAction('premium_cafe_create', cu.id, {
                theme_cd: themeCd,
              }).catch((err) =>
                console.error(`[M3] 미션 기록 실패: ${err.message}`),
              )
            }
          }
        }
      }
    } else if (meta?.type === 'EVENT_ROOM_CREATE' && payment.user_uid) {
      // EVENT_ROOM_CREATE: PI 모드 유료 이벤트방 생성 — 결제 완료 시 생성. PRD_24 §0.
      //   멱등: bean_txn(ROOM_CREATE_PI, ref_id=paymentId) 마커(그룹 생성과 공유, paymentId 고유).
      const { data: dup } = await db
        .from('bean_txn')
        .select('txn_id')
        .eq('ref_tp_cd', 'ROOM_CREATE_PI')
        .eq('ref_id', paymentId)
        .maybeSingle()

      if (!dup && meta.theme_cd && meta.entry_expire_dtm) {
        const { data: creator } = await db
          .from('sys_user')
          .select('id, display_name')
          .eq('pi_uid', payment.user_uid)
          .maybeSingle()

        if (creator) {
          const cu = creator as { id: string; display_name: string | null }
          // 금액 검증 — EVENT 생성료 재계산(클라 금액 불신)
          const fee = getRoomFeeBean('CREATE', 'EVENT', false)
          if (fee > 0 && Number(payment.amount) + 1e-6 >= fee / 100) {
            const room = await createEventRoom({
              userId: cu.id,
              displayName: cu.display_name ?? 'user',
              theme_cd: String(meta.theme_cd),
              room_nm: String(meta.room_nm ?? '이벤트'),
              room_desc: (meta.room_desc as string | null) ?? null,
              is_public_yn: (meta.is_public_yn as 'Y' | 'N') ?? 'Y',
              max_mbr_cnt: Number(meta.max_mbr_cnt ?? 100),
              entry_fee_pi: Number(meta.entry_fee_pi ?? 0),
              entry_expire_dtm: String(meta.entry_expire_dtm),
            })
            createdRoom = room as unknown as Record<string, unknown>

            await db.from('bean_txn').insert({
              usr_id: cu.id,
              txn_tp_cd: 'SPEND',
              bean_amt: 0,
              bal_amt: 0,
              pi_amt: fee / 100,
              ref_tp_cd: 'ROOM_CREATE_PI',
              ref_id: paymentId,
              memo_txt: `Pi 이벤트방 생성료 (${String(meta.room_nm ?? '')})`,
              regr_id: 'SYSTEM',
              modr_id: 'SYSTEM',
            })

            const mlat = meta.lat
            const mlng = meta.lng
            if (typeof mlat === 'number' && typeof mlng === 'number') {
              void db
                .from('msg_room')
                .update({ latd_crd: mlat, lngt_crd: mlng })
                .eq('room_id', (room as { room_id: string }).room_id)
                .then(
                  () => {},
                  () => {},
                )
            }
            // M5: 이벤트방 생성 미션 기록 (비블로킹)
            recordUserAction('event_cafe_create', cu.id, {
              roomId: (room as { room_id: string }).room_id,
            }).catch((err) =>
              console.error(`[M5] 미션 기록 실패: ${err.message}`),
            )
          }
        }
      }
    } else if (meta?.type === 'STICKER_PACK' && payment.user_uid) {
      // STICKER_PACK: PI 모드 스티커팩 구매 — 결제 완료 시 소유권 부여. PRD_24 §0.
      //   소유권은 msg_usr_stkr UNIQUE(usr_id,pack_id) upsert로 멱등 / 회계 중복은 STICKER_PACK_PI 마커로 차단.
      const packId = String(meta.pack_id ?? '')
      const { data: dup } = await db
        .from('bean_txn')
        .select('txn_id')
        .eq('ref_tp_cd', 'STICKER_PACK_PI')
        .eq('ref_id', paymentId)
        .maybeSingle()

      if (!dup && packId) {
        const { data: buyer } = await db
          .from('sys_user')
          .select('id, display_name')
          .eq('pi_uid', payment.user_uid)
          .maybeSingle()
        const { data: pack } = await db
          .from('msg_stkr_pack')
          .select('pack_id, price_bean, is_dflt_yn')
          .eq('pack_id', packId)
          .eq('use_yn', 'Y')
          .eq('del_yn', 'N')
          .maybeSingle()

        if (buyer && pack) {
          const b = buyer as { id: string; display_name: string | null }
          const p = pack as { price_bean: number; is_dflt_yn: string }
          const fee = Number(p.price_bean)
          const isFree = p.is_dflt_yn === 'Y' || fee === 0
          // 금액 검증 — 팩 가격 재계산(클라 금액 불신)
          if (!isFree && Number(payment.amount) + 1e-6 >= fee / 100) {
            const slug = String(b.display_name ?? 'user').slice(0, 20)
            const nowIso = new Date().toISOString()
            await db.from('msg_usr_stkr').upsert(
              {
                usr_id: b.id,
                pack_id: packId,
                del_yn: 'N',
                del_dtm: null,
                regr_id: slug,
                modr_id: slug,
                mod_dtm: nowIso,
              },
              { onConflict: 'usr_id,pack_id' },
            )
            await db.from('bean_txn').insert({
              usr_id: b.id,
              txn_tp_cd: 'SPEND',
              bean_amt: 0,
              bal_amt: 0,
              pi_amt: fee / 100,
              ref_tp_cd: 'STICKER_PACK_PI',
              ref_id: paymentId,
              memo_txt: 'Pi 스티커팩 구매',
              regr_id: 'SYSTEM',
              modr_id: 'SYSTEM',
            })
          }
        }
      }
    } else if (meta?.type === 'PI_TIP' && payment.user_uid) {
      // PI_TIP: 카페방 Pi 선물 — 보내는 사람 U2A 결제 완료 → 앱이 받는 사람에 A2U 송금. PRD_24 §0.
      //   멱등: tip_pi_payout_log UNIQUE(payment_id). 송금은 after() 즉시 + cron 재시도.
      const recipientId = String(meta.recipient_id ?? '')
      const roomId = String(meta.room_id ?? '')
      const beanAmount = Number(meta.bean_amount ?? 0)
      const piAmt = beanAmount / 100

      const { data: dup } = await db
        .from('tip_pi_payout_log')
        .select('tip_pi_log_id')
        .eq('payment_id', paymentId)
        .maybeSingle()

      // 금액 검증 — metadata bean_amount로 환산한 Pi 이상 결제했는지(클라 금액 불신)
      if (
        !dup &&
        recipientId &&
        piAmt > 0 &&
        Number(payment.amount) + 1e-6 >= piAmt
      ) {
        const { data: sender } = await db
          .from('sys_user')
          .select('id, display_name')
          .eq('pi_uid', payment.user_uid)
          .maybeSingle()
        const { data: rcpt } = await db
          .from('sys_user')
          .select('id, display_name')
          .eq('id', recipientId)
          .maybeSingle()

        if (sender && rcpt) {
          const s = sender as { id: string; display_name: string | null }
          const r = rcpt as { id: string; display_name: string | null }
          // A2U 송금 멱등 로그(PENDING) + 즉시 송금 시도(실패 시 cron 재시도)
          await db.from('tip_pi_payout_log').insert({
            payment_id: paymentId,
            sender_id: s.id,
            recipient_id: r.id,
            pi_amt: piAmt,
            room_id: roomId,
            reward_st_cd: 'PENDING',
            regr_id: 'SYSTEM',
            modr_id: 'SYSTEM',
          })
          after(() => payTipPiReward(paymentId))

          // TIP_NOTI 알림 + 실시간 브로드캐스트
          const senderNm = s.display_name ?? 'user'
          const recipientNm = r.display_name ?? 'user'
          const { data: tipMsg } = await db
            .from('msg_msg')
            .insert({
              room_id: roomId,
              snd_usr_id: s.id,
              snd_usr_nm: senderNm,
              msg_cont: `${senderNm} 님이 ${recipientNm} 님께 ${piAmt} Pi를 선물했습니다`,
              msg_tp_cd: 'TIP_NOTI',
              regr_id: 'SYSTEM',
              modr_id: 'SYSTEM',
            })
            .select()
            .single()
          if (tipMsg) {
            void broadcastToRoom(roomId, 'new_msg', tipMsg).catch(() => {})
            recordUserAction('bean_send', s.id, {
              room_id: roomId,
              recipient_id: r.id,
            }).catch(() => {})
          }
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

export const POST = withGuard(handlePOST)

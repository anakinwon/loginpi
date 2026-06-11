import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentReceipt } from '@/lib/email'
import { broadcastToRoom } from '@/lib/realtime-broadcast'
import { canSendTip } from '@/lib/chat-auth'
import { markEscrow } from '@/lib/mps-order'
import { depositBond, BOND_DEPOSIT_PI } from '@/lib/mps-bond'

const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'

export async function POST(request: NextRequest) {
  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'PI_API_KEY 미설정 — Pi Developer Portal에서 발급 후 환경변수에 추가하세요' },
      { status: 500 }
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
    return NextResponse.json({ error: 'paymentId와 txid가 필요합니다' }, { status: 400 })
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
        { status: res.status }
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
    let grantedSubscr: Record<string, unknown> | null = null
    const meta = payment.metadata as Record<string, unknown> | null
    if (meta?.type === 'CHAT_ROOM_CREATE' && payment.user_uid) {
      const { data: owner } = await db
        .from('sys_user')
        .select('id, display_name')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      if (owner) {
        const slug = String((owner as Record<string, unknown>).display_name ?? 'user').slice(0, 20)
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
          await db.from('msg_room_mbr').insert({
            room_id: (room as Record<string, unknown>).room_id,
            usr_id: (owner as Record<string, unknown>).id,
            mbr_role_cd: 'OWNER',
            regr_id: slug,
            modr_id: slug,
          })
          createdRoom = room as Record<string, unknown>
        }
      }
    } else if (meta?.type === 'CHAT_SUBSCR' && payment.user_uid) {
      // CHAT_SUBSCR: 결제 완료 시 구독 시작/갱신 (msg_subscr UPSERT — usr_id UNIQUE)
      const planCd = String(meta.plan_cd ?? '')
      const [{ data: owner }, { data: plan }] = await Promise.all([
        db.from('sys_user').select('id, display_name').eq('pi_uid', payment.user_uid).maybeSingle(),
        db
          .from('msg_subscr_plan')
          .select('plan_cd, price_pi, mth_cnt')
          .eq('plan_cd', planCd)
          .eq('use_yn', 'Y')
          .eq('del_yn', 'N')
          .maybeSingle(),
      ])

      if (owner && plan) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const planRow = plan as { plan_cd: string; price_pi: number; mth_cnt: number }
        const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)

        // 결제 금액이 플랜 가격 이상인지 서버 재검증 (클라이언트 amount 조작 방지, 부동소수 오차 허용)
        if (Number(payment.amount) + 1e-6 >= planRow.price_pi) {
          const months = planRow.mth_cnt > 0 ? planRow.mth_cnt : 1
          const now = new Date()
          const expire = new Date(now)
          expire.setMonth(expire.getMonth() + months)

          const { data: subscr } = await db
            .from('msg_subscr')
            .upsert(
              {
                usr_id: ownerRow.id,
                plan_cd: planRow.plan_cd,
                pymnt_id: paymentId,
                start_dtm: now.toISOString(),
                expire_dtm: expire.toISOString(),
                auto_renew_yn: 'Y',
                del_yn: 'N',
                del_dtm: null,
                regr_id: slug,
                modr_id: slug,
                mod_dtm: now.toISOString(),
              },
              { onConflict: 'usr_id' }
            )
            .select()
            .single()

          grantedSubscr = (subscr as Record<string, unknown>) ?? null
        }
      }
    } else if (meta?.type === 'PI_TIP' && payment.user_uid) {
      // PI_TIP: 결제 완료 시 TIP_NOTI 메시지 삽입 + 실시간 브로드캐스트
      const [{ data: sender }, { data: recipient }] = await Promise.all([
        db.from('sys_user').select('id, display_name').eq('pi_uid', payment.user_uid).maybeSingle(),
        db.from('sys_user').select('id, display_name').eq('id', String(meta.recipient_id ?? '')).maybeSingle(),
      ])

      if (sender && recipient && meta.room_id) {
        const senderRow = sender as { id: string; display_name: string | null }
        const recipientRow = recipient as { id: string; display_name: string | null }
        const roomId = String(meta.room_id)

        // 결제 완료 시점 권한 재검증 + 발신자·수신자 방 멤버십 검증
        const [tipAllowed, { data: senderMbr }, { data: recipientMbr }] = await Promise.all([
          canSendTip(senderRow.id),
          db.from('msg_room_mbr').select('room_id').eq('room_id', roomId).eq('usr_id', senderRow.id).eq('del_yn', 'N').maybeSingle(),
          db.from('msg_room_mbr').select('room_id').eq('room_id', roomId).eq('usr_id', recipientRow.id).eq('del_yn', 'N').maybeSingle(),
        ])

        if (tipAllowed && senderMbr && recipientMbr) {
          const slug = String(senderRow.display_name ?? 'user').slice(0, 20)
          const { data: tipMsg } = await db
            .from('msg_msg')
            .insert({
              room_id: roomId,
              snd_usr_id: senderRow.id,
              snd_usr_nm: String(senderRow.display_name ?? 'user'),
              msg_cont: `💰 ${senderRow.display_name} 님이 ${recipientRow.display_name} 님께 π${payment.amount} Tip을 보냈습니다`,
              msg_tp_cd: 'TIP_NOTI',
              regr_id: slug,
              modr_id: slug,
            })
            .select()
            .single()

          if (tipMsg) await broadcastToRoom(roomId, 'new_msg', tipMsg)
        }
      }
    } else if (meta?.type === 'EVENT_ROOM_JOIN' && payment.user_uid) {
      // EVENT_ROOM_JOIN: 결제 완료 시 GUEST로 이벤트방 입장 처리
      const roomIdStr = String(meta.room_id ?? '')
      const [{ data: owner }, { data: room }] = await Promise.all([
        db.from('sys_user').select('id, display_name').eq('pi_uid', payment.user_uid).maybeSingle(),
        db.from('msg_room').select('room_id, room_nm, entry_fee_pi, entry_expire_dtm').eq('room_id', roomIdStr).eq('del_yn', 'N').maybeSingle(),
      ])

      if (owner && room) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const roomRow = room as { room_id: string; room_nm: string; entry_fee_pi: number; entry_expire_dtm: string | null }
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

            if (sysMsg) await broadcastToRoom(roomRow.room_id, 'new_msg', sysMsg)
          }
        }
      }
    } else if (meta?.type === 'FEATURE_ADDON' && meta?.feature_cd === 'BADGE_UPGRADE' && payment.user_uid) {
      // BADGE_UPGRADE: 결제 완료 시 배지 강화 (특별 디자인 + 카페 이름 옆 상시 표시)
      const themeCd = String(meta.theme_cd ?? '')
      const { data: owner } = await db
        .from('sys_user')
        .select('id, display_name')
        .eq('pi_uid', payment.user_uid)
        .maybeSingle()

      // 강화 가격 0.1 Pi 서버 재검증 (부동소수 오차 허용)
      if (owner && themeCd && Number(payment.amount) + 1e-6 >= 0.1) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)
        await db
          .from('msg_usr_badge')
          .update({
            upgr_yn: 'Y',
            upgr_dtm: new Date().toISOString(),
            pymnt_id: paymentId,
            modr_id: slug,
            mod_dtm: new Date().toISOString(),
          })
          .eq('usr_id', ownerRow.id)
          .eq('theme_cd', themeCd)
          .eq('del_yn', 'N')
      }
    } else if (meta?.type === 'STICKER_PACK' && payment.user_uid) {
      // STICKER_PACK: 결제 완료 시 msg_usr_stkr UPSERT (UNIQUE usr_id,pack_id — 중복 구매 안전)
      const packId = String(meta.pack_id ?? '')
      const [{ data: owner }, { data: pack }] = await Promise.all([
        db.from('sys_user').select('id, display_name').eq('pi_uid', payment.user_uid).maybeSingle(),
        db.from('msg_stkr_pack').select('pack_id, price_pi').eq('pack_id', packId).eq('del_yn', 'N').maybeSingle(),
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
          Number(payment.amount) + 1e-6 >= Number((orderRow as { order_price_pi: number }).order_price_pi)
        ) {
          await markEscrow(orderId, buyerRow.id, txid, Number(payment.amount))
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
      }
    } else if (meta?.type === 'PI_BET' && payment.user_uid) {
      // PI_BET: 결제 완료 시 베팅 참가 INSERT + BET_NOTI 발송 (TASK-071)
      const betId = String(meta.bet_id ?? '')
      const optnNo = Number(meta.optn_no)
      const [{ data: owner }, { data: bet }] = await Promise.all([
        db.from('sys_user').select('id, display_name').eq('pi_uid', payment.user_uid).maybeSingle(),
        db
          .from('msg_bet')
          .select('bet_id, room_id, bet_titl, bet_amt_pi, bet_st_cd, close_dtm, crtr_usr_id')
          .eq('bet_id', betId)
          .eq('del_yn', 'N')
          .maybeSingle(),
      ])

      if (owner && bet && Number.isInteger(optnNo) && optnNo >= 1) {
        const ownerRow = owner as { id: string; display_name: string | null }
        const betRow = bet as {
          bet_id: string
          room_id: string
          bet_titl: string
          bet_amt_pi: number
          bet_st_cd: string
          close_dtm: string | null
          crtr_usr_id: string
        }

        // 베팅 생성자는 자신의 베팅에 참가 불가 — 결과 조작 인센티브 차단
        // 선택 옵션 실존 여부 DB 재검증 — Pi SDK 메타데이터는 공격자 제어 입력
        if (ownerRow.id !== betRow.crtr_usr_id) {
          const { data: optnRow } = await db
            .from('msg_bet_optn')
            .select('optn_no')
            .eq('bet_id', betRow.bet_id)
            .eq('optn_no', optnNo)
            .eq('del_yn', 'N')
            .maybeSingle()

          if (optnRow) {
            const slug = String(ownerRow.display_name ?? 'user').slice(0, 20)
            const stillOpen =
              betRow.bet_st_cd === 'OPEN' &&
              (!betRow.close_dtm || new Date(betRow.close_dtm) > new Date())

            // 결제 금액이 베팅 참가비 이상인지 서버 재검증
            if (stillOpen && Number(payment.amount) + 1e-6 >= Number(betRow.bet_amt_pi)) {
              // UNIQUE(bet_id, usr_id) — 중복 참가는 insert 에러로 자연 차단
              const { error: entryError } = await db.from('msg_bet_entry').insert({
                bet_id: betRow.bet_id,
                usr_id: ownerRow.id,
                optn_no: optnNo,
                bet_amt_pi: betRow.bet_amt_pi,
                pymnt_id: paymentId,
                regr_id: slug,
                modr_id: slug,
              })

              if (!entryError) {
                const { data: betMsg } = await db
                  .from('msg_msg')
                  .insert({
                    room_id: betRow.room_id,
                    snd_usr_id: ownerRow.id,
                    snd_usr_nm: String(ownerRow.display_name ?? 'user'),
                    msg_cont: `🎲 ${ownerRow.display_name} 님이 "${betRow.bet_titl}" 베팅에 π${betRow.bet_amt_pi} 참가했습니다`,
                    msg_tp_cd: 'BET_NOTI',
                    regr_id: slug,
                    modr_id: slug,
                  })
                  .select()
                  .single()

                if (betMsg) await broadcastToRoom(betRow.room_id, 'new_msg', betMsg)
              }
            }
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

    return NextResponse.json({ success: true, payment, room: createdRoom, subscription: grantedSubscr })
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }
}

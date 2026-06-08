import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendPaymentReceipt } from '@/lib/email'

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

    // CHAT_ROOM_CREATE: 결제 완료 시 그룹 채팅방 생성
    let createdRoom: Record<string, unknown> | null = null
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
            room_nm: String(meta.room_nm ?? '채팅방'),
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

    return NextResponse.json({ success: true, payment, room: createdRoom })
  } catch {
    return NextResponse.json({ error: 'Pi Network API 연결 실패' }, { status: 502 })
  }
}

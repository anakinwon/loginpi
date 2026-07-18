import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  escapeHtml,
  isTelegramEnabled,
  sendTelegramMessage,
} from '@/lib/telegram'

// 메인넷 등재 승인 감지 프로브 cron — A2U(App-to-User) 개방 여부를 매일 1회 검사.
// 배경(2026-07-16): 등재 "제출"은 별도 절차 없음(포털 Checklist 10/10=신청 완결, 공식 3소스 확인).
//   승인의 가장 확실한 기술 신호 = A2U 결제 생성이 feature_not_available 없이 성공하는 것.
//   승인 확인 즉시 0순위 런북(환불 sweep 소급·정산 백필 — MAINNET_READINESS 최상단) 실행 필요.
// 안전장치: A2U는 생성→블록체인 제출→완료 3단계이며 돈은 "블록체인 제출" 시에만 이동.
//   프로브는 생성만 시도하고 성공 시 즉시 취소 → 실제 송금 0. approve/complete 절대 호출 금지.
// ⭐하트비트 설계(2026-07-18 마스터): OPEN(🚨긴급)뿐 아니라 CLOSED(📡대기)·ERROR(⚠️이상)도
//   매일 텔레그램 발송 — "무소식"이 '미승인'인지 '알람 고장'인지 모호해지는 문제 제거.
//   매일 아침 반드시 1건이 도착하며, 안 오면 그 자체가 감시 체계 이상 신호다.
const PI_PAYMENTS_URL = 'https://api.minepi.com/v2/payments'
const PROBE_AMOUNT = 0.001 // 생성 요청용 명목값 — 취소되므로 송금되지 않음
const LISTING_APPLIED_DT = '2026-07-16' // 등재 신청 완결일 (포털 10/10) — 대기 D+N 표기 기준

// 신청일 기준 경과일 (KST) — D+0=신청 당일
function daysSinceApplied(): number {
  const kstNow = Date.now() + 9 * 3600_000
  const applied = Date.parse(`${LISTING_APPLIED_DT}T00:00:00Z`)
  return Math.max(0, Math.floor((kstNow - applied) / 86400_000))
}

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 운영 전용 게이트 — LISTING_MODE는 운영(cafepi)에만 true.
  // staging은 테스트넷이라 A2U가 원래 열려 있어 상시 오탐 → 반드시 차단.
  if (process.env.NEXT_PUBLIC_LISTING_MODE !== 'true') {
    return NextResponse.json({ ok: true, disabled: true })
  }

  const apiKey = process.env.PI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'no_api_key' },
      { status: 500 },
    )
  }

  // 프로브 대상 uid + 알림 수신처 = 최고 권한 계정 (신규 env·테이블 불요)
  // ⚠️ 운영 DB 실측(2026-07-16): role 최고값은 'ADMIN'(MASTER 행 없음) — 겸용 조회 필수.
  const db = getSupabaseAdmin()
  const { data: master } = await db
    .from('sys_user')
    .select('pi_uid, tlgm_chat_id')
    .in('role', ['MASTER', 'ADMIN'])
    .eq('del_yn', 'N')
    .not('pi_uid', 'is', null)
    .order('role', { ascending: false }) // MASTER > ADMIN 우선
    .limit(1)
    .maybeSingle()
  const masterRow = master as {
    pi_uid: string | null
    tlgm_chat_id: number | null
  } | null
  if (!masterRow?.pi_uid) {
    return NextResponse.json(
      { ok: false, error: 'master_not_found' },
      { status: 500 },
    )
  }

  // A2U 생성 프로브
  const createRes = await fetch(PI_PAYMENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payment: {
        amount: PROBE_AMOUNT,
        memo: 'listing probe',
        metadata: {
          probe: 'A2U_OPEN_CHECK',
          probed_at: new Date().toISOString(),
        },
        uid: masterRow.pi_uid,
      },
    }),
  })
  const bodyText = await createRes.text()

  if (createRes.ok) {
    // ✅ 개방 감지 — 생성 성공. 즉시 취소해 미완결 pending 잔류·송금을 차단.
    let cancelled = false
    try {
      const paymentId = (JSON.parse(bodyText) as { identifier?: string })
        .identifier
      if (paymentId) {
        const cancelRes = await fetch(
          `${PI_PAYMENTS_URL}/${paymentId}/cancel`,
          { method: 'POST', headers: { Authorization: `Key ${apiKey}` } },
        )
        cancelled = cancelRes.ok
      }
    } catch {
      // 취소 실패해도 완료(complete) 전이라 송금 없음 — 다음 프로브에서 pending 오류로 드러남
    }

    let notified = false
    if (masterRow.tlgm_chat_id && isTelegramEnabled()) {
      const sent = await sendTelegramMessage(
        masterRow.tlgm_chat_id,
        '🚨 <b>Pi 메인넷 A2U 개방 감지 — 등재 승인 신호!</b>\n\n' +
          'A2U 결제 생성이 성공했습니다 (프로브 결제는 즉시 취소됨 · 송금 0).\n' +
          '지금 즉시 <b>0순위 런북</b>을 실행하세요:\n' +
          '① Pi Browser Ecosystem에서 PyCafé 노출 확인\n' +
          '② 환불 sweep 자동 소급 확인(30일 윈도우) + 미정산 백필(/api/admin/store/settle)\n' +
          '③ 아소카 세션에 "등재 승인 확인" 보고 → 잔여 런북 수행\n\n' +
          '정본: docs/MAINNET_READINESS_CHECKLIST.md 최상단',
      )
      notified = sent.ok
    }
    console.info(
      `[cron/a2u-probe] 🚨 A2U OPEN 감지 — cancelled=${cancelled} notified=${notified}`,
    )
    return NextResponse.json({ ok: true, a2u: 'OPEN', cancelled, notified })
  }

  if (bodyText.includes('feature_not_available')) {
    // 미개방(승인 전) — 정상 대기. 매일 상태 알람(하트비트) 발송.
    let notified = false
    if (masterRow.tlgm_chat_id && isTelegramEnabled()) {
      const sent = await sendTelegramMessage(
        masterRow.tlgm_chat_id,
        `📡 <b>메인넷 등재 일일 점검 — 승인 대기 중 (D+${daysSinceApplied()})</b>\n\n` +
          'A2U 미개방(feature_not_available) — 아직 승인 전 정상 상태입니다.\n' +
          '개방이 감지되는 즉시 🚨 긴급 알람과 0순위 런북 안내가 발송됩니다.\n\n' +
          '(이 점검 알람이 하루라도 안 오면 감시 체계 이상 — 아소카에게 확인 요청)',
      )
      notified = sent.ok
    }
    console.info('[cron/a2u-probe] CLOSED (feature_not_available) — 승인 대기')
    return NextResponse.json({ ok: true, a2u: 'CLOSED', notified })
  }

  // 예상 밖 응답 — 키/시드 회귀·pending 잔류 등 가능. ⚠️알람으로 즉시 노출(무통지 폐기).
  let notified = false
  if (masterRow.tlgm_chat_id && isTelegramEnabled()) {
    const sent = await sendTelegramMessage(
      masterRow.tlgm_chat_id,
      `⚠️ <b>메인넷 프로브 이상 응답 (HTTP ${createRes.status})</b>\n\n` +
        `<code>${escapeHtml(bodyText.slice(0, 200))}</code>\n\n` +
        '키/시드 회귀·pending 잔류 등 가능 — Vercel 로그 확인 필요.',
    )
    notified = sent.ok
  }
  console.error(
    `[cron/a2u-probe] ERROR (${createRes.status}): ${bodyText.slice(0, 300)}`,
  )
  return NextResponse.json({
    ok: true,
    a2u: 'ERROR',
    status: createRes.status,
    detail: bodyText.slice(0, 300),
    notified,
  })
}

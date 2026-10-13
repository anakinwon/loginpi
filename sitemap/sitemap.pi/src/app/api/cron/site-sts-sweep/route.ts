// 사용료 상태 자동 전이 크론 — GET /api/cron/site-sts-sweep (Vercel cron */5, Authorization: Bearer CRON_SECRET). PRD_USAGE_FEE_STATE §6
//  순서 : ① IN_USE→USED(use_end 경과, bulk) → ② USED·SUSPENDED→EXPIRED(use_end + 재등록 창 경과, bulk) → ③ PAID→IN_USE(pay_dtm + 지연 경과, RPC 건별)
//         → ④ APPLYING 미결제 반려(aply_dtm + 결제 기한 경과 AND pymnt_id IS NULL, 건별 : 원장 APPROVED 가 있으면 Pi 조회 → txid 없을 때만 cancel → 성공 시 원장 CANCELED, 실패·txid 있음은 건너뜀)
//  fail-closed : CRON_SECRET 미설정이면 401(실행 안 함) — 운영 등록은 P8 에서 PAID 탭 1회 검토 뒤. 모든 UPDATE 는 현재 상태 조건부(멱등). 타이머는 sys_cfg(src/lib/cfg.ts)
//  @pi/guard 미적용 : 크론 요청은 Origin 없음·고정 UA 라 Bearer 비밀값이 유일한 게이트. 회차당 반려 상한 REJECT_MAX
import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { db, dbRoute } from '@/lib/api'
import { getCfg } from '@/lib/cfg'
import {
  cancelPiPayment,
  getPiPayment,
  markPaymentCanceled,
  SITE_REG,
} from '@/lib/payments'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ACTOR = 'SYSTEM'
const REJECT_MAX = 20
const START_MAX = 50
const TIME_BUDGET_MS = 45_000 // maxDuration 60s 안에서 Pi API 왕복(건당 최대 2회·8초 타임아웃)을 멈추는 선
const hoursAgo = (now: number, h: number) =>
  new Date(now - h * 3_600_000).toISOString()

interface SweepResult {
  used: number
  expired: number
  started: string[]
  startFailed: { site_id: string; code: string }[]
  rejected: string[]
  skipped: { site_id: string; why: string }[]
}

export const GET = dbRoute(async (req: NextRequest) => {
  // Bearer 상수시간 비교 — 이 라우트는 Origin·rate limit 가드가 없어 비밀값이 유일한 게이트
  const secret = process.env.CRON_SECRET
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || given.length !== want.length || !timingSafeEqual(given, want))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const cfg = await getCfg()
  const now = Date.now()
  const r: SweepResult = {
    used: 0,
    expired: 0,
    started: [],
    startFailed: [],
    rejected: [],
    skipped: [],
  }

  // ① IN_USE → USED : 사용 종료 경과(자사 영구 = use_end_dtm NULL 은 제외)
  {
    const { data, error } = await db()
      .from('site_mst')
      .update({ site_sts_cd: 'USED', modr_id: ACTOR })
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'IN_USE')
      .lte('use_end_dtm', new Date(now).toISOString())
      .select('site_id')
    if (error) throw error
    r.used = data?.length ?? 0
  }

  // ② USED·SUSPENDED → EXPIRED : 사용 종료 + 재등록 우선 창 경과(점유 해제)
  {
    const { data, error } = await db()
      .from('site_mst')
      .update({ site_sts_cd: 'EXPIRED', modr_id: ACTOR })
      .eq('del_yn', 'N')
      .in('site_sts_cd', ['USED', 'SUSPENDED'])
      .lte('use_end_dtm', hoursAgo(now, cfg.SITE_REAPLY_WINDOW_HOUR))
      .select('site_id')
    if (error) throw error
    r.expired = data?.length ?? 0
  }

  // ③ PAID → IN_USE : 결제 후 지연 경과 — 기간 계산은 RPC 단일 장소(fn_bgn_site_use)
  {
    const { data, error } = await db()
      .from('site_mst')
      .select('site_id')
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'PAID')
      .lte('pay_dtm', hoursAgo(now, cfg.SITE_USE_BGN_DELAY_HOUR))
      .order('pay_dtm')
      .limit(START_MAX)
    if (error) throw error
    for (const s of data ?? []) {
      const { error: e } = await db().rpc('fn_bgn_site_use', {
        p_site_id: s.site_id,
        p_actor: ACTOR,
      })
      if (e) {
        // P0004 요금제 사용기간 결측 — 요금표 수정 전까지 매 회차 실패 목록에 남는다(운영자 확인)
        console.error(
          '[cron/sweep] fn_bgn_site_use',
          s.site_id,
          e.code,
          e.message,
        )
        r.startFailed.push({ site_id: s.site_id, code: e.code ?? 'UNKNOWN' })
      } else r.started.push(s.site_id)
    }
  }

  // ④ APPLYING 미결제 반려 : 결제 기한 경과 AND 사용료 미결제. 진행 중(APPROVED) 원장은 txid 없을 때만 Pi cancel, 아니면 건너뜀
  //  후보 창은 반려 상한의 5배 — 매 회차 건너뛰는 행(txid 보유·Pi 조회 실패)이 선두를 차지해 뒤 후보가 굶는 일을 막고, 반려 건수·시간 예산으로 상한을 센다
  {
    const { data, error } = await db()
      .from('site_mst')
      .select('site_id')
      .eq('del_yn', 'N')
      .eq('site_sts_cd', 'APPLYING')
      .is('pymnt_id', null)
      .lte('aply_dtm', hoursAgo(now, cfg.SITE_PAY_TIMEOUT_HOUR))
      .order('aply_dtm')
      .limit(REJECT_MAX * 5)
    if (error) throw error
    for (const s of data ?? []) {
      if (r.rejected.length >= REJECT_MAX) break
      if (Date.now() - now > TIME_BUDGET_MS) {
        r.skipped.push({ site_id: s.site_id, why: 'time_budget' })
        continue
      }
      const { data: approved, error: aErr } = await db()
        .from('pi_pymnt')
        .select('pymnt_id, usr_id')
        .eq('pymnt_tp_cd', SITE_REG)
        .eq('pymnt_sts_cd', 'APPROVED')
        .eq('del_yn', 'N')
        .eq('meta_val->>site_id', s.site_id)
      if (aErr) throw aErr
      let blocked: string | null = null
      for (const p of approved ?? []) {
        const got = await getPiPayment(p.pymnt_id)
        if (!got.ok) {
          blocked = `pi_get_${got.status}`
          break
        }
        if (got.payment.transaction?.txid) {
          // 서명·전송된 결제 — cancel 금지, complete(미완료 결제 복구)가 마무리한다
          blocked = 'txid_present'
          break
        }
        // Pi 측이 이미 취소된 결제는 cancel 재호출 없이 원장만 정리(approve 라우트와 같은 플래그)
        if (
          !got.payment.status.cancelled &&
          !got.payment.status.user_cancelled
        ) {
          const c = await cancelPiPayment(p.pymnt_id)
          if (!c.ok) {
            blocked = `pi_cancel_${c.status}`
            break
          }
        }
        // 원장 CANCELED 실패 = Pi 취소됐는데 APPROVED 잔존(철회·반려·새 결제 전부 409) → 반려 보류, 다음 회차 재시도(cancelled 플래그로 Pi 재호출 없음)
        if (!(await markPaymentCanceled(p.pymnt_id, p.usr_id, ACTOR))) {
          blocked = 'ledger_update'
          break
        }
      }
      if (blocked) {
        // 운영 경보 — 같은 site_id 가 회차마다 반복되면 수동 복구 대상(OPS_SETUP §6-1)
        console.error('[cron/sweep] reject skipped', s.site_id, blocked)
        r.skipped.push({ site_id: s.site_id, why: blocked })
        continue
      }
      const { data: upd, error: uErr } = await db()
        .from('site_mst')
        .update({
          site_sts_cd: 'REJECTED',
          rjct_rsn_cd: 'PAY_TIMEOUT',
          rjct_rsn_cont: null,
          modr_id: ACTOR,
        })
        .eq('site_id', s.site_id)
        .eq('site_sts_cd', 'APPLYING')
        .is('pymnt_id', null)
        .select('site_id')
        .maybeSingle()
      if (uErr) throw uErr
      if (upd) r.rejected.push(s.site_id)
      else r.skipped.push({ site_id: s.site_id, why: 'state_changed' })
    }
  }

  return NextResponse.json({
    ok: true,
    at: new Date(now).toISOString(),
    cfg,
    ...r,
  })
})

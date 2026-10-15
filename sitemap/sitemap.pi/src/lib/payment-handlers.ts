// sitemap.pi 결제 유형 핸들러(@pi/payments 레지스트리) — SITE_REG 사용료[+반짝임·이펙트 합산] / SITE_SPK 반짝임 단독 / SITE_EFCT 이펙트 단독
//  price : 사이트 소유·상태·미결제·이중 결제·정가 검증(사이트 현재 값 기준, prepare 이후 PATCH 로 바뀌었으면 metadata 와 불일치 → 거부)
//  complete : 원장 COMPLETED + 사이트 결제 기록 RPC(sql/012·013·017, 한 트랜잭션·재호출 멱등)
//  출처 : 기존 src/app/api/payments/{approve,complete}/route.ts 검증·RPC 부분(2026-10-15 이동, 순서·응답 코드 동일)
import 'server-only'
import { NextResponse } from 'next/server'
import type {
  ApproveContext,
  PaymentHandlers,
  PaymentTypeHandler,
} from '@pi/payments'
import type { UserRow } from '@pi/db'
import { apiError, db, dbFail } from './api'
import {
  getEfctFee,
  getRegFee,
  getSpkFee,
  hasOtherApprovedPayment,
  parseSiteEfctMeta,
  parseSiteRegMeta,
  parseSiteSpkMeta,
  SITE_EFCT,
  SITE_REG,
  SITE_SPK,
  type SiteEfctMeta,
  type SiteRegMeta,
  type SiteSpkMeta,
} from './payments'
import {
  PAYABLE_STS,
  pickOwnerSite,
  SPK_PAYABLE_STS,
  type SiteSts,
} from './site'

interface PaySite {
  site_id: string
  site_sts_cd: SiteSts
  plan_cd: string
  pymnt_id: string | null
  own_site_yn: 'Y' | 'N'
  spk_yn: 'Y' | 'N'
  spk_pymnt_id: string | null
  efct_cd: string | null
  efct_pymnt_id: string | null
}

// 결제 대상 사이트(본인 소유·자사 사이트 제외) — 사이트 또는 거부 응답
async function loadPaySite(
  siteId: string,
  { user, reject }: ApproveContext<UserRow>,
): Promise<PaySite | NextResponse> {
  const { data: site, error } = await db()
    .from('site_mst')
    .select(
      'site_id, site_sts_cd, plan_cd, pymnt_id, own_site_yn, spk_yn, spk_pymnt_id, efct_cd, efct_pymnt_id',
    )
    .eq('site_id', siteId)
    .eq('ownr_usr_id', user.id)
    .eq('del_yn', 'N')
    .maybeSingle<PaySite>()
  if (error) return dbFail(error)
  if (!site || site.own_site_yn === 'Y')
    return reject('PAY_SITE_MISMATCH', 400)
  return site
}

// 확정 RPC — P0002 결제 없음/결제자 불일치 · P0003 사이트 불일치·결제 불가 상태·이미 다른 결제 : 운영자 확인 대상
const completeWith =
  (rpc: string): PaymentTypeHandler<UserRow, unknown>['complete'] =>
  async ({ paymentId, txid, user }) => {
    const { data, error } = await db().rpc(rpc, {
      p_pymnt_id: paymentId,
      p_tx_id: txid,
      p_usr_id: user.id,
    })
    if (error) {
      console.error('[payments/complete] RPC', error.code, error.message)
      if (error.code === 'P0002' || error.code === 'P0003')
        return apiError('PAY_SITE_MISMATCH', 409)
      return dbFail(error)
    }
    const site = data as Record<string, unknown> | null
    if (!site?.site_id) return apiError('PAY_SITE_MISMATCH', 409)
    return NextResponse.json({ ok: true, site: pickOwnerSite(site) })
  }

const siteReg: PaymentTypeHandler<UserRow, SiteRegMeta> = {
  parseMeta: parseSiteRegMeta,
  price: async (meta, ctx) => {
    const { payment, reject } = ctx
    const site = await loadPaySite(meta.site_id, ctx)
    if (site instanceof NextResponse) return site
    if (!(PAYABLE_STS as readonly string[]).includes(site.site_sts_cd))
      return reject('INVALID_STATE', 409)
    if (site.pymnt_id && site.pymnt_id !== payment.identifier)
      return reject('PAY_ALREADY_PAID', 409)
    if (meta.plan_cd !== site.plan_cd) return reject('PAY_SITE_MISMATCH', 409)
    if (await hasOtherApprovedPayment(site.site_id, payment.identifier))
      return reject('PAY_ALREADY_PAID', 409)
    const fee = await getRegFee(site.plan_cd)
    if (!fee || fee.pi_amt <= 0) return reject('PAY_NOT_REQUIRED', 409)
    // 합산 포함 여부도 사이트 현재 값과 일치해야 한다(prepare 뒤 반짝임을 끄거나 켠 경우 거부)
    const spk =
      site.spk_yn === 'Y' && !site.spk_pymnt_id
        ? await getSpkFee(site.plan_cd)
        : null
    if ((spk != null ? 'Y' : 'N') !== meta.spk)
      return reject('PAY_SITE_MISMATCH', 409)
    // 합산 이펙트 포함 여부·코드도 현재 값과 일치해야 한다
    const efct =
      site.efct_cd && !site.efct_pymnt_id
        ? await getEfctFee(site.plan_cd)
        : null
    if ((efct != null ? site.efct_cd : undefined) !== meta.efct)
      return reject('PAY_SITE_MISMATCH', 409)
    return fee.pi_amt + (spk ?? 0) + (efct ?? 0)
  },
  complete: completeWith('fn_cmpl_site_reg_pymnt'),
}

const siteSpk: PaymentTypeHandler<UserRow, SiteSpkMeta> = {
  parseMeta: parseSiteSpkMeta,
  // 반짝임 단독 : 사용료 결제 뒤·신청 켜짐·미결제(같은 결제 재시도는 허용)
  price: async (meta, ctx) => {
    const { payment, reject } = ctx
    const site = await loadPaySite(meta.site_id, ctx)
    if (site instanceof NextResponse) return site
    if (
      !(SPK_PAYABLE_STS as readonly string[]).includes(site.site_sts_cd) ||
      (site.site_sts_cd === 'APPLYING' && !site.pymnt_id) ||
      site.spk_yn !== 'Y'
    )
      return reject('INVALID_STATE', 409)
    if (site.spk_pymnt_id && site.spk_pymnt_id !== payment.identifier)
      return reject('PAY_ALREADY_PAID', 409)
    if (
      await hasOtherApprovedPayment(site.site_id, payment.identifier, SITE_SPK)
    )
      return reject('PAY_ALREADY_PAID', 409)
    const spk = await getSpkFee(site.plan_cd)
    if (spk == null) return reject('PAY_NOT_REQUIRED', 409)
    return spk
  },
  // SITE_SPK 는 상태를 바꾸지 않고 spk_* 만 기록(sql/013)
  complete: completeWith('fn_cmpl_site_spk_pymnt'),
}

const siteEfct: PaymentTypeHandler<UserRow, SiteEfctMeta> = {
  parseMeta: parseSiteEfctMeta,
  // 이펙트 단독 : 반짝임 단독과 같은 가드 + 선택 코드 일치
  price: async (meta, ctx) => {
    const { payment, reject } = ctx
    const site = await loadPaySite(meta.site_id, ctx)
    if (site instanceof NextResponse) return site
    if (
      !(SPK_PAYABLE_STS as readonly string[]).includes(site.site_sts_cd) ||
      (site.site_sts_cd === 'APPLYING' && !site.pymnt_id) ||
      site.efct_cd !== meta.efct
    )
      return reject('INVALID_STATE', 409)
    if (site.efct_pymnt_id && site.efct_pymnt_id !== payment.identifier)
      return reject('PAY_ALREADY_PAID', 409)
    if (
      await hasOtherApprovedPayment(site.site_id, payment.identifier, SITE_EFCT)
    )
      return reject('PAY_ALREADY_PAID', 409)
    const efct = await getEfctFee(site.plan_cd)
    if (efct == null) return reject('PAY_NOT_REQUIRED', 409)
    return efct
  },
  complete: completeWith('fn_cmpl_site_efct_pymnt'),
}

export const paymentHandlers: PaymentHandlers<UserRow> = {
  [SITE_REG]: siteReg,
  [SITE_SPK]: siteSpk,
  [SITE_EFCT]: siteEfct,
}

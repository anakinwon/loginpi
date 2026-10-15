// 결제 완료 — POST /api/payments/complete { paymentId, txid }. Pi SDK onReadyForServerCompletion(및 미완료 결제 복구)에서 호출(piFetch).
//  순서(2026-10-11 적대적 검증 반영) : 세션 → **원장 선조회**(결제자 본인·APPROVED/COMPLETED, 아니면 Pi 호출 없이 409) → Pi API complete
//   → fn_cmpl_site_reg_pymnt(p_usr_id 포함, 한 트랜잭션 : pi_pymnt COMPLETED + site_mst APPLYING→PAID 전이·pymnt_id/pay_dtm/plan_cd, sql/012). 재호출 멱등
//  구현 : @pi/payments createPaymentRoutes(공통 흐름) + src/lib/payment-handlers.ts(sitemap 검증·정가·확정 RPC)
import { paymentRoutes } from '@/lib/payment-routes'

export const POST = paymentRoutes.complete

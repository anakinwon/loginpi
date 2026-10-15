// 결제 승인 — POST /api/payments/approve { paymentId }. Pi SDK onReadyForServerApproval 에서 호출(piFetch).
//  순서(2026-10-11 적대적 검증 반영) : 세션 → Pi API **조회(GET)** → metadata(SITE_REG 사용료[+반짝임 합산] / SITE_SPK 반짝임 단독)·결제자 uid·사이트 소유/상태/미결제·이중 결제·정가 검증
//   → pi_pymnt APPROVED 기록 → **그 다음** Pi API approve. approve 뒤에는 사용자 서명·온체인 전송이 진행되므로, 검증 실패는 approve 전에 거부하고 Pi 측도 cancel 한다.
//  Pi approve 가 실패하면 원장을 CANCELED 로 되돌린다(좀비 APPROVED 방지)
//  구현 : @pi/payments createPaymentRoutes(공통 흐름) + src/lib/payment-handlers.ts(sitemap 검증·정가·확정 RPC)
import { paymentRoutes } from '@/lib/payment-routes'

export const POST = paymentRoutes.approve

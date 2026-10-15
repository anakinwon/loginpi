// 결제 취소 — POST /api/payments/cancel { paymentId }. SDK onCancel/onError·서명 전 이탈 복구(txid 없는 미완료 결제)에서 호출(piFetch).
//  본인 APPROVED 결제만, **Pi API cancel 이 성공했을 때만** CANCELED 로 — 서명 뒤 거래 진행 중이면 Pi 가 취소를 거부하므로 원장을 CANCELED 로 바꾸면
//  complete 가 409 로 막혀 "돈은 나갔는데 기록 없음"이 된다(검증 지적). COMPLETED 는 건드리지 않음
//  원장에 없는 결제(approve 전 취소)는 Pi 조회로 결제자(user_uid)가 세션 사용자인지 확인한 뒤에만 Pi cancel — 임의 paymentId 로 타인 결제 취소(IDOR) 차단
//  구현 : @pi/payments createPaymentRoutes(공통 흐름) + src/lib/payment-handlers.ts(sitemap 검증·정가·확정 RPC)
import { paymentRoutes } from '@/lib/payment-routes'

export const POST = paymentRoutes.cancel

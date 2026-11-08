// i18n 에러코드 카탈로그 — admin 통계·조회·운영(analytics/stats/usage/payments/logs/board/
// reports/users/consents/links) 고유 에러 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const ADMIN_STATS_ERRORS = {
  // ── 조회 실패(도메인별 세분) ──
  ADM_USAGE_ANALYTICS_FAILED: '사용 분석 조회 실패',
  ADM_REVENUE_MONTHLY_FAILED: '월별 매출 조회 실패',
  ADM_PERFORMANCE_FAILED: '퍼포먼스 조회 실패',
  ADM_PAGEVIEWS_FAILED: '웹 트래픽 조회 실패',
  ADM_ORDERS_FAILED: '주문 조회 실패',
  ADM_TRANSLATE_STATS_FAILED: '통계 조회 실패',
  ADM_PAYMENTS_LIST_FAILED: '결제 내역 조회 실패',
  ADM_USER_LIST_FAILED: '사용자 목록 조회 실패',
  ADM_LINKS_LIST_FAILED: '연동 현황 조회 실패',
  ADM_BEAN_SPENDERS_FAILED: 'Bean 지출자 집계 실패',
  ADM_BEAN_REVENUE_FAILED: '매출 집계 실패',
  // ── 입력·상태 검증 ──
  ADM_PURGE_TABLE_REQUIRED: '대상 테이블 누락',
  ADM_PURGE_MIN_DAYS: '보존일은 7일 이상의 숫자여야 합니다',
  ADM_USAGE_RESOURCE_CD_REQUIRED: '리소스 코드 누락',
  ADM_USAGE_AMOUNTS_NUMERIC: '한도·사용량은 숫자여야 합니다',
  ADM_INVALID_ROLE: '유효하지 않은 역할입니다',
  ADM_CANNOT_CHANGE_OWN_ROLE: '자신의 역할은 변경할 수 없습니다',
  ADM_ROLE_UPDATE_FAILED: '역할 변경 실패',
  ADM_LINK_TOGGLE_PARAMS_REQUIRED: 'userId와 del_yn(Y|N)이 필요합니다',
  ADM_CANNOT_DEACTIVATE_SELF: '본인 계정은 비활성화할 수 없습니다',
  ADM_LINK_STATUS_UPDATE_FAILED: '상태 변경 실패',
  ADM_REPORT_ID_REQUIRED: 'rpt_id 필요',
  ADM_INVALID_STATUS: '유효하지 않은 상태',
  // ── 결제 환불(A2U) ──
  ADM_A2U_DISABLED: 'A2U 비활성 (PI_API_KEY/PI_WALLET_PRIVATE_SEED 미설정)',
  ADM_PAYMENT_NOT_FOUND: '결제를 찾을 수 없습니다',
  ADM_REFUND_NOT_ELIGIBLE: '환불 대상이 아닙니다 (완료된 결제만 환불 가능)',
  ADM_REFUND_ALREADY: '이미 환불되었거나 처리 중입니다',
  ADM_REFUND_NO_PI_UID: '결제자의 Pi 계정 정보(pi_uid)가 없어 A2U 환불이 불가합니다',
  ADM_REFUND_CONCURRENT: '다른 요청이 이미 환불을 처리 중입니다',
  ADM_A2U_REMIT_FAILED: 'A2U 송금 실패: {message}',
  // ── 통계 재계산 배치 ──
  ADM_STATS_REBUILD_FAILED: '재계산 실패: {dates}',
} as const

// i18n 에러코드 카탈로그 — bean·badge 도메인 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const BEAN_ERRORS = {
  BEAN_MIN_CHARGE: '최소 {min} Bean(1π)부터 정수로 충전할 수 있습니다',
  BEAN_INSUFFICIENT: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
  BEAN_PAYMENT_FAILED: '결제 처리에 실패했습니다',
  BADGE_INFO_REQUIRED: '배지 정보가 필요합니다',
  BADGE_NOT_FOUND: '배지를 찾을 수 없습니다',
  BADGE_ALREADY_UPGRADED: '이미 강화된 배지입니다',
  BADGE_UPGRADE_FAILED: '배지 강화에 실패했습니다',
  BADGE_NOTI_FAILED: '통지 처리 실패',
} as const

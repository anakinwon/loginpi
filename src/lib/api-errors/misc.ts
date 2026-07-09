// i18n 에러코드 카탈로그 — misc 도메인 (campaign·payments·profile·report·consent)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const MISC_ERRORS = {
  CAMP_NOT_FOUND: '캠페인 없음',
  CAMP_CLAIM_FAILED: '보상 처리 실패',
  PAY_PAYMENT_ID_REQUIRED: 'paymentId가 필요합니다',
  PAY_PAYMENT_ID_TXID_REQUIRED: 'paymentId와 txid가 필요합니다',
  PAY_PI_APPROVE_FAILED: 'Pi 승인 실패 ({status}): {detail}',
  PAY_PI_COMPLETE_FAILED: 'Pi 완료 처리 실패 ({status}): {detail}',
  PAY_STATUS_UPDATE_FAILED: '결제 상태 갱신 실패',
  PROFILE_QUERY_FAILED: '프로필 조회 실패',
  PROFILE_SAVE_FAILED: '프로필 저장 실패',
  REPORT_TARGET_INVALID: '신고 대상이 올바르지 않습니다',
  REPORT_REASON_REQUIRED: '신고 사유를 선택해 주세요',
  REPORT_SUBMIT_FAILED: '신고 접수 실패',
  CONSENT_REQUIRED_MISSING:
    '이용약관·개인정보 수집·이용·위치정보 수집·이용 동의는 필수입니다',
  CONSENT_BIRTH_INVALID: '생년월일을 올바르게 입력해 주세요',
  CONSENT_GUARDIAN_REQUIRED:
    '만 {age}세 미만은 법정대리인(보호자)의 동의가 필요합니다',
  CONSENT_LBS_SAVE_FAILED: '위치 동의 저장 실패',
} as const

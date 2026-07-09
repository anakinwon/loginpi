// i18n 에러코드 카탈로그 — event 도메인 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const EVENT_ERRORS = {
  EVENT_ID_REQUIRED: 'event_id는 필수 필드입니다',
  EVENT_PROGRESS_QUERY_FAILED: '미션 진행도 조회 실패',
  EVENT_MISSION_QUERY_FAILED: '미션 조회 실패',
  EVENT_GIFT_QUERY_FAILED: '선물 조회 실패',
  EVENT_GIFT_UPDATE_FAILED: '선물 업데이트 실패',
  EVENT_USER_ID_REQUIRED: 'user_id가 필요합니다',
  EVENT_SENT_YN_INVALID: '발송 여부는 Y 또는 N이어야 합니다',
  EVENT_RANKING_QUERY_FAILED: '랭킹 조회 실패',
} as const

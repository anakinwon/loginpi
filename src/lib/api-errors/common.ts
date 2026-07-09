// i18n 에러코드 카탈로그 — 공통(도메인 횡단) 코드
// 값 = 한국어 폴백 메시지(API 응답 error 필드 원문). 클라이언트는 응답의 code로
// messages/*.json의 apiErrors.<CODE>를 t() 해석한다 (useApiErrorMessage 훅).
// ⚠️ 코드 추가 시 messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const COMMON_ERRORS = {
  AUTH_REQUIRED: '로그인이 필요합니다',
  GOOGLE_AUTH_REQUIRED: 'Google 로그인이 필요합니다',
  GOOGLE_EMAIL_MISSING: 'Google 이메일 정보가 없습니다',
  FORBIDDEN: '권한이 없습니다',
  UPDATE_FORBIDDEN: '수정 권한이 없습니다',
  DELETE_FORBIDDEN: '삭제 권한이 없습니다',
  BAD_REQUEST: '잘못된 요청',
  BAD_REQUEST_BODY: '잘못된 요청 본문',
  BAD_REQUEST_FORMAT: '잘못된 요청 형식입니다',
  INVALID_INPUT: '입력값이 올바르지 않습니다',
  QUERY_FAILED: '조회 실패',
  LIST_FAILED: '목록 조회 실패',
  SAVE_FAILED: '저장 실패',
  UPDATE_FAILED: '수정 실패',
  DELETE_FAILED: '삭제 실패',
  INTERNAL: '데이터 처리 중 오류가 발생했습니다',
  SERVER_CONFIG: '서버 설정 오류입니다. 관리자에게 문의하세요',
  FILE_FIELD_REQUIRED: 'file 필드가 필요합니다',
  FILE_TYPE_NOT_ALLOWED: '허용되지 않은 파일 형식입니다',
  FILE_CONTENT_MISMATCH: '파일 내용이 선언된 형식과 일치하지 않습니다',
  UPLOAD_FAILED: '파일 업로드에 실패했습니다. 잠시 후 다시 시도해주세요',
  PI_API_CONNECT_FAILED: 'Pi Network API 연결 실패',
} as const

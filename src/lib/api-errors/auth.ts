// i18n 에러코드 카탈로그 — auth 도메인 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const AUTH_ERRORS = {
  AUTH_PI_REQUIRED: 'Pi 로그인이 필요합니다',
  AUTH_PI_REQUIRED_REFRESH:
    'Pi 로그인이 필요합니다. 페이지를 새로고침 후 다시 시도해주세요.',
  AUTH_PI_SESSION_INVALID: '유효하지 않은 Pi 세션입니다',
  AUTH_PI_TOKEN_INVALID: 'Pi 토큰 검증 실패',
  AUTH_ACCESS_TOKEN_REQUIRED: 'accessToken이 필요합니다',
  AUTH_DEV_ONLY: '개발 환경에서만 사용 가능합니다',
  AUTH_GOOGLE_CREDENTIALS_MISSING: 'Google 인증 정보가 없습니다',
  AUTH_LINK_CODE_FORMAT: '유효한 6자리 코드를 입력해주세요',
  AUTH_LINK_CODE_INVALID: '유효하지 않은 코드입니다',
  AUTH_LINK_CODE_USED: '이미 사용된 코드입니다',
  AUTH_LINK_CODE_EXPIRED: '코드가 만료됐습니다 (10분 초과)',
  AUTH_LINK_CODE_ATTEMPTS_EXCEEDED:
    '시도 횟수 초과로 코드가 무효화됐습니다. Pi Browser에서 새 코드를 생성하세요.',
  AUTH_LINK_CODE_GEN_FAILED: '코드 생성 실패. 다시 시도해주세요.',
  AUTH_LINK_FAILED: '계정 연동 실패',
} as const

// i18n 에러코드 카탈로그 — voice 도메인 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const VOICE_ERRORS = {
  VOICE_NOT_CAFE_MEMBER: '카페 멤버가 아닙니다',
  VOICE_JOIN_FAILED: '음성채널 입장 실패',
  VOICE_NOT_PARTICIPANT: '음성채널 참여 중이 아닙니다',
  VOICE_HOST_ONLY_MIC_CONTROL: '방장만 보이스챗 권한을 제어할 수 있습니다',
  VOICE_PARTICIPANT_NOT_IN_CHANNEL: '음성채널에 없는 참여자입니다',
  VOICE_MAX_SLOTS: '동시 보이스챗은 멤버 최대 {max}명까지입니다',
  VOICE_INVALID_SIGNAL: '잘못된 시그널 요청',
  VOICE_SLOTS_FULL:
    '보이스챗 정원(멤버 {max}명)이 가득 찼습니다 — 자리가 나면 다시 신청해 주세요',
} as const

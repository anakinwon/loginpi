// i18n 에러코드 카탈로그 — chat 도메인 (값=한국어 폴백 메시지)
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
// 접두: CHAT_(채팅·카페), STKR_(스티커), TIP_(선물·프리셋), BOT_(봇 메시지)
export const CHAT_ERRORS = {
  // 카페 생성·1:1 대화
  CHAT_TARGET_REQUIRED: 'target_usr_id가 필요합니다',
  CHAT_SELF_ROOM: '자기 자신과 카페를 만들 수 없습니다',
  CHAT_TARGET_USER_NOT_FOUND: '상대방 사용자를 찾을 수 없습니다',
  CHAT_PRODUCT_NOT_FOUND: '상품을 찾을 수 없습니다',
  CHAT_SELLER_NOT_PARTY: '상품 판매자가 대화 당사자가 아닙니다',
  CHAT_ROOM_CREATE_FAILED: '카페 생성 실패',

  // 카페 상세·수정
  CHAT_ROOM_NOT_FOUND: '카페를 찾을 수 없습니다',
  CHAT_ROOM_EXPIRED: '기간이 만료된 카페입니다',
  CHAT_EVENT_ENDED: '종료된 이벤트방입니다',
  CHAT_NOT_MEMBER: '카페 멤버가 아닙니다',
  CHAT_ROOM_OWNER_ONLY_EDIT: '방장만 카페를 수정할 수 있습니다',
  CHAT_DM_NOT_EDITABLE: '1:1 카페는 수정할 수 없습니다',
  CHAT_ROOM_NAME_LENGTH: '방 이름은 1~100자여야 합니다',
  CHAT_INVALID_PUBLIC_YN: '공개 여부 값이 올바르지 않습니다',
  CHAT_CAPACITY_RANGE: '정원은 2~1000명이어야 합니다',
  CHAT_PASSWORD_LENGTH: '비밀번호는 4~64자여야 합니다',
  CHAT_NO_CHANGES: '변경할 내용이 없습니다',

  // 직거래 문의방 만기
  CHAT_EXPIRE_PARTY_ONLY: '이 대화의 당사자만 만기할 수 있습니다',
  CHAT_NOT_DIRECT_DEAL_ROOM: '직거래 문의방이 아닙니다',

  // 첨부 업로드
  CHAT_FILE_SIZE_MAX_10MB: '파일 크기는 10MB 이하여야 합니다',

  // 분석 대시보드
  CHAT_ANALYTICS_OWNER_ONLY: '방장만 분석을 볼 수 있습니다',
  CHAT_ANALYTICS_BUSINESS_ONLY: '분석 대시보드는 Business 플랜 전용 기능입니다',

  // Webhook·봇 연동
  CHAT_WEBHOOK_OWNER_ONLY: '방장만 Webhook을 관리할 수 있습니다',
  CHAT_WEBHOOK_BUSINESS_ONLY: 'Webhook은 Business 플랜 전용 기능입니다',
  CHAT_WEBHOOK_MAX: '방당 Webhook은 최대 5개까지 등록할 수 있습니다',
  CHAT_WEBHOOK_CREATE_FAILED: 'Webhook 등록 실패',
  CHAT_WEBHOOK_ID_REQUIRED: 'webhook id가 필요합니다',
  CHAT_WEBHOOK_DELETE_FAILED: 'Webhook 삭제 실패',

  // 테마·마켓플레이스
  CHAT_INVALID_THEME_CD: '유효하지 않은 테마 코드',
  CHAT_THEME_NOT_FOUND: '존재하지 않는 테마입니다',
  CHAT_FOLLOW_FAILED: '팔로우 실패',
  CHAT_UNFOLLOW_FAILED: '언팔로우 실패',

  // 그룹·이벤트방 생성
  CHAT_THEME_REQUIRED: '테마를 선택해주세요',
  CHAT_ROOM_NAME_REQUIRED: '카페 이름을 입력해 주세요',
  CHAT_BEAN_INSUFFICIENT: 'Bean 잔액이 부족합니다. 충전 후 다시 시도하세요.',
  CHAT_EVENT_ROOM_NAME_REQUIRED: '방 이름을 입력해주세요',
  CHAT_EVENT_END_TIME_REQUIRED: '이벤트 종료 시각을 설정해주세요',
  CHAT_EVENT_END_TIME_FUTURE: '이벤트 종료 시각은 현재 시각보다 이후여야 합니다',
  CHAT_EVENT_ROOM_CREATE_FAILED: '이벤트방 생성 실패',

  // 부스트
  CHAT_BOOST_OWNER_ONLY: '카페 방장만 부스트할 수 있습니다',
  CHAT_BOOST_FEE_REQUIRED: '부스트에 {fee} Bean이 필요합니다. 충전 후 다시 시도하세요.',
  CHAT_BOOST_FAILED: '부스트 처리에 실패했습니다',
  CHAT_BOOST_APPLY_FAILED: '부스트 적용에 실패했습니다 (환불 처리됨)',

  // 통화(1:1)
  CHAT_CALL_SELF: '자기 자신에게 통화할 수 없습니다',
  CHAT_CALL_RECIPIENT_NOT_MEMBER: '수신자가 카페 멤버가 아닙니다',
  CHAT_CALL_ALREADY_ACTIVE: '이미 진행 중인 통화가 있습니다',
  CHAT_CALL_CREATE_FAILED: '통화 생성 실패',
  CHAT_CALL_NOT_FOUND: '통화를 찾을 수 없습니다',
  CHAT_CALL_NOT_PARTICIPANT: '통화 참여자가 아닙니다',

  // 번역(PyTranslate™)
  CHAT_TRANSLATE_SUBSCR_ONLY: 'PyTranslate™는 구독 후 이용할 수 있습니다',
  CHAT_INVALID_LOCALE: '유효하지 않은 locale 코드',
  CHAT_MSG_IDS_REQUIRED: 'msg_ids 배열이 필요합니다',
  CHAT_NO_VALID_MSG_ID: '유효한 msg_id가 없습니다',
  CHAT_MSG_NOT_FOUND: '메시지를 찾을 수 없습니다',
  CHAT_TRANSLATE_TEXT_ONLY: '텍스트 메시지만 번역할 수 있습니다',
  CHAT_TRANSLATE_SUBSCRIBER_ONLY: 'PyTranslate™는 구독자 전용입니다',
  CHAT_TRANSLATE_FEE_REQUIRED:
    '번역 1회에 {fee} Bean이 필요합니다. Bean을 충전하거나 PyTranslate™를 구독하세요.',
  CHAT_TRANSLATE_DAILY_LIMIT:
    '오늘 무료 번역 한도(10건)를 모두 사용했습니다. 내일 다시 이용해 주세요.',
  CHAT_TRANSLATE_FAILED: '번역에 실패했습니다',
  CHAT_FEEDBACK_YN: 'feedback은 Y 또는 N이어야 합니다',
  CHAT_TRANSLATE_CACHE_NOT_FOUND: '번역 캐시를 찾을 수 없습니다',

  // 메시지 전송
  CHAT_MSG_RATE_LIMIT: '너무 빠르게 메시지를 전송하고 있습니다',
  CHAT_MSG_CONTENT_REQUIRED: '메시지 내용을 입력해주세요',
  CHAT_STICKER_ID_REQUIRED: '스티커 ID가 필요합니다',
  CHAT_INVALID_MSG_TYPE: '유효하지 않은 메시지 타입',
  CHAT_INVALID_ATTACHMENT_URL: '유효하지 않은 첨부 파일 URL입니다',
  CHAT_AI_MONTHLY_LIMIT: 'AI 월 호출 한도를 초과했습니다',
  CHAT_AI_FEE_REQUIRED: '추가 AI 호출 1회에 {fee} Bean이 필요합니다',
  CHAT_STICKER_NOT_FOUND: '존재하지 않는 스티커입니다',
  CHAT_STICKER_PACK_NOT_FOUND: '스티커 팩을 찾을 수 없습니다',
  CHAT_STICKER_PACK_NOT_OWNED: '이 스티커 팩을 구매하지 않았습니다',
  CHAT_MESSAGE_SEND_FAILED: '메시지 전송 실패',

  // 입장(join)
  CHAT_DM_NO_DIRECT_JOIN: '1:1 카페에는 직접 입장할 수 없습니다',
  CHAT_EVENT_CLOSED: '종료된 이벤트입니다',
  CHAT_PRIVATE_EVENT: '비공개 이벤트입니다',
  CHAT_PRIVATE_ROOM: '비공개 카페입니다',
  CHAT_PASSWORD_MISMATCH: '비밀번호가 일치하지 않습니다',
  CHAT_ROOM_FULL: '카페 정원이 가득 찼습니다',
  CHAT_JOIN_FAILED: '입장 실패',

  // 스티커(제작·구매)
  STKR_CUSTOM_BUSINESS_ONLY: '커스텀 스티커 제작은 Business 플랜 전용 기능입니다',
  STKR_PACK_NAME_REQUIRED: '팩 이름을 입력해주세요 (100자 이내)',
  STKR_PRICE_RANGE: '판매가는 0~10000 Bean 정수여야 합니다',
  STKR_IMAGE_COUNT: '스티커 이미지는 1~{max}개여야 합니다',
  STKR_IMAGE_SIZE_MAX: '스티커 이미지는 1장당 2MB 이하여야 합니다',
  STKR_IMG_TYPE_NOT_ALLOWED: '허용되지 않은 이미지 형식입니다 (png/jpg/gif/webp)',
  STKR_MAX_PACKS: '커스텀 팩은 최대 10개까지 만들 수 있습니다',
  STKR_PACK_CREATE_FAILED: '팩 생성 실패',
  STKR_IMAGE_UPLOAD_FAILED: '스티커 이미지 업로드에 실패했습니다',
  STKR_REGISTER_FAILED: '스티커 등록 실패',
  STKR_PACK_NOT_FOUND: '존재하지 않는 스티커 팩입니다',
  STKR_FREE_PACK_NO_BUY: '무료 팩은 구매가 필요 없습니다',
  STKR_ALREADY_OWNED: '이미 보유한 스티커 팩입니다',

  // 선물(tip)·프리셋
  TIP_PARAMS_REQUIRED: 'room_id, recipient_id, amount가 필요합니다',
  TIP_AMOUNT_RANGE: '1 ~ {max} Bean 사이 정수만 가능합니다',
  TIP_SELF: '자기 자신에게 Bean을 보낼 수 없습니다',
  TIP_RECIPIENT_NOT_FOUND: '수신자를 찾을 수 없습니다',
  TIP_NOT_IN_ROOM: '해당 카페에 참여 중이 아닙니다',
  TIP_RECIPIENT_NOT_IN_ROOM: '수신자가 해당 카페에 없습니다',
  TIP_NO_DIRECT_DEAL_ROOM: '직거래 문의방에서는 선물을 보낼 수 없습니다',
  TIP_TRANSFER_FAILED: 'Bean 전송에 실패했습니다',
  TIP_PRESET_THREE_REQUIRED: '고정 프리셋 3개가 필요합니다',
  TIP_PRESET_VALUE_RANGE: '각 값은 1~{max} 사이 정수여야 합니다',
  TIP_PRESET_ASCENDING:
    '고정 프리셋은 오름차순(작은 값 → 큰 값)으로 서로 달라야 합니다',
  TIP_PRESET_CUSTOM_MAX: '직접입력 상한은 가장 큰 고정 프리셋 이상이어야 합니다',

  // 봇 메시지 전송
  BOT_AUTH_HEADER_REQUIRED: 'Authorization: Bot <api_key> 헤더가 필요합니다',
  BOT_MESSAGE_CONTENT_REQUIRED: '메시지 내용(2000자 이내)을 입력해주세요',
  BOT_INVALID_API_KEY: '유효하지 않은 API Key',
  BOT_RATE_LIMIT: '봇 메시지 전송 한도 초과 (분당 30건)',
  BOT_MESSAGE_SEND_FAILED: '봇 메시지 전송 실패',
} as const

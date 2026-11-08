// i18n 에러코드 카탈로그 — admin 콘텐츠·이벤트 도메인 (값=한국어 폴백 메시지)
// 스티커(msg_stkr) / 이용후기 관리(fbck) / 이벤트 운영(evt) / 캠페인(bean_campaign) 어드민 API.
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const ADMIN_CONTENT_ERRORS = {
  // 공통 (어드민 콘텐츠 횡단)
  ADM_ADMIN_REQUIRED: '관리자 권한이 필요합니다',
  ADM_PROCESS_FAILED: '처리 실패',

  // 스티커 팩·스티커 CRUD
  ADM_STKR_PACK_LIST_FAILED: '스티커팩 목록 조회 실패',
  ADM_STKR_PACK_NAME_REQUIRED: '팩 이름을 입력해주세요 (100자 이내)',
  ADM_STKR_PRICE_RANGE: '가격은 0~100000 Bean 정수여야 합니다',
  ADM_STKR_THEME_NOT_FOUND: '존재하지 않는 테마입니다',
  ADM_STKR_PACK_CREATE_FAILED: '팩 생성 실패',
  ADM_STKR_PACK_NOT_FOUND: '팩을 찾을 수 없습니다',
  ADM_STKR_PACK_NAME_RANGE: '팩 이름은 1~100자여야 합니다',
  ADM_STKR_PACK_UPDATE_FAILED: '팩 수정 실패',
  ADM_STKR_PACK_DELETE_FAILED: '팩 삭제 실패',
  ADM_STKR_FILE_COUNT: '스티커 이미지는 1~{max}개여야 합니다',
  ADM_STKR_FILE_TOO_LARGE: '스티커 이미지는 1장당 2MB 이하여야 합니다',
  ADM_STKR_IMG_TYPE: '허용되지 않은 이미지 형식입니다 (png/jpg/gif/webp)',
  ADM_STKR_UPLOAD_FAILED: '스티커 이미지 업로드에 실패했습니다',
  ADM_STKR_CREATE_FAILED: '스티커 등록 실패',
  ADM_STKR_NAME_RANGE: '스티커 이름은 1~100자여야 합니다',
  ADM_STKR_SORT_INVALID: '정렬 순서가 올바르지 않습니다',
  ADM_STKR_UPDATE_FAILED: '스티커 수정 실패',
  ADM_STKR_DELETE_FAILED: '스티커 삭제 실패',

  // 이용후기(FBCK) 관리 — 숨김·평가 항목
  ADM_FBCK_ID_REQUIRED: 'fbck_id가 필요합니다',
  ADM_FBCK_HIDE_YN_INVALID: 'hide_yn은 Y 또는 N이어야 합니다',
  ADM_FBCK_HIDE_REASON_REQUIRED: '숨김 처리 시 사유를 입력해 주세요',
  ADM_FBCK_CTGR_LIST_FAILED: '카테고리 조회 실패',
  ADM_FBCK_MODE_REQUIRED: 'mode=categories 또는 ctgr_id 필요',
  ADM_FBCK_ITEM_FIELDS_REQUIRED: 'ctgr_id, item_cd, item_nm은 필수입니다',
  ADM_FBCK_ITEM_CD_FORMAT: '항목 코드는 영문대문자·숫자·_ 1~16자',
  ADM_FBCK_CTGR_NOT_FOUND: '존재하지 않는 카테고리입니다',
  ADM_FBCK_ITEM_CD_DUP: '이미 같은 코드의 항목이 있습니다',
  ADM_FBCK_ITEM_CREATE_FAILED: '항목 추가 실패',
  ADM_FBCK_ITEM_ID_REQUIRED: 'item_id 필요',
  ADM_FBCK_ITEM_NOT_FOUND: '항목을 찾을 수 없습니다',

  // 이벤트 운영 — 제외 대상자·재평가·보상
  ADM_EVT_EXCLUDE_LIST_FAILED: '제외 대상자 조회 실패',
  ADM_EVT_PI_USERNAME_REQUIRED: 'Pi 사용자명을 입력해주세요',
  ADM_EVT_EXCLUDE_ADD_FAILED: '제외 추가 실패',
  ADM_EVT_USER_ID_REQUIRED: '사용자 ID가 필요합니다',
  ADM_EVT_EXCLUDE_REMOVE_FAILED: '제외 해제 실패',
  ADM_EVT_REEVAL_FAILED: '재평가 실패',
  ADM_EVT_NOT_FOUND: '이벤트를 찾을 수 없습니다',
  ADM_EVT_REWARD_INACTIVE: '이 이벤트는 보상이 비활성 상태입니다',

  // 캠페인(bean_campaign) 관리 — 승인·생성·수정
  ADM_CAMP_USR_ID_REQUIRED: 'usr_id가 필요합니다',
  ADM_CAMP_CD_FORMAT:
    '캠페인 코드는 대문자/숫자/_ 2~32자여야 합니다 (예: EVENT_M1)',
  ADM_CAMP_NAME_REQUIRED: '캠페인 이름은 필수입니다',
  ADM_CAMP_REWARD_BEAN_POSITIVE: '건당 보상(reward_bean)은 1 이상 정수여야 합니다',
  ADM_CAMP_MAX_CNT_POSITIVE: '선착순 한도(max_grant_cnt)는 1 이상 정수여야 합니다',
  ADM_CAMP_CD_DUP: '이미 존재하는 캠페인 코드입니다: {cd}',
  ADM_CAMP_CREATE_FAILED: '캠페인 생성 실패',
  ADM_CAMP_CD_REQUIRED: 'campaign_cd가 필요합니다',
  ADM_CAMP_REWARD_BEAN_MIN: 'reward_bean은 1 이상 정수여야 합니다',
  ADM_CAMP_MAX_CNT_MIN: 'max_grant_cnt는 1 이상 정수여야 합니다',
  ADM_CAMP_UPDATE_FAILED: '캠페인 수정 실패',
  ADM_CAMP_ACTION_INVALID: 'action은 approve|reject|create|update 중 하나여야 합니다',
} as const

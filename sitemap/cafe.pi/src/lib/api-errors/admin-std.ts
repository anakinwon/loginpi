// i18n 에러코드 카탈로그 — admin 표준·설정 계열 (값=한국어 폴백 메시지)
// /api/admin/{std,i18n,ui-themes,themes,quick-menu,chat} 고유 에러.
// COMMON_ERRORS와 문구가 다른 것만 여기에 둔다(권한없음·조회/수정/삭제 실패 등은 common 재사용).
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const ADMIN_STD_ERRORS = {
  // 공통(admin 계열 — COMMON과 문구가 달라 별도 코드)
  ADM_MASTER_REQUIRED: 'MASTER 권한이 필요합니다',
  ADM_REGISTER_FAILED: '등록 실패',
  ADM_REQUEST_FAILED: '요청 실패',

  // 데이터 표준(std) — 사전·도메인·용어·승인 큐
  ADM_STD_LOGICAL_PHYSICAL_REQUIRED: '논리명과 물리명은 필수입니다',
  ADM_STD_DOMAIN_FIELDS_REQUIRED:
    '도메인명, 키도메인명, 키도메인물리명은 필수입니다',
  ADM_STD_APV_ENTITY_REQUIRED: 'entity_type, entity_id는 필수입니다',
  ADM_STD_APV_ACTION_INVALID: 'action은 approve 또는 reject여야 합니다',
  ADM_STD_APV_REJECT_REASON_REQUIRED: '반려 사유를 입력해 주세요',
  ADM_STD_APV_NOT_FOUND: '요청을 찾을 수 없습니다',
  ADM_STD_APV_ALREADY_PROCESSED: '이미 처리된 요청입니다',
  ADM_STD_APV_UPDATE_FAILED: '상태 업데이트 실패',

  // 다국어(i18n) — locale 토글·동기화·번역
  ADM_I18N_LOCALE_CD_REQUIRED: 'locale_cd required',
  ADM_I18N_KO_DISABLE_FORBIDDEN: '기본 언어(ko)는 비활성화할 수 없습니다',
  ADM_I18N_KO_SYNC_EXCLUDED: 'ko는 DB→JSON 동기화 대상이 아닙니다',
  ADM_I18N_INVALID_LOCALE: '유효하지 않은 locale입니다',
  ADM_I18N_INVALID_TARGET_LANG: '번역 대상 언어가 잘못됐습니다',
  ADM_I18N_KO_JSON_UNREADABLE: 'ko.json 파일을 읽을 수 없습니다',
  ADM_I18N_KO_JSON_EMPTY: 'ko.json이 비어있습니다',
  ADM_I18N_CRON_SECRET_MISSING:
    'CRON_SECRET이 설정되지 않아 백그라운드 작업을 시작할 수 없습니다',
  ADM_I18N_GEMINI_KEY_MISSING:
    'GEMINI_API_KEY가 설정되지 않았습니다. aistudio.google.com/apikey에서 무료 발급 후 .env.local에 추가하세요.',
  ADM_I18N_TRANSLATE_FAILED: '번역 작업이 실패했습니다. 잠시 후 다시 시도해주세요',

  // 카페 테마(msg_theme) / UI 테마(ui_theme)
  ADM_THEME_CD_FORMAT: '테마 코드는 영문 대문자·숫자·_ 조합 1~20자여야 합니다',
  ADM_THEME_NM_EMOJI_REQUIRED: '테마명과 이모지는 필수입니다',
  ADM_THEME_CD_DUPLICATE: '이미 존재하는 테마 코드입니다(삭제된 코드 포함)',
  ADM_THEME_NAME_LENGTH: '테마명은 1~50자여야 합니다',
  ADM_THEME_NOT_FOUND: '테마를 찾을 수 없습니다',
  ADM_THEME_ACTIVE_DELETE_FORBIDDEN: '활성 테마는 삭제할 수 없습니다',
  ADM_THEME_DEFAULT_DELETE_FORBIDDEN: '기본 테마는 삭제할 수 없습니다',
  ADM_THEME_ACTIVATE_FAILED: '활성화 실패',

  // 챗 Webhook 현황
  ADM_CHAT_WEBHOOK_LIST_FAILED: 'Webhook 목록 조회 실패',
} as const

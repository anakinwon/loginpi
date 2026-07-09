// i18n 에러코드 카탈로그 — admin 경제·운영 계열 (값=한국어 폴백 메시지)
// 대상: src/app/api/admin/{token,store,open-promo,subscriptions,fee-mode,
//        checklist,db-switch,mainnet,deploy,batch,telegram}
// messages/ko.json·en.json apiErrors 네임스페이스에 동일 키 동반 필수.
export const ADMIN_OPS_ERRORS = {
  // 공통 권한 — MASTER 전용 화면(요금·배포·DB 스위치)
  ADM_MASTER_ONLY: '권한이 없습니다(MASTER 전용)',

  // Bean 발행 (token/mint)
  ADM_MINT_AMT_MIN: '발행액(bean_amt)은 1 이상의 정수여야 합니다',
  ADM_MINT_DEST_INVALID: 'dest_wallet은 {wallets} 중 하나여야 합니다',
  ADM_MINT_REASON_REQUIRED: '발행 사유(reason)는 필수입니다',
  ADM_MINT_FAILED: '발행 처리 실패',

  // Bean 수동 조정 (token/adjust)
  ADM_ADJUST_FIELDS_REQUIRED: 'usr_id와 adj_bean(0 제외)은 필수입니다',
  ADM_ADJUST_REASON_INVALID: 'reason은 다음 중 하나여야 합니다: {reasons}',
  ADM_EVIDENCE_URL_TOO_LONG: 'evidence_url이 너무 깁니다 (최대 2048자)',
  ADM_EVIDENCE_URL_PROTOCOL: 'evidence_url은 http(s) URL만 허용합니다',
  ADM_EVIDENCE_URL_INVALID: 'evidence_url이 유효한 URL이 아닙니다',

  // Bean 집계 (token/distribution·revenue)
  ADM_BEAN_DISTRIBUTION_FAILED: 'Bean 분포 집계 실패',
  ADM_REVENUE_FAILED: '매출 집계 실패',

  // 요금제 CRUD (token/fee-plan)
  ADM_FEE_PLAN_ID_REQUIRED: 'fee_plan_id 필수',
  ADM_USE_YN_INVALID: 'use_yn은 Y 또는 N',
  ADM_AMT_BEAN_INVALID: 'amt_bean은 0 이상 정수',
  ADM_NO_FIELDS_TO_UPDATE: '변경할 필드 없음',

  // 매장 카테고리 (store/categories)
  ADM_CTGR_NAME_REQUIRED: '카테고리명은 필수입니다',
  ADM_CTGR_CREATE_FAILED: '등록 실패',
  ADM_CTGR_NOT_FOUND: '카테고리를 찾을 수 없습니다',
  ADM_CTGR_HAS_CHILDREN: '하위 카테고리가 있어 삭제할 수 없습니다',

  // 거리 설정 (store/distance-cfg)
  ADM_DIST_KM_RANGE: 'max_dist_km는 0~200 사이 정수여야 합니다',

  // 오픈기념행사 프로모 토글 (open-promo)
  ADM_PROMO_ACTION_INVALID: "action은 'activate', 'deactivate', 'set-times' 중 하나",
  ADM_PROMO_TIMES_REQUIRED: 'start_dtm 또는 end_dtm 중 최소 하나 필요',

  // 요금 모드 스위치 (fee-mode)
  ADM_FEE_MODE_INVALID: "new_mode는 'BEAN' 또는 'PI'",

  // 운영 체크리스트 (checklist·mainnet)
  ADM_CHK_ID_REQUIRED: 'chk_id가 필요합니다',
  // ADM_INVALID_STATUS는 admin-stats.ts에 정의(공용) — 중복 정의 금지

  // DB 스위치·배포 (db-switch·deploy)
  ADM_DB_TARGET_INVALID: "target은 'staging' 또는 'prod-ro'",
  ADM_DEPLOY_TARGET_INVALID: "target은 'staging' 또는 'production'",

  // 배치 이력 (batch/logs)
  ADM_BATCH_LOG_FAILED: '배치 이력 조회 실패',
} as const
